import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { mkdirSync, renameSync } from "node:fs";
import { after, before, describe, it, mock } from "node:test";
import { inspectWorktreeUsage } from "./process-usage.mjs";
import { decodeLsofName, parseProcessInventory, parseLsofCwds, reconcileProcessInventory, parseWindowsObservation } from "./process-usage-protocol.mjs";

const nativePlatform = ["darwin", "win32"].includes(process.platform);
const requireNative = process.env.STAGEKEEPER_USAGE_NATIVE_REQUIRED === "1";
const holderFile = fileURLToPath(new URL("./testing/usage-holder.mjs", import.meta.url));

it("decodes lsof names without losing UTF-8 or conflating literal backslashes", () => {
  assert.equal(decodeLsofName("/tmp/한글"), "/tmp/한글");
  assert.equal(decodeLsofName("/tmp/\\xed\\x95\\x9c"), "/tmp/한");
  assert.equal(decodeLsofName("/tmp/literal\\\\path"), "/tmp/literal\\path");
  assert.equal(decodeLsofName("/tmp/line\\nbreak"), "/tmp/line\nbreak");
  for (const name of ["/tmp/caret^A", "/tmp/\\q", "/tmp/\\xff"]) assert.throws(() => decodeLsofName(name));
});

it("parses NUL fields and NL sets and refuses incomplete cwd records", () => {
  const rows = parseLsofCwds(Buffer.from("p12\0\nfcwd\0n/tmp/a\0\np13\0\nfcwd\0n/tmp/b\0\n"));
  assert.equal(rows.get(12), "/tmp/a");
  assert.equal(rows.get(13), "/tmp/b");
  for (const body of ["p12\0\nfcwd\0", "p12\0\nn/tmp/a\0\n", "p12\0\nf1\0n/tmp/a\0\n", "p12\0\nfcwd\0n/tmp/a"]) {
    assert.throws(() => parseLsofCwds(Buffer.from(body)));
  }
});

it("requires stable independent population and every required cwd", () => {
  const inventory = parseProcessInventory(Buffer.from("501 12 S Mon Nov 17 10:00:00 2026\n0 3 S Mon Nov 17 10:00:00 2026\n501 14 Z Mon Nov 17 10:00:00 2026\n"), 501);
  assert.deepEqual([...inventory.keys()], [12]);
  assert.deepEqual(reconcileProcessInventory(inventory, inventory, new Map([[12, "/tmp/a"]])).reasons, []);
  assert.deepEqual(reconcileProcessInventory(inventory, inventory, new Map()).reasons, ["incomplete-coverage"]);
  assert.deepEqual(reconcileProcessInventory(inventory, new Map([[12, "new-start"]]), new Map([[12, "/tmp/a"]])).reasons, ["population-changed"]);
  assert.throws(() => parseProcessInventory(Buffer.from("missing fields"), 501));
});

it("rejects a Windows coverage claim with missing or malformed observations", () => {
  const data = { version: 1, profile: "windows-20348-core7-current-sid-x64-v1", principal: "S-1-5-21", supported: true, unreadableCount: 0, changedCount: 0, expectedCount: 1, afterCount: 1,
    records: [{ pid: 12, startIdentity: "123", cwd: "C:\\work" }] };
  assert.deepEqual(parseWindowsObservation(Buffer.from(JSON.stringify(data))).reasons, []);
  assert.deepEqual(parseWindowsObservation(Buffer.from(JSON.stringify({ ...data, unreadableCount: 1 }))).reasons, ["incomplete-coverage"]);
  assert.throws(() => parseWindowsObservation(Buffer.from(JSON.stringify({ ...data, records: [{ ...data.records[0], cwd: "relative" }] }))));
  assert.throws(() => parseWindowsObservation(Buffer.from("{")));
  assert.throws(() => parseWindowsObservation(Buffer.from(JSON.stringify({ ...data, expectedCount: 0, records: [] }))));
});

