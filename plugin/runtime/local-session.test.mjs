import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import fs, { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { PROCESS_START_LIMIT, PROCESS_START_TOLERANCE, readState, recordAlive, replacedProcesses, residentLock, stateFiles, WatchFailure, withGuard } from "./local-session.mjs";

const systemError = code => Object.assign(new Error(code), { code });

function guardFixture(t, platform) {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "harness-local-session-"));
  const directory = path.join(root, "harness");
  mkdirSync(directory);
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { ...descriptor, value: platform });
  t.after(() => {
    Object.defineProperty(process, "platform", descriptor);
    t.mock.restoreAll(); syncBuiltinESMExports();
    rmSync(root, { recursive: true });
  });
  return stateFiles(directory);
}

function failFirst(t, name, codes) {
  const original = fs[name], pending = [...codes];
  const mocked = t.mock.method(fs, name, (...args) => {
    if (pending.length) throw systemError(pending.shift());
    return original(...args);
  });
  syncBuiltinESMExports();
  return mocked.mock;
}

it("retries a Windows EPERM from creating a guard that is still being removed and runs the action once", async t => {
  const files = guardFixture(t, "win32");
  const mkdir = failFirst(t, "mkdirSync", ["EPERM", "EACCES", "EBUSY"]);
  let runs = 0;

  const result = await withGuard(files, () => { runs++; return "done"; });

  assert.equal(result, "done");
  assert.equal(runs, 1);
  assert.equal(mkdir.callCount(), 4);
  assert.equal(existsSync(files.guard), false);
});

it("reports a Windows guard creation error that persists until the guard limit as corrupt state with its diagnostic", async t => {
  const files = guardFixture(t, "win32");
  const mkdir = failFirst(t, "mkdirSync", Array(100).fill("EPERM"));
  let clock = 0;
  t.mock.method(performance, "now", () => (clock += 1000));
  let runs = 0;

  await assert.rejects(withGuard(files, () => { runs++; }), error => {
    assert.ok(error instanceof WatchFailure);
    assert.equal(error.code, "corrupt-state");
    assert.deepEqual({ ...error.diagnostic }, { phase: "guard-create", target: "guard", errorKind: "Error", systemCode: "EPERM" });
    return true;
  });
  assert.equal(runs, 0);
  assert.ok(mkdir.callCount() > 1);
  assert.equal(existsSync(files.guard), false);
});

it("fails a guard creation EPERM outside Windows on the first attempt without running the action", async t => {
  const files = guardFixture(t, "linux");
  const mkdir = failFirst(t, "mkdirSync", ["EPERM"]);
  let runs = 0;

  await assert.rejects(withGuard(files, () => { runs++; }), error => error.code === "corrupt-state"
    && error.diagnostic.phase === "guard-create" && error.diagnostic.systemCode === "EPERM");
  assert.equal(runs, 0);
  assert.equal(mkdir.callCount(), 1);
});

it("retries Windows errors while removing its own guard and keeps the action result", async t => {
  const files = guardFixture(t, "win32");
  const unlink = failFirst(t, "unlinkSync", ["EPERM"]);
  const rmdir = failFirst(t, "rmdirSync", ["EBUSY", "ENOTEMPTY"]);

  const result = await withGuard(files, () => "kept");

  assert.equal(result, "kept");
  assert.equal(unlink.callCount(), 2);
  assert.equal(rmdir.callCount(), 3);
  assert.equal(existsSync(files.guard), false);
});

it("propagates a guard removal error outside Windows without retrying", async t => {
  const files = guardFixture(t, "linux");
  const rmdir = failFirst(t, "rmdirSync", ["EBUSY"]);

  await assert.rejects(withGuard(files, () => "lost"), error => error.code === "EBUSY");
  assert.equal(rmdir.callCount(), 1);
});

async function liveHelper(t) {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  t.after(() => { child.kill(); });
  return child.pid;
}
const probe = answer => {
  const calls = [];
  return { calls, starts: pids => { calls.push(pids); if (answer instanceof Error) throw answer; return answer(pids); } };
};
const judged = (record, options) => recordAlive(record, replacedProcesses([record], options));

it("treats a recorded live number whose current process started later than the record as a different process on Windows", async t => {
  const pid = await liveHelper(t), at = new Date(Date.now() - 60_000).toISOString();
  const later = probe(pids => new Map(pids.map(value => [value, Date.parse(at) + PROCESS_START_TOLERANCE + 1000])));
  const near = probe(pids => new Map(pids.map(value => [value, Date.parse(at) + PROCESS_START_TOLERANCE - 1000])));
  const earlier = probe(pids => new Map(pids.map(value => [value, Date.parse(at) - 1000])));

  assert.equal(judged({ pid, nonce: randomUUID(), at }, { platform: "win32", starts: later.starts }), false);
  assert.equal(judged({ pid, nonce: randomUUID(), at }, { platform: "win32", starts: near.starts }), true);
  assert.equal(judged({ pid, nonce: randomUUID(), at }, { platform: "win32", starts: earlier.starts }), true);
  assert.deepEqual([later.calls, near.calls, earlier.calls], [[[pid]], [[pid]], [[pid]]]);
});

