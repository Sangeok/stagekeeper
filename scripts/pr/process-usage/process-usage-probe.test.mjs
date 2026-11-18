import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { mkdirSync, renameSync } from "node:fs";
import { it, mock } from "node:test";
import { probeWorktreeUsage as inspectWorktreeUsage } from "./process-usage-probe.mjs";
import { decodeLsofName, parseProcessInventory, parseLsofCwds, reconcileProcessInventory, parseWindowsObservation } from "./process-usage-protocol.mjs";

const nativePlatform = ["darwin", "win32"].includes(process.platform);

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

