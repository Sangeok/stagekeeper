import assert from "node:assert/strict";
import { it } from "node:test";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { installedWindowsRuntime, prepareNativeRoot, runNativeCommand } from "../plugin/runtime/role-commands.mjs";

it("runs silent IPC forks and diagnoses denied spawns without exposing arguments or changing denial", {
  skip: process.platform !== "win32" || !process.env.STAGEKEEPER_TEST_WINDOWS_RUNTIME || process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1",
  timeout: 30000,
}, async t => {
  const temporaryRoot = realpathSync(tmpdir());
  const base = mkdtempSync(path.join(temporaryRoot, "stagekeeper-spawn-test-"));
  const directory = path.join(base, "command");
  mkdirSync(directory, { recursive: true }); const prepared = await prepareNativeRoot(directory);
  const runtime = installedWindowsRuntime(process.env.STAGEKEEPER_TEST_WINDOWS_RUNTIME);
  assert.equal(createHash("sha256").update(readFileSync(path.join(runtime.directory, "node.exe"))).digest("hex"), runtime.executableSha256);
  copyFileSync(path.join(runtime.directory, "node.exe"), path.join(directory, "runtime/node.exe"));
  copyFileSync(path.join(runtime.directory, "node.exe"), path.join(base, "denied-node.exe"));
  copyFileSync(new URL("./windows-role-readlink.cjs", import.meta.url), path.join(directory, "repo/compat.cjs"));
  copyFileSync(new URL("./windows-role-spawn-diagnostics.cjs", import.meta.url), path.join(directory, "repo/windows-role-spawn-diagnostics.cjs"));
  writeFileSync(path.join(directory, "repo/canary.txt"), "INSIDE_CANARY");
  writeFileSync(path.join(directory, "repo/child.cjs"), `
const assert = require('node:assert/strict'), fs = require('node:fs');
assert.equal(fs.readFileSync('canary.txt', 'utf8'), 'INSIDE_CANARY');
assert.throws(() => fs.readFileSync(${JSON.stringify(path.join(base, "denied-node.exe"))}));
process.send('IPC_READY', error => { if (error) throw error; process.disconnect(); });
`);
  writeFileSync(path.join(directory, "repo/probe.cjs"), `
const assert = require('node:assert/strict'), cp = require('node:child_process');
(async () => {
  const child = cp.fork('child.cjs', [], { silent: true });
  let message;
  child.on('message', value => { message = value; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  assert.equal(code, 0); assert.equal(message, 'IPC_READY');
  let error;
  try {
    const denied = cp.spawn(${JSON.stringify(path.join(base, "denied-node.exe"))}, ['ARGUMENT_CANARY']);
    error = await new Promise(resolve => denied.once('error', resolve));
  } catch (failure) { error = failure; }
  assert.ok(['EPERM', 'EACCES', 'ENOENT'].includes(error.code));
  console.log('ipc-and-denial-passed:' + error.code);
})().catch(error => { console.error(error); process.exitCode = 1; });
`);
  let acknowledged = false;
  t.after(async () => {
    if (!acknowledged) return;
    assert.equal(path.dirname(base), temporaryRoot);
    assert.ok(path.basename(base).startsWith("stagekeeper-spawn-test-"));
    await rm(base, { recursive: true });
  });
  const result = await runNativeCommand({ root: directory, ...prepared,
    command: 'set "STAGEKEEPER_BUILD_DIAGNOSTICS=1" && set "NODE_OPTIONS=--require %CD%\\compat.cjs" && node probe.cjs', cwd: "", timeoutMs: 10000 });
  acknowledged = result.quiescent;
  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.quiescent, true);
  assert.match(result.stdout.trim(), /^ipc-and-denial-passed:(?:EPERM|EACCES|ENOENT)$/);
  assert.doesNotMatch(result.stderr, /ARGUMENT_CANARY|denied-node|stagekeeper-spawn-test/);
  const diagnostic = JSON.parse(result.stderr.trim());
  assert.equal(diagnostic.event, "windows-role-spawn-failed");
  assert.equal(diagnostic.code, result.stdout.trim().split(":")[1]);
  assert.equal(diagnostic.executable, "other");
  assert.equal(diagnostic.currentNode, false);
  assert.equal(diagnostic.stdio.length, 3);
});