it("asks once for all dated live numbers and keeps a verdict only for the records it covers", async t => {
  const first = await liveHelper(t), second = await liveHelper(t), at = new Date(Date.now() - 60_000).toISOString();
  const records = [{ pid: first, nonce: "a", at }, { pid: second, nonce: "b", at }, { pid: second, nonce: "c" }, { pid: 2147483644, nonce: "d", at }];
  const later = probe(pids => new Map(pids.map(value => [value, Date.now()])));

  const replaced = replacedProcesses(records, { platform: "win32", starts: later.starts });

  assert.deepEqual(later.calls, [[first, second]]);
  assert.deepEqual(records.map(record => recordAlive(record, replaced)), [false, false, true, false]);
});

it("keeps a recorded live number alive when the start time query fails, gives no answer or leaves the number out", async t => {
  const pid = await liveHelper(t), at = new Date(Date.now() - 60_000).toISOString();

  for (const answer of [new Error("query failed"), () => new Map(), () => undefined, () => new Map([[pid, Number.NaN]])]) {
    assert.equal(judged({ pid, nonce: randomUUID(), at }, { platform: "win32", starts: probe(answer).starts }), true);
  }
});

it("keeps a record registered after its process started alive with the real start time query", async t => {
  const pid = await liveHelper(t);
  const at = new Date().toISOString();

  assert.equal(judged({ pid, nonce: randomUUID(), at }, { platform: "win32" }), true);
});

it("judges a record without a valid registration time by its number alone and never queries for it", async t => {
  const pid = await liveHelper(t), asked = probe(() => new Map([[pid, Date.now()]]));

  for (const at of [undefined, null, 42, "", "yesterday", { time: 1 }]) {
    assert.equal(judged({ pid, nonce: randomUUID(), ...(at === undefined ? {} : { at }) }, { platform: "win32", starts: asked.starts }), true);
  }
  assert.equal(judged({ pid: 2147483644, nonce: randomUUID() }, { platform: "win32", starts: asked.starts }), false);
  assert.deepEqual(asked.calls, []);
});

it("treats its own number as dead without querying, and never queries outside Windows", async t => {
  const pid = await liveHelper(t), at = new Date(Date.now() - 60_000).toISOString(), asked = probe(pids => new Map(pids.map(value => [value, Date.now()])));

  assert.equal(judged({ pid: process.pid, nonce: randomUUID(), at }, { platform: "win32", starts: asked.starts }), false);
  for (const platform of ["darwin", "linux"]) assert.equal(judged({ pid, nonce: randomUUID(), at }, { platform, starts: asked.starts }), true);
  assert.deepEqual(asked.calls, []);
});

it("reads a lock whose poller and children carry a missing or malformed registration time", t => {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "harness-local-session-"));
  t.after(() => rmSync(root, { recursive: true }));
  const files = stateFiles(path.join(root, "harness"));
  mkdirSync(path.dirname(files.lock));
  const lock = residentLock({ session: randomUUID(), client: "claude", host: "test", at: new Date().toISOString(),
    binding: { root, server: "http://127.0.0.1:9", project: "test", configHash: "a".repeat(64), tokenHash: "b".repeat(64) } });
  lock.poller = { pid: 2147483644, nonce: randomUUID(), at: "not a time" };
  lock.children = [{ pid: 2147483644, nonce: randomUUID(), at: 7 }, { pid: 2147483644, nonce: randomUUID(), at: null }, { pid: 2147483644, nonce: randomUUID() }];
  writeFileSync(files.policy, JSON.stringify({ schemaVersion: 1, session: lock.id, commit: true, propose: false }));
  writeFileSync(files.lock, JSON.stringify(lock));

  assert.deepEqual(readState(files).lock, lock);
});

function fakePowerShell(t) {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "harness-powershell-"));
  const directory = path.join(root, "System32", "WindowsPowerShell", "v1.0"), executable = path.join(directory, "powershell.exe"), calls = path.join(root, "calls");
  mkdirSync(directory, { recursive: true });
  const previous = process.env.SystemRoot;
  process.env.SystemRoot = root;
  t.after(() => { if (previous === undefined) delete process.env.SystemRoot; else process.env.SystemRoot = previous; rmSync(root, { recursive: true }); });
  return {
    answer: body => { writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "$@" > '${calls}'\n${body}\n`); chmodSync(executable, 0o755); },
    calls: () => readFileSync(calls, "utf8").split("\n").filter(Boolean),
  };
}

it("reads the start times PowerShell prints and keeps the numbers alive when PowerShell exceeds its time limit", { skip: process.platform === "win32" }, async t => {
  const pid = await liveHelper(t), at = new Date(Date.now() - 60_000).toISOString(), powershell = fakePowerShell(t);

  powershell.answer(`echo '${pid} ${new Date().toISOString().replace("Z", "1234Z")}'`);
  assert.equal(judged({ pid, nonce: randomUUID(), at }, { platform: "win32" }), false);
  assert.deepEqual(powershell.calls().slice(0, 3), ["-NoProfile", "-NonInteractive", "-Command"]);
  assert.match(powershell.calls()[3], new RegExp(`^Get-Process -Id ${pid} `));

  powershell.answer("exec sleep 30");
  const started = performance.now();
  assert.equal(judged({ pid, nonce: randomUUID(), at }, { platform: "win32" }), true);
  assert.ok(performance.now() - started < PROCESS_START_LIMIT + 5000);
});