it("rejects invalid inputs and pre-cancellation before spawning", async () => {
  const spawn = mock.method(childProcess, "spawn", () => { throw new Error("unexpected spawn"); });
  try {
    for (const options of [null, {}, { worktreePath: "relative" }, { worktreePath: os.tmpdir(), observationTimeoutMs: 0 },
      { worktreePath: os.tmpdir(), observationTimeoutMs: 20001 }, { worktreePath: os.tmpdir(), signal: {} }]) {
      const result = await inspectWorktreeUsage(options);
      assert.deepEqual(result.reasons, ["invalid-input"]);
      assert.equal(result.observer.state, "not-started");
    }
    const result = await inspectWorktreeUsage({ worktreePath: os.tmpdir(), signal: AbortSignal.abort() });
    assert.deepEqual(result.reasons, ["cancelled"]);
    assert.equal(spawn.mock.callCount(), 0);
  } finally { spawn.mock.restore(); }
});

it("reports an unsupported OS without an observer", { skip: nativePlatform }, async () => {
  const result = await inspectWorktreeUsage({ worktreePath: os.tmpdir() });
  assert.deepEqual(result.reasons, ["unsupported-platform"]);
});

function observerDouble(mode, onStarted) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.pid = 1900000000; child.exitCode = null; child.signalCode = null;
  child.kill = signal => {
    if (mode === "unsettled") return false;
    child.signalCode = signal;
    queueMicrotask(() => child.emit("close", null, signal));
    return true;
  };
  queueMicrotask(() => {
    onStarted?.();
    if (mode === "large") child.stdout.write(Buffer.alloc(16 * 1024 * 1024 + 1));
    if (mode === "large-stderr") child.stderr.write(Buffer.alloc(16 * 1024 * 1024 + 1));
    if (mode === "unavailable") { child.emit("error", Object.assign(new Error("private-data"), { code: "ENOENT" })); child.emit("close", -1, null); }
  });
  return child;
}

for (const [mode, expected] of [["unavailable", "observer-unavailable"], ["large", "output-limit"], ["large-stderr", "output-limit"], ["hang", "observation-timeout"]]) {
  it("bounds observer failure: " + mode, { skip: !nativePlatform }, async () => {
    const spawn = mock.method(childProcess, "spawn", () => observerDouble(mode));
    try {
      const result = await inspectWorktreeUsage({ worktreePath: await realpath(os.tmpdir()), observationTimeoutMs: 100 });
      assert.equal(result.status, "unknown");
      assert.deepEqual(result.reasons, [expected]);
      assert.equal(result.observer.state, "settled");
      assert.equal(JSON.stringify(result).includes("private-data"), false);
    } finally { spawn.mock.restore(); }
  });
}

it("cancels its observer and retains unknown even after partial output", { skip: !nativePlatform }, async () => {
  const controller = new AbortController();
  const spawn = mock.method(childProcess, "spawn", () => observerDouble("hang", () => controller.abort()));
  try {
    const result = await inspectWorktreeUsage({ worktreePath: await realpath(os.tmpdir()), signal: controller.signal });
    assert.deepEqual(result.reasons, ["cancelled"]);
    assert.equal(result.observer.state, "settled");
  } finally { spawn.mock.restore(); }
});

it("N10: preserves an unsettled observer instead of waiting without a bound", { skip: !nativePlatform }, async () => {
  const spawn = mock.method(childProcess, "spawn", () => observerDouble("unsettled"));
  try {
    const result = await inspectWorktreeUsage({ worktreePath: await realpath(os.tmpdir()), observationTimeoutMs: 10 });
    assert.deepEqual(result.reasons, ["observer-unsettled"]);
    assert.equal(result.observer.state, "unsettled");
    assert.equal(result.observation.coverageComplete, false);
  } finally { spawn.mock.restore(); }
});

it("does not disguise programming errors as an ordinary unknown result", { skip: !nativePlatform }, async () => {
  const spawn = mock.method(childProcess, "spawn", () => { throw new TypeError("broken adapter"); });
  try {
    await assert.rejects(inspectWorktreeUsage({ worktreePath: await realpath(os.tmpdir()) }), /broken adapter/);
  } finally { spawn.mock.restore(); }
});

