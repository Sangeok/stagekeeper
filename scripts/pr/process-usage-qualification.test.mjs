import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { once } from "node:events";
import { mkdirSync, renameSync } from "node:fs";
import { mkdtemp, mkdir, readFile, realpath, rm, rmdir, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it, mock } from "node:test";
import { probeWorktreeUsage as inspectWorktreeUsage } from "./process-usage-probe.mjs";
import { inspectWorktreeUsage as inspectRuntimeUsage } from "./process-usage.mjs";

const nativePlatform = ["darwin", "win32"].includes(process.platform);
const mode = process.env.STAGEKEEPER_USAGE_QUALIFICATION;
const nativeSelected = mode === "all" || mode === "macos" && process.platform === "darwin";
const holderFile = fileURLToPath(new URL("./testing/usage-holder.mjs", import.meta.url));

describe("native cwd qualification", { skip: !nativeSelected ? "Explicit native qualification only" : !nativePlatform ? "Windows/macOS required" : false, concurrency: false }, () => {
  let root, control, target, sibling;
  const children = new Set(), evidence = [];
  const git = (cwd, ...args) => childProcess.execFileSync("git", ["-c", "core.hooksPath=", "-C", cwd, ...args], { encoding: "utf8", windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }).trim();
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
    if (!children.has(child)) return;
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
    } finally {
      await stop(one); await stop(two);
      await rm(path.join(target, "nested"), { recursive: true });
    }
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
      if (process.platform === "darwin") {
        const [pid, group, state] = childProcess.execFileSync("/bin/ps", ["-o", "pid=,pgid=,stat=", "-p", String(child.pid)], { encoding: "utf8" }).trim().split(/\s+/);
        assert.equal(Number(pid), child.pid);
        assert.equal(Number(group), child.pid);
        assert.ok(state.includes("s"));
        evidence.push({ name: "N08-session", independentSessionLeader: true });
      }
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
  it("N09/N19: preserves unknown after a native observer permission denial", { skip: process.platform !== "darwin" }, async () => {
    const holder = await hold(target), spawn = childProcess.spawn;
    const policy = "(version 1)(allow default)(deny process-info*)";
    assert.equal(childProcess.execFileSync("/usr/bin/sandbox-exec", ["-p", policy, "/bin/echo", "allowed-control"], { encoding: "utf8" }).trim(), "allowed-control");
    assert.equal((await observe("N09-unrestricted")).status, "busy");
    let restricted, exitCode;
    const interposed = mock.method(childProcess, "spawn", (file, args, options) => {
      if (file !== "/usr/sbin/lsof" || args.includes("-v")) return spawn(file, args, options);
      restricted = spawn("/usr/bin/sandbox-exec", ["-p", policy, file, ...args], options);
      restricted.once("exit", code => { exitCode = code; });
      return restricted;
    });
    try {
      const result = await observe("N09-native-permission");
      assert.equal(result.status, "unknown");
      assert.equal(result.observation.coverageComplete, false);
      assert.equal(result.observationPerformed, true);
      assert.equal(result.observer.state, "settled");
      assert.ok(restricted?.pid);
      assert.ok(exitCode === 0 || exitCode === 1);
      assert.ok(["observer-failed", "observer-diagnostic", "incomplete-coverage"].includes(result.reasons[0]));
      assert.equal(holder.exitCode, null);
      evidence.push({ name: "N09-native-permission-boundary", nativeRestrictedObserver: true, exitCode });
    } finally { interposed.mock.restore(); await stop(holder); }
  });
  for (const mode of ["cancel", "timeout", "large"]) {
    it("N10/N11: settles a real owned observer after " + mode, async () => {
      const holder = await hold(target), controller = new AbortController(), spawn = childProcess.spawn;
      const helper = fileURLToPath(new URL("./testing/usage-observer.mjs", import.meta.url));
      let observer, ready = false;
      const interposed = mock.method(childProcess, "spawn", (file, args, options) => {
        observer = spawn(process.execPath, [helper, mode], options);
        observer.stdout.once("data", () => { ready = true; if (mode === "cancel") controller.abort(); });
        return observer;
      });
      try {
        const result = await inspectWorktreeUsage({ worktreePath: target, signal: controller.signal, observationTimeoutMs: 3000 });
        assert.equal(ready, true);
        assert.equal(result.status, "unknown");
        assert.deepEqual(result.reasons, [mode === "cancel" ? "cancelled" : mode === "timeout" ? "observation-timeout" : "output-limit"]);
        assert.equal(result.observationPerformed, true);
        assert.equal(result.observer.state, "settled");
        assert.ok(observer.exitCode !== null || observer.signalCode !== null);
        assert.equal(holder.exitCode, null);
        evidence.push({ name: "N10-N11-native-" + mode, status: result.status, reasons: result.reasons,
          ...result.observation, observer: result.observer.state, workerAlive: true, nativeObserverReplacedAtSpawnBoundary: true });
      } finally { interposed.mock.restore(); await stop(holder); }
    });
  }
  it("N14: distinguishes supported native names from ambiguous caret encoding", { skip: process.platform !== "darwin" }, async () => {
    for (const [name, expected] of [["literal\\name", "busy"], ["line\nbreak", "busy"], ["caret^A", "unknown"]]) {
      const directory = path.join(target, name);
      await mkdir(directory);
      const holder = await hold(directory);
      try {
        const result = await observe("N14-" + expected, directory);
        assert.equal(result.status, expected, JSON.stringify(result.reasons));
        if (expected === "busy") assert.ok(result.holders.some(row => row.pid === holder.pid));
        else assert.equal(result.observation.coverageComplete, false);
      } finally { await stop(holder); await rmdir(directory); }
    }
  });
  it("N14/N15: resolves an ancestor alias without changing target identity", async () => {
    const alias = path.join(root, "ancestor-alias");
    await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
    const holder = await hold(target);
    try {
      const result = await observe("N14-ancestor-alias", path.join(alias, path.basename(target)));
      assert.equal(result.status, "busy", JSON.stringify(result.reasons));
      assert.equal(result.target.canonicalPath, await realpath(target));
      assert.ok(result.holders.some(row => row.pid === holder.pid));
    } finally { await stop(holder); await rm(alias); }
  });
  it("N14: handles a case alias according to the actual filesystem", { skip: process.platform !== "darwin" }, async () => {
    const alias = path.join(root, path.basename(target).toUpperCase());
    const holder = await hold(target);
    try {
      let available = true;
      try { await realpath(alias); } catch (error) { if (error.code !== "ENOENT") throw error; available = false; }
      const result = await observe("N14-case-alias", alias);
      assert.equal(result.status, available ? "busy" : "unknown", JSON.stringify(result.reasons));
      if (available) assert.ok(result.holders.some(row => row.pid === holder.pid));
      evidence.push({ name: "N14-case-behavior", caseAliasAvailable: available });
    } finally { await stop(holder); }
  });
  it("N15: detects a real target replacement during native observation", async () => {
    const original = path.join(root, "replacement-target"), retained = path.join(root, "replacement-retained");
    await mkdir(original); await writeFile(path.join(original, "canary"), "preserve-native-replacement");
    const spawn = childProcess.spawn;
    let changed = false;
    const interposed = mock.method(childProcess, "spawn", (file, args, options) => {
      if (!changed) { renameSync(original, retained); mkdirSync(original); changed = true; }
      return spawn(file, args, options);
    });
    try {
      const result = await observe("N15-native-replacement", original);
      assert.equal(result.status, "unknown");
      assert.deepEqual(result.reasons, ["target-changed"]);
      assert.equal(await readFile(path.join(retained, "canary"), "utf8"), "preserve-native-replacement");
    } finally {
      interposed.mock.restore();
      await rm(original, { recursive: true }); await rm(retained, { recursive: true });
    }
  });
  it("N18: imports runtime and probe without starting observers or writing files", () => {
    const script = 'const cp = (await import("node:child_process")).default; const fs = (await import("node:fs")).default; const fp = (await import("node:fs/promises")).default; const refuse = () => { throw new Error("import side effect"); }; cp.spawn = refuse; cp.execFile = refuse; cp.execFileSync = refuse; fs.writeFileSync = refuse; fs.mkdirSync = refuse; fp.writeFile = refuse; fp.mkdir = refuse; await import(process.argv[1]); await import(process.argv[2]);';
    const stdout = childProcess.execFileSync(process.execPath, ["--input-type=module", "-e", script,
      new URL("./process-usage.mjs", import.meta.url).href, new URL("./process-usage-probe.mjs", import.meta.url).href],
    { cwd: control, encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.equal(stdout, "");
    evidence.push({ name: "N18-import", nativeChild: true, guardedEffects: 0 });
  });
  it("N18: keeps parallel observations isolated and preserves files and refs", async () => {
    const refs = git(control, "show-ref"), registration = git(control, "worktree", "list", "--porcelain");
    const content = await readFile(path.join(target, "sentinel"));
    const admin = git(target, "rev-parse", "--absolute-git-dir");
    const files = [path.join(target, ".git"), path.join(admin, "index"), path.join(admin, "HEAD"), path.join(admin, "gitdir"),
      path.join(target, "sentinel"), path.join(sibling, "sentinel")];
    const snapshots = await Promise.all(files.map(async file => ({ bytes: await readFile(file), info: await stat(file) })));
    const holder = await hold(target);
    try {
      const [left, right] = await Promise.all([observe("N18-parallel-target"), observe("N18-parallel-sibling", sibling)]);
      assert.ok(["busy", "unknown"].includes(left.status));
      assert.ok(["clear", "unknown"].includes(right.status));
      assert.notEqual(left.observation, right.observation);
      assert.equal(left.observer.state, "settled");
      assert.equal(right.observer.state, "settled");
      assert.equal((await observe("N18-after-parallel")).status, "busy");
      assert.equal(git(control, "show-ref"), refs);
      assert.equal(git(control, "worktree", "list", "--porcelain"), registration);
      assert.deepEqual(await readFile(path.join(target, "sentinel")), content);
      assert.deepEqual(await readFile(path.join(sibling, "sentinel")), content);
      for (let i = 0; i < files.length; i++) {
        assert.deepEqual(await readFile(files[i]), snapshots[i].bytes);
        const current = await stat(files[i]);
        assert.equal(current.ino, snapshots[i].info.ino);
        assert.equal(current.mtimeMs, snapshots[i].info.mtimeMs);
      }
      evidence.push({ name: "N18-files-and-git-metadata", filesUnchanged: files.length, registrationUnchanged: true });
    } finally { await stop(holder); }
  });
  it("R01: applies the qualified local profile through the runtime entry", {
    skip: process.platform !== "darwin" || process.arch !== "arm64" || os.release() !== "25.2.0" || process.version !== "v26.4.0"
      ? "Runtime profile currently limited to qualified local host" : false,
  }, async () => {
    const holder = await hold(target);
    try {
      const result = await inspectRuntimeUsage({ worktreePath: target });
      assert.equal(result.status, "busy", JSON.stringify(result.reasons));
      assert.equal(result.capability.status, "qualified");
      assert.equal(result.observationPerformed, true);
      assert.ok(result.holders.some(row => row.pid === holder.pid));
      evidence.push({ name: "R01-runtime-qualified", status: result.status, capability: result.capability,
        observationPerformed: result.observationPerformed, ...result.observation });
    } finally { await stop(holder); }
  });
});
