import assert from "node:assert/strict";
import { it } from "node:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { gitRoot, stateFiles, startSession, checkSession, requestStop, releaseSession, registerChild, settleChild } from "../runtime/local-session.mjs";
import { createRoleFiles } from "../runtime/role-files.mjs";
import { snapshotRepository, runNativeCommand, createRoleCommands, installedWindowsRuntime, verifyNativeRuntime } from "../runtime/role-commands.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const temporaryRoot = realpathSync(tmpdir());
function fixture(t) {
  const base = mkdtempSync(path.join(temporaryRoot, "harness-command-test-")), root = path.join(base, "original"), destination = path.join(base, "snapshot");
  for (const dir of [root, path.join(root, "foreign"), path.join(root, ".git"), path.join(root, "src"), destination]) mkdirSync(dir);
  writeFileSync(path.join(base, "external.txt"), "EXTERNAL_CANARY");
  writeFileSync(path.join(root, "src/source.cjs"), "module.exports = 42;\n");
  writeFileSync(path.join(root, "foreign/private.txt"), "FOREIGN_CANARY");
  writeFileSync(path.join(root, ".git/config"), "GIT_CANARY");
  writeFileSync(path.join(root, ".env"), "ENV_CANARY");
  const files = createRoleFiles({ ":root": "deny", [root]: "write", [path.join(root, "foreign")]: "deny", [path.join(root, ".git")]: "read" }, "dev");
  t.after(async () => {
    const relative = path.relative(temporaryRoot, base);
    assert.ok(relative.startsWith("harness-command-test-") && !relative.includes(path.sep));
    await rm(base, { recursive: true });
  });
  return { base, root, destination, files };
}

it("exports a binary-capable snapshot without foreign paths, Git or environment files", async t => {
  const f = fixture(t), binary = Buffer.alloc(1024 * 1024 + 1, 255);
  writeFileSync(path.join(f.root, "src/binary.bin"), binary);
  const snapshot = await snapshotRepository(f.root, f.destination, f.files);
  assert.equal(snapshot.files, 2); assert.equal(snapshot.bytes, binary.length + 21);
  assert.deepEqual(readFileSync(path.join(f.destination, "src/binary.bin")), binary);
  for (const name of ["foreign", ".git", ".env"]) assert.equal(existsSync(path.join(f.destination, name)), false);
  assert.equal(snapshot.omitted.length, 3);
  assert.match(snapshot.snapshotHash, /^[a-f0-9]{64}$/);
});