function completedObserver(stdout, stderr = "") {
  const child = observerDouble("complete");
  queueMicrotask(() => {
    child.stdout.end(stdout); child.stderr.end(stderr); child.exitCode = 0; child.emit("close", 0, null);
  });
  return child;
}

function protocolResponse(file, args, cwd) {
  if (process.platform === "win32") return JSON.stringify({ version: 1, profile: "windows-20348-core7-current-sid-x64-v1", principal: "S-1-5-21", supported: true,
    unreadableCount: 0, changedCount: 0, expectedCount: 1, afterCount: 1, records: [{ pid: 123, startIdentity: "start", cwd }] });
  if (file === "/bin/ps") return String(process.getuid()) + " 123 S Mon Nov 17 10:00:00 2026\n";
  if (args.includes("-v")) return "revision: 4.91\nlibproc-based\nAnyone can list all files.\n";
  return "p123\0\nfcwd\0n" + cwd + "\0\n";
}

it("N09/N19: does not turn successful partial output and a diagnostic into clear", { skip: !nativePlatform }, async () => {
  const cwd = await realpath(os.tmpdir());
  const spawn = mock.method(childProcess, "spawn", (file, args) => completedObserver(protocolResponse(file, args, cwd), args.includes("-v") ? "" : "PRIVATE-DIAGNOSTIC"));
  try {
    const result = await inspectWorktreeUsage({ worktreePath: cwd });
    assert.deepEqual(result.reasons, ["observer-diagnostic"]);
    assert.equal(result.observation.coverageComplete, false);
    assert.equal(JSON.stringify(result).includes("PRIVATE-DIAGNOSTIC"), false);
  } finally { spawn.mock.restore(); }
});

it("N15: refuses a target directory replaced during an observation", { skip: !nativePlatform }, async () => {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "usage-replacement-"));
  const target = path.join(root, "target"), retained = path.join(root, "retained");
  await mkdir(target);
  let changed = false;
  const spawn = mock.method(childProcess, "spawn", (file, args) => {
    if (!changed) { renameSync(target, retained); mkdirSync(target); changed = true; }
    return completedObserver(protocolResponse(file, args, root));
  });
  try {
    const result = await inspectWorktreeUsage({ worktreePath: target });
    assert.deepEqual(result.reasons, ["target-changed"]);
    assert.equal(result.observation.coverageComplete, false);
  } finally { spawn.mock.restore(); await rm(root, { recursive: true }); }
});

