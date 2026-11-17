import assert from "node:assert/strict";
import { execFile, fork, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";

const execute = promisify(execFile);
const native = process.env.STAGEKEEPER_USAGE_NATIVE_REQUIRED === "1" && process.platform === "win32";
const executable = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe");
const helper = fileURLToPath(new URL("./testing/windows-directory-probe.ps1", import.meta.url));
const holderFile = fileURLToPath(new URL("./testing/usage-holder.mjs", import.meta.url));
const argumentsFor = (target, mode = "probe") => ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", helper, "-Target", target, "-Mode", mode];

describe("Windows directory observation candidate", { skip: native ? false : "Windows native candidate gate only", concurrency: false }, () => {
  let root, target, nested, sibling, canary;
  const evidence = [], children = new Set();
  const options = () => ({ cwd: root, windowsHide: true, env: { ...process.env, POWERSHELL_TELEMETRY_OPTOUT: "1" } });
  before(async () => {
    root = await mkdtemp(path.join(await realpath(os.tmpdir()), "usage-directory-candidate-"));
    target = path.join(root, "target 한글"); nested = path.join(target, "nested"); sibling = path.join(root, "target 한글-sibling");
    await mkdir(nested, { recursive: true }); await mkdir(sibling);
    canary = path.join(target, "canary");
    await writeFile(canary, "PRESERVE-SYNTHETIC-CONTENT");
  });
  after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) });
        if (child.connected) child.send({ action: "stop" });
        else child.stdin.end("\n");
        await exited;
      }
    }
    if (root) {
      assert.equal(await readFile(canary, "utf8"), "PRESERVE-SYNTHETIC-CONTENT");
      await rm(root, { recursive: true });
    }
    process.stdout.write("WINDOWS_DIRECTORY_CANDIDATE " + JSON.stringify({
      platform: process.platform, architecture: process.arch, release: os.release(), node: process.version,
      observations: evidence,
    }) + "\n");
  });
  async function hold(cwd) {
    const child = fork(holderFile, [], { ...options(), cwd, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    children.add(child);
    const [ready] = await once(child, "message", { signal: AbortSignal.timeout(5000) });
    assert.equal(ready.pid, child.pid);
    assert.equal(path.normalize(ready.cwd).toLowerCase(), path.normalize(cwd).toLowerCase());
    return child;
  }
  async function release(child) {
    const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) });
    if (child.connected) child.send({ action: "stop" });
    else child.stdin.end("\n");
    await exited; children.delete(child);
  }
  async function probe(name, directory, expectedPid) {
    const { stdout, stderr } = await execute(executable, argumentsFor(directory), { ...options(), timeout: 20000, maxBuffer: 1024 * 1024 });
    assert.equal(stderr, "");
    const result = JSON.parse(stdout);
    assert.equal(result.failed, undefined);
    const { pids, ...metadata } = result;
    evidence.push({ name, ...metadata, pidCount: pids.length, oracleIncluded: expectedPid === undefined ? null : pids.includes(expectedPid) });
    return result;
  }
  async function holdHandle(mode) {
    const child = spawn(executable, argumentsFor(target, mode), { ...options(), stdio: ["pipe", "pipe", "pipe"] });
    children.add(child);
    const lines = createInterface({ input: child.stdout });
    let diagnostic = "";
    child.stderr.on("data", value => { diagnostic += value; });
    try {
      const [line] = await once(lines, "line", { signal: AbortSignal.timeout(20000) });
      assert.deepEqual(JSON.parse(line), { ready: true });
      assert.equal(diagnostic, "");
      assert.equal(child.exitCode, null);
      assert.equal(child.signalCode, null);
    } finally { lines.close(); }
    return child;
  }
  it("compares empty, target cwd, and cwd departure using native APIs", async () => {
    assert.equal((await probe("empty", target)).deleteAccessOpened, true);
    const child = await hold(target);
    try {
      const result = await probe("target-cwd", target, child.pid);
      assert.equal(result.deleteAccessOpened, false);
      assert.equal(result.deleteAccessError, 32);
    } finally { await release(child); }
    assert.equal((await probe("departed", target)).deleteAccessOpened, true);
  });
  it("checks whether a parent-only query misses descendant cwd and preserves sibling separation", async () => {
    const child = await hold(nested);
    try {
      const parent = await probe("descendant-via-root", target, child.pid);
      const direct = await probe("descendant-direct", nested, child.pid);
      evidence.push({ name: "parent-only-covers-descendant", deleteProbeDetected: !parent.deleteAccessOpened, pidQueryDetected: parent.pids.includes(child.pid) });
      assert.equal(direct.deleteAccessOpened, false);
      assert.equal(direct.deleteAccessError, 32);
      assert.equal((await probe("sibling", sibling)).deleteAccessOpened, true);
    } finally { await release(child); }
  });
  it("measures whether an ordinary directory handle is indistinguishable from cwd", async () => {
    const child = await holdHandle("hold-directory");
    try {
      const result = await probe("non-cwd-directory-handle", target, child.pid);
      assert.equal(child.exitCode, null);
      assert.equal(result.deleteAccessOpened, false);
      assert.equal(result.deleteAccessError, 32);
    } finally { await release(child); }
  });
  it("measures whether the delete-access probe blocks a new cwd user while its handle is open", async () => {
    const child = await holdHandle("hold-delete");
    let cwdChild;
    try {
      let errorCode = null;
      let cwdMatches = false;
      try {
        const { stdout } = await execute(process.execPath, ["-e", "process.stdout.write(process.cwd())"], { cwd: target, timeout: 5000, windowsHide: true });
        cwdMatches = path.normalize(stdout).toLowerCase() === path.normalize(target).toLowerCase();
      }
      catch (error) { errorCode = error.code; }
      assert.equal(child.exitCode, null);
      evidence.push({ name: "new-cwd-during-delete-probe", errorCode, blocked: errorCode !== null, cwdMatches });
      assert.notEqual(errorCode, "ETIMEDOUT");
      const script = "try { process.chdir(process.argv[1]); process.stdout.write(JSON.stringify({ ok: true, cwd: process.cwd() })); } catch (error) { process.stdout.write(JSON.stringify({ ok: false, errorCode: error.code })); }";
      const changed = JSON.parse((await execute(process.execPath, ["-e", script, target], { ...options(), timeout: 5000 })).stdout);
      evidence.push({ name: "chdir-during-delete-probe", ok: changed.ok, errorCode: changed.errorCode ?? null,
        cwdMatches: changed.ok && path.normalize(changed.cwd).toLowerCase() === path.normalize(target).toLowerCase() });
      if (cwdMatches) {
        cwdChild = await hold(target);
        await probe("cwd-created-during-delete-probe", target, cwdChild.pid);
      }
    } finally {
      if (cwdChild) await release(cwdChild);
      await release(child);
    }
    await execute(process.execPath, ["-e", "process.exit(0)"], { cwd: target, timeout: 5000, windowsHide: true });
    evidence.push({ name: "new-cwd-after-delete-probe", opened: true });
  });
});