it("refuses snapshot aliases and honors cancellation before copying source bytes", async t => {
  const f = fixture(t);
  symlinkSync(f.base, path.join(f.root, "alias"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(snapshotRepository(f.root, f.destination, f.files), /alias/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(snapshotRepository(f.root, f.destination, f.files, controller.signal), { name: "AbortError" });
});

it("keeps concurrent binary copies independent and snapshot hashes deterministic", async t => {
  const f = fixture(t);
  const expected = Array.from({ length: 19 }, (_, index) => Buffer.alloc(65536 + index, index));
  for (const [index, bytes] of expected.entries()) writeFileSync(path.join(f.root, `src/data-${index}.bin`), bytes);
  const first = await snapshotRepository(f.root, f.destination, f.files);
  for (const [index, bytes] of expected.entries()) assert.deepEqual(readFileSync(path.join(f.destination, `src/data-${index}.bin`)), bytes);
  const second = await snapshotRepository(f.root, path.join(f.base, "second"), f.files);
  assert.equal(first.snapshotHash, second.snapshotHash); assert.equal(first.files, 20);
});

it("refuses malformed runtime provenance and PM execution", async t => {
  const f = fixture(t);
  writeFileSync(path.join(f.base, "provenance.json"), JSON.stringify({ format: "stagekeeper-windows-node-v1", version: "22.23.3", architecture: "x64", executableSha256: "fake" }));
  assert.throws(() => installedWindowsRuntime(f.base), /provenance/);
  await assert.rejects(createRoleCommands({ root: f.root, agent: "pm", fileBroker: f.files, runtime: {} }), /PM/);
});

async function nativeFixture(t) {
  const f = fixture(t), directory = path.join(f.base, "command");
  await mkdir(directory); for (const name of ["repo", "runtime", "scratch"]) await mkdir(path.join(directory, name));
  writeFileSync(path.join(directory, "repo/read.txt"), "READ_CANARY");
  return { ...f, directory };
}
// Outer host kernel acceptance cannot recursively create another privileged
// launcher inside an already isolated role snapshot. Its skipped status is visible.
const native = { skip: process.platform !== "win32" || process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1", timeout: 120000 };

it("uses actual LPAC file denial and leaves the original repository unchanged", native, async t => {
  const f = await nativeFixture(t), outside = path.join(f.base, "external.txt"), source = path.join(f.root, "src/source.cjs");
  let registered = 0, settled = 0;
  const result = await runNativeCommand({ root: f.directory, command: `type read.txt & echo SCRATCH_WRITE> ..\\scratch\\written.txt & type "${outside}" & echo FORBIDDEN> "${source}" & type ..\\boundary\\aap-only.txt`, cwd: "", timeoutMs: 2000 },
    { onSpawn: async () => registered++, onSettled: async () => settled++ });
  assert.equal(result.quiescent, true); assert.equal(result.status, "exited"); assert.notEqual(result.exitCode, 0);
  assert.equal(registered, 1); assert.equal(settled, 1);
  assert.equal(result.stdout, "READ_CANARY");
  assert.equal(readFileSync(source, "utf8"), "module.exports = 42;\n");
  assert.equal(readFileSync(outside, "utf8"), "EXTERNAL_CANARY");
  assert.match(readFileSync(path.join(f.directory, "scratch/written.txt"), "utf8"), /SCRATCH_WRITE/);
});

it("bounds output and terminates all Job Object children on timeout", native, async t => {
  const f = await nativeFixture(t);
  const result = await runNativeCommand({ root: f.directory, command: 'start /b cmd /d /c "for /l %n in (1,1,100000000) do @rem waiting" & for /l %n in (1,1,100000000) do @rem waiting', cwd: "", timeoutMs: 300 });
  assert.equal(result.status, "timeout"); assert.equal(result.quiescent, true);
  assert.ok(result.maxActiveProcesses >= 2, "A real descendant must have entered the job before cancellation");
  const out = await nativeFixture(t);
  const capped = await runNativeCommand({ root: out.directory, command: 'for /l %n in (1,1,100000) do @echo OUTPUT_CANARY_012345678901234567890123456789', cwd: "", timeoutMs: 5000 });
  assert.equal(capped.status, "output-limit"); assert.equal(capped.outputTruncated, true); assert.equal(capped.quiescent, true);
  assert.ok(Buffer.byteLength(capped.stdout + capped.stderr) <= 49152);
});

it("refuses an external junction and safely cleans a later junction without changing original ACLs", native, async t => {
  const f = await nativeFixture(t), aclScript = path.join(f.base, "read-acl.ps1");
  writeFileSync(aclScript, 'param([string]$Target)\n$ErrorActionPreference = "Stop"\n(Get-Acl -LiteralPath $Target).Sddl\n');
  const powershell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  // A PowerShell 7 PSModulePath (pwsh CI steps) makes Windows PowerShell fail to
  // load Get-Acl and print nothing, so every comparison below would pass vacuously.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "psmodulepath"));
  const originalAcl = () => execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", aclScript, f.root], { encoding: "utf8", windowsHide: true, env }).trim();
  const before = originalAcl(); assert.match(before, /^O:.+D:/);
  const result = await runNativeCommand({ root: f.directory, command: `mklink /J alias "${f.root}" & type alias\\src\\source.cjs`, cwd: "", timeoutMs: 2000 });
  assert.equal(result.quiescent, true); assert.notEqual(result.exitCode, 0); assert.equal(existsSync(path.join(f.directory, "repo/alias")), false);
  assert.equal(result.stdout.includes("module.exports"), false); assert.equal(originalAcl(), before);
  // The kernel denied the role's link creation. Introduce a link only after the
  // termination acknowledgement to independently exercise owner-side deletion.
  // Never grant ACLs recursively over a tree that already contains this link.
  symlinkSync(f.root, path.join(f.directory, "repo/alias"), "junction");
  assert.ok(path.relative(f.base, f.directory) === "command"); await rm(f.directory, { recursive: true });
  assert.equal(readFileSync(path.join(f.root, "src/source.cjs"), "utf8"), "module.exports = 42;\n"); assert.equal(originalAcl(), before);
});

it("retains the real session lock until a stopped command helper acknowledges all child termination", native, async t => {
  const f = await nativeFixture(t), sessionRoot = path.join(f.base, "session");
  execFileSync("git", ["init", sessionRoot], { stdio: "ignore" });
  const location = gitRoot(sessionRoot), files = stateFiles(location.directory);
  const binding = { root: location.root, server: "http://127.0.0.1:1", project: "native-command", configHash: "1".repeat(64), tokenHash: "2".repeat(64) };
  const started = await startSession(files, binding, { client: "codex", commit: false, propose: false });
  let stopTimer, stopTask;
  try {
    const result = await runNativeCommand({ root: f.directory, command: 'start /b cmd /d /c "for /l %n in (1,1,100000000) do @rem waiting" & for /l %n in (1,1,100000000) do @rem waiting', cwd: "", timeoutMs: 10000 }, {
      onSpawn: async child => {
        await registerChild(files, started.session, binding, child);
      },
      onStarted: async () => {
        stopTimer = setTimeout(() => { stopTask = (async () => {
          await requestStop(files, started.session);
          assert.equal((await releaseSession(files, started.session)).code, "quiescence-required");
          assert.equal((await startSession(files, binding, { client: "claude", commit: false, propose: false })).event, "locked");
        })(); void stopTask.catch(() => {}); }, 2000);
      },
      beforeActivate: async () => { assert.equal((await checkSession(files, started.session, binding)).lifecycle, "active"); },
      onSettled: child => settleChild(files, started.session, child),
    });
    await stopTask;
    assert.equal(result.status, "stopped"); assert.equal(result.quiescent, true); assert.ok(result.maxActiveProcesses >= 2);
    assert.equal((await releaseSession(files, started.session)).event, "released");
  } finally { clearTimeout(stopTimer); }
});

it("waits for actual job termination on stop and never activates after an owner refusal", native, async t => {
  const f = await nativeFixture(t), controller = new AbortController(); let settled = 0;
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const result = await runNativeCommand({ root: f.directory, command: 'for /l %n in (1,1,100000000) do @rem waiting', cwd: "", timeoutMs: 10000 }, { signal: controller.signal, onSettled: async () => settled++ });
    assert.equal(result.status, "stopped"); assert.equal(result.quiescent, true); assert.equal(settled, 1);
  } finally { clearTimeout(timer); }
  const refused = await nativeFixture(t); let refusedSettled = 0;
  await assert.rejects(runNativeCommand({ root: refused.directory, command: 'echo FORBIDDEN> write.txt', cwd: "", timeoutMs: 500 }, { beforeActivate: async () => { throw new Error("owner stopped"); }, onSettled: async () => refusedSettled++ }), /owner stopped/);
  assert.equal(refusedSettled, 1); assert.equal(existsSync(path.join(refused.directory, "repo/write.txt")), false);
});

it("never resumes an untrusted command when stop is queued during helper compilation", native, async t => {
  const f = await nativeFixture(t), controller = new AbortController(); let started = 0, timer;
  try {
    const result = await runNativeCommand({ root: f.directory, command: "echo FORBIDDEN> write.txt", cwd: "", timeoutMs: 5000 }, {
      signal: controller.signal,
      onSpawn: async () => { timer = setTimeout(() => controller.abort(), 150); },
      onStarted: async () => started++,
    });
    assert.equal(result.status, "stopped"); assert.equal(result.quiescent, true); assert.equal(started, 0);
    assert.equal(existsSync(path.join(f.directory, "repo/write.txt")), false);
  } finally { clearTimeout(timer); }
});

it("rejects malformed command arguments before preparing or executing a snapshot", async t => {
  const f = fixture(t), broker = await createRoleCommands({ root: f.root, agent: "dev", fileBroker: f.files, runtime: {} });
  try {
    for (const args of [{ command: "echo ready", cwd: "../foreign" }, { command: "echo ready", cwd: "C:\\" }, { command: "echo ready", timeoutMs: 120001 }, { command: "echo ready", token: "secret" }, { command: "\0" }]) await assert.rejects(broker.call("role_command_exec", args));
  } finally { await broker.close(); }
});

const runtimePath = process.env.STAGEKEEPER_TEST_WINDOWS_RUNTIME;
it("passes real pipe/network/path preflight and runs npm test/build on a fresh source snapshot", { skip: process.platform !== "win32" || !runtimePath, timeout: 180000 }, async t => {
  const runtime = installedWindowsRuntime(runtimePath); assert.equal((await verifyNativeRuntime(runtime)).event, "native-command-ready");
  const f = fixture(t);
  writeFileSync(path.join(f.root, "package.json"), JSON.stringify({ scripts: { test: "node --test source.test.cjs", build: "node build.cjs" } }));
  writeFileSync(path.join(f.root, "source.test.cjs"), 'require("node:test")("source",()=>require("node:assert/strict").equal(require("./src/source.cjs"),42));');
  writeFileSync(path.join(f.root, "build.cjs"), 'require("node:fs").writeFileSync("built.txt",String(require("./src/source.cjs"))); console.log("BUILD_READY");');
  const broker = await createRoleCommands({ root: f.root, agent: "dev", fileBroker: f.files, runtime });
  try {
    const first = await broker.call("role_command_exec", { command: "npm run test && npm run build" });
    assert.equal(first.exitCode, 0); assert.equal(first.status, "exited"); assert.match(first.stdout, /BUILD_READY/);
    assert.equal(first.originalRepositoryWrites, false); assert.equal(first.snapshotWrites, "discarded"); assert.equal(existsSync(path.join(f.root, "built.txt")), false);
    // Durations vary by machine; only their contract holds: monotonic laps and a non-negative Stopwatch.
    for (const name of ["snapshotMs", "scratchMs", "runtimeMs", "commandMs"]) assert.ok(Number.isInteger(first.timings[name]) && first.timings[name] >= 0, name);
    assert.ok(Number.isInteger(first.aclMs) && first.aclMs >= 0, "aclMs");
    const source = path.join(f.root, "src/source.cjs"); f.files.call("role_file_write", { path: source, expectedHash: digest(readFileSync(source)), content: "module.exports = 41;\n" });
    const failed = await broker.call("role_command_exec", { command: "npm run test" });
    assert.notEqual(failed.exitCode, 0); assert.notEqual(first.snapshotHash, failed.snapshotHash);
  } finally { await broker.close(); }
});