describe("native cwd qualification", { skip: !requireNative ? "Dedicated native gate only" : !nativePlatform ? "Windows/macOS required" : false, concurrency: false }, () => {
  let root, control, target, sibling;
  const children = new Set(), evidence = [];
  const git = (cwd, ...args) => childProcess.execFileSync("git", ["-c", "core.hooksPath=", "-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();
  before(async () => {
    root = await mkdtemp(path.join(await realpath(os.tmpdir()), "stagekeeper-usage-"));
    control = path.join(root, "control"); target = path.join(root, "work 한글"); sibling = path.join(root, "work 한글-sibling");
    await mkdir(control);
    git(control, "init", "--initial-branch=main");
    git(control, "config", "user.name", "Fixture"); git(control, "config", "user.email", "fixture@example.test");
    await writeFile(path.join(control, "sentinel"), "preserve\n");
    git(control, "add", "sentinel"); git(control, "commit", "-m", "fixture");
    git(control, "branch", "dev");
    git(control, "worktree", "add", "-b", "harness/one", target);
    git(control, "worktree", "add", "-b", "harness/two", sibling);
  });
  after(async () => {
    for (const child of children) if (child.connected) { const exited = once(child, "exit"); child.send({ action: "stop" }); await exited; }
    if (root) {
      git(control, "worktree", "remove", target);
      git(control, "worktree", "remove", sibling);
      await rm(root, { recursive: true });
    }
    process.stdout.write("USAGE_QUALIFICATION " + JSON.stringify({ platform: process.platform, architecture: process.arch, release: os.release(), node: process.version, observations: evidence }) + "\n");
  });
  async function hold(cwd, detached = false) {
    const child = childProcess.fork(holderFile, ["SYNTHETIC-SECRET-ARG"], { cwd, detached,
      env: { ...process.env, STAGEKEEPER_USAGE_SECRET: "SYNTHETIC-SECRET-ENV" }, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    children.add(child);
    const [ready] = await once(child, "message");
    assert.equal(ready.pid, child.pid);
    return child;
  }
  async function stop(child) {
    const exited = once(child, "exit"); child.send({ action: "stop" }); await exited; children.delete(child);
  }
  async function observe(name, worktreePath = target) {
    const result = await inspectWorktreeUsage({ worktreePath });
    evidence.push({ name, status: result.status, reasons: result.reasons, ...result.observation, observer: result.observer.state });
    return result;
  }
  it("N01: reports clear only with complete native coverage", async () => {
    const result = await observe("N01");
    assert.equal(result.status, "clear", JSON.stringify(result.observation) + JSON.stringify(result.reasons));
    assert.equal(result.observation.coverageComplete, true);
  });
  it("N02/N03/N07: detects root and descendant holders until both exit", async () => {
    await mkdir(path.join(target, "nested"));
    const one = await hold(target), two = await hold(path.join(target, "nested"));
    try {
      let result = await observe("N02-N03");
      assert.equal(result.status, "busy", JSON.stringify(result.reasons));
      assert.deepEqual(new Set(result.holders.map(row => row.pid)), new Set([one.pid, two.pid]));
      await stop(one);
      result = await observe("N07-one");
      assert.equal(result.status, "busy", JSON.stringify(result.reasons));
      assert.ok(result.holders.some(row => row.pid === two.pid));
      await stop(two);
      assert.equal((await observe("N07-none")).status, "clear");
    } finally { await rm(path.join(target, "nested"), { recursive: true }); }
  });
  it("N04: does not confuse a sibling prefix with this worktree", async () => {
    const child = await hold(sibling);
    try { assert.equal((await observe("N04")).status, "clear"); }
    finally { await stop(child); }
  });
  it("N08/N17: finds another process group without disclosing its arguments or environment", async () => {
    const child = await hold(target, true);
    try {
      const result = await observe("N08-N17");
      assert.equal(result.status, "busy", JSON.stringify(result.reasons));
      assert.ok(result.holders.some(row => row.pid === child.pid));
      assert.equal(JSON.stringify(result).includes("SYNTHETIC-SECRET"), false);
    } finally { await stop(child); }
  });
  it("N05: preserves the parent holder when only its child uses another cwd", async () => {
    const parent = await hold(target);
    const ready = once(parent, "message");
    parent.send({ action: "fork", cwd: sibling });
    await ready;
    try {
      const result = await observe("N05");
      assert.equal(result.status, "busy", JSON.stringify(result.reasons));
      assert.ok(result.holders.some(row => row.pid === parent.pid));
    } finally { await stop(parent); }
  });
  it("N06: includes the calling process if its cwd is the target", async () => {
    const previous = process.cwd();
    try {
      process.chdir(target);
      const result = await observe("N06");
      assert.equal(result.status, "busy", JSON.stringify(result.reasons));
      assert.ok(result.holders.some(row => row.pid === process.pid));
    } finally { process.chdir(previous); }
  });
  it("N15/N17/N18: keeps repository content, refs and sibling state unchanged", async () => {
    const before = git(control, "show-ref"), content = await readFile(path.join(target, "sentinel"));
    const link = path.join(root, "alias");
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
    try {
      assert.equal((await inspectWorktreeUsage({ worktreePath: link })).status, "unknown");
      const result = await observe("N17-N18");
      assert.equal(result.status, "clear", JSON.stringify(result.reasons));
      assert.equal(git(control, "show-ref"), before);
      assert.deepEqual(await readFile(path.join(target, "sentinel")), content);
      assert.deepEqual(await readFile(path.join(sibling, "sentinel")), content);
    } finally { await rm(link); }
  });
});
