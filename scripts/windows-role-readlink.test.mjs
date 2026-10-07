import assert from "node:assert/strict";
import { it } from "node:test";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { installedWindowsRuntime, prepareNativeRoot, runNativeCommand } from "../plugin/runtime/role-commands.mjs";

it("preserves readlink's non-link semantics, callback validation and denied paths inside actual LPAC", {
  skip: process.platform !== "win32" || !process.env.STAGEKEEPER_TEST_WINDOWS_RUNTIME || process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1",
  timeout: 30000,
}, async t => {
  const temporaryRoot = realpathSync(tmpdir());
  const base = mkdtempSync(path.join(temporaryRoot, "stagekeeper-readlink-test-"));
  const directory = path.join(base, "command");
  mkdirSync(directory, { recursive: true }); const prepared = await prepareNativeRoot(directory);
  const runtime = installedWindowsRuntime(process.env.STAGEKEEPER_TEST_WINDOWS_RUNTIME);
  const executable = path.join(runtime.directory, "node.exe");
  assert.equal(createHash("sha256").update(readFileSync(executable)).digest("hex"), runtime.executableSha256);
  copyFileSync(executable, path.join(directory, "runtime/node.exe"));
  copyFileSync(new URL("./windows-role-readlink.cjs", import.meta.url), path.join(directory, "repo/compat.cjs"));
  const outside = path.join(base, "outside.txt");
  writeFileSync(outside, "OUTSIDE_CANARY");
  writeFileSync(path.join(directory, "repo/regular.txt"), "INSIDE_CANARY");
  writeFileSync(path.join(directory, "repo/probe.cjs"), `
const assert = require('node:assert/strict'), fs = require('node:fs');
const errorCode = code => error => error.code === code;
(async () => {
  assert.throws(() => fs.readlinkSync('regular.txt'), errorCode('EINVAL'));
  assert.throws(() => fs.readlinkSync(Buffer.from('regular.txt')), errorCode('EINVAL'));
  await assert.rejects(fs.promises.readlink('regular.txt'), errorCode('EINVAL'));
  await assert.rejects((await import('node:fs/promises')).readlink('regular.txt'), errorCode('EINVAL'));
  await new Promise((resolve, reject) => fs.readlink('regular.txt', { encoding: 'buffer' }, error => {
    try { assert.equal(error.code, 'EINVAL'); resolve(); } catch (e) { reject(e); }
  }));
  assert.throws(() => fs.readlink('regular.txt'), errorCode('ERR_INVALID_ARG_TYPE'));
  const outside = ${JSON.stringify(outside)};
  assert.throws(() => fs.readlinkSync(outside), error => ['EPERM', 'EACCES'].includes(error.code));
  await assert.rejects(fs.promises.readlink(outside), error => ['EPERM', 'EACCES'].includes(error.code));
  assert.throws(() => fs.readFileSync(outside));
  assert.equal(fs.readFileSync('regular.txt', 'utf8'), 'INSIDE_CANARY');
  console.log('readlink-compatibility-and-denials-passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
`);
  let acknowledged = false;
  t.after(async () => {
    if (!acknowledged) return;
    assert.equal(path.dirname(base), temporaryRoot);
    assert.ok(path.basename(base).startsWith("stagekeeper-readlink-test-"));
    await rm(base, { recursive: true });
  });
  const result = await runNativeCommand({ root: directory, ...prepared,
    command: 'set "NODE_OPTIONS=--require %CD%\\compat.cjs" && node probe.cjs', cwd: "", timeoutMs: 10000 });
  acknowledged = result.quiescent;
  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.quiescent, true);
  assert.equal(result.stdout.trim(), "readlink-compatibility-and-denials-passed");
  assert.equal(readFileSync(outside, "utf8"), "OUTSIDE_CANARY");
});
