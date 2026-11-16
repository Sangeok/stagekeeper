import assert from "node:assert/strict";
import childProcess, { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, it } from "node:test";
import { manageTaskWorktrees } from "./manage-task-worktrees.mjs";

const script = fileURLToPath(new URL("./manage-task-worktrees.mjs", import.meta.url));
const directories = [];
let previousGit;

beforeEach(() => {
  previousGit = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("GIT_")));
  for (const name of Object.keys(previousGit)) delete process.env[name];
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "wtl-config-"));
  directories.push(root);
  process.env.GIT_CONFIG_GLOBAL = path.join(root, "no-global-config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  for (const name of Object.keys(process.env)) if (name.startsWith("GIT_")) delete process.env[name];
  Object.assign(process.env, previousGit);
});

function fixture() {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "wtl-fixture-"));
  directories.push(root);
  const control = path.join(root, "control checkout"), origin = path.join(root, "origin.git");
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).replace(/\n$/, "");
  git(root, "init", "--bare", origin);
  git(root, "init", "--initial-branch=main", control);
  git(control, "config", "user.name", "Fixture"); git(control, "config", "user.email", "fixture@example.test");
  git(control, "config", "core.autocrlf", "false");
  git(control, "config", `url.${origin}.insteadOf`, "https://github.com/fixture/stagekeeper.git");
  git(control, "remote", "add", "origin", "https://github.com/fixture/stagekeeper.git");
  writeFileSync(path.join(control, ".gitignore"), "/node_modules\n/.next/\n/src/generated/\n/coverage/\n*.tsbuildinfo\nnext-env.d.ts\n.env*\nreport.log\n");
  mkdirSync(path.join(control, "src"));
  writeFileSync(path.join(control, "src/source.mjs"), "export const value = 1;\n");
  writeFileSync(path.join(control, "README.md"), "base\n");
  git(control, "add", "."); git(control, "commit", "-m", "base");
  git(control, "branch", "dev"); git(control, "push", "origin", "main", "dev");
  const base = git(control, "rev-parse", "HEAD");
  const directory = path.join(control, ".git", "stagekeeper-task-worktrees");
  const calls = [];
  const github = (endpoint, query) => { calls.push({ endpoint, query }); return [[]]; };
  const run = (operation, options = {}) => manageTaskWorktrees({ operation, root: control, github, ...options });
  const record = id => JSON.parse(readFileSync(path.join(directory, "tasks", `${id}.json`), "utf8"));
  const create = async (name = "one", options = {}) => {
    const result = await run("create", { owner: "owner-one", branch: `harness/${name}`, path: path.join(root, `task ${name}`), ...options });
    assert.equal(result.exitCode, 0, JSON.stringify(result.report));
    return record(result.report.results[0].taskId);
  };
  const finishOptions = item => ({ task: item.taskId, owner: item.owner, expectedRevision: item.revision, expectedHead: git(item.path, "rev-parse", "HEAD"), usageEnded: true });
  return { root, control, origin, directory, base, git, run, record, create, finishOptions, calls };
}

function invoke(args, { cwd, preload, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...(preload ? ["--import", pathToFileURL(preload).href] : []), script, ...args], {
      cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", value => stdout += value); child.stderr.on("data", value => stderr += value);
    const deadline = setTimeout(() => child.kill("SIGKILL"), 30000);
    child.once("error", error => { clearTimeout(deadline); reject(error); });
    child.once("close", (code, signal) => { clearTimeout(deadline); resolve({ code, signal, stdout, stderr, pid: child.pid }); });
  });
}

function closingPreload(f, state = "closing") {
  const file = path.join(f.root, `kill-${state}.mjs`);
  writeFileSync(file, `import fs from 'node:fs';\nimport {syncBuiltinESMExports} from 'node:module';\nconst rename=fs.renameSync;\nfs.renameSync=(from,to)=>{const body=fs.readFileSync(from,'utf8');const value=JSON.parse(body);if(String(to).includes('tasks')&&value.state===${JSON.stringify(state)}){${state === "closing" ? "rename(from,to);" : ""}process.kill(process.pid,'SIGKILL');return;}return rename(from,to)};\nsyncBuiltinESMExports();\n`);
  return file;
}

async function interruptFinish(f, item, state = "closing") {
  const result = await invoke(["finish", "--root", f.control, "--task", item.taskId, "--owner", item.owner,
    "--expected-revision", String(item.revision), "--expected-head", f.git(item.path, "rev-parse", "HEAD"), "--usage-ended"], { cwd: f.control, preload: closingPreload(f, state) });
  assert.notEqual(result.code, 0);
  const guarded = await f.run("recover-guard");
  assert.equal(guarded.report.guard.status, "abandoned", JSON.stringify(guarded.report));
  const recovered = await f.run("recover-guard", { expectedNonce: guarded.report.guard.nonce, confirmedQuiescent: true });
  assert.equal(recovered.exitCode, 0, JSON.stringify(recovered.report));
  return { item: f.record(item.taskId), nonce: guarded.report.guard.nonce };
}

it("imports and observes an unmanaged checkout without creating state or changing Git data", async () => {
  const f = fixture();
  const before = readFileSync(path.join(f.control, ".git", "index"));
  const result = await f.run("status");
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.results[0].state, "unmanaged");
  assert.equal(existsSync(f.directory), false);
  assert.deepEqual(readFileSync(path.join(f.control, ".git", "index")), before);
  const help = await invoke(["--help"], { cwd: f.root });
  assert.equal(help.code, 0); assert.match(help.stdout, /recover-guard/);
  assert.equal(existsSync(f.directory), false);
});

it("creates an identified worktree, removes it once and preserves protected refs", async () => {
  const f = fixture(), item = await f.create();
  assert.equal(item.state, "active");
  assert.deepEqual(JSON.parse(readFileSync(path.join(item.gitDir, "stagekeeper-task.json"), "utf8")), { schemaVersion: 1, taskId: item.taskId, instanceId: item.instanceId });
  const options = f.finishOptions(item);
  const result = await f.run("finish", options);
  assert.equal(result.exitCode, 0, JSON.stringify(result.report));
  assert.equal(result.report.results[0].worktree, "removed");
  assert.equal(result.report.results[0].branch.status, "deleted");
  assert.equal(existsSync(item.path), false); assert.equal(existsSync(item.gitDir), false);
  assert.equal(f.git(f.control, "rev-parse", "main"), f.base);
  assert.equal(f.git(f.control, "rev-parse", "dev"), f.base);
  const completed = readFileSync(path.join(f.directory, "tasks", `${item.taskId}.json`));
  const calls = f.calls.length;
  const repeated = await f.run("finish", options);
  assert.equal(repeated.exitCode, 0);
  assert.equal(repeated.report.results[0].worktree, "already-removed");
  assert.equal(f.calls.length, calls);
  assert.deepEqual(readFileSync(path.join(f.directory, "tasks", `${item.taskId}.json`)), completed);
});

it("refuses invalid and conflicting creation before touching existing material", async () => {
  const f = fixture();
  for (const branch of ["main", "dev", "harness/../main", "harness/a.lock", "--all"]) {
    const result = await f.run("create", { owner: "owner", branch, path: path.join(f.root, "unused") });
    assert.equal(result.exitCode, 2); assert.equal(existsSync(f.directory), false);
  }
  const item = await f.create();
  const bytes = readFileSync(path.join(item.path, "README.md"));
  for (const options of [
    { branch: item.branch, path: path.join(f.root, "other") },
    { branch: "harness/other", path: item.path },
    { branch: "harness/other", path: path.join(f.control, "nested") },
    { branch: "harness/other", path: f.root },
  ]) {
    const result = await f.run("create", { owner: "owner", ...options });
    assert.equal(result.exitCode, 2, JSON.stringify(result.report));
  }
  assert.deepEqual(readFileSync(path.join(item.path, "README.md")), bytes);
});

it("rejects missing protected remote refs without creating a branch or worktree", async () => {
  const f = fixture();
  const empty = path.join(f.root, "empty.git"); f.git(f.root, "init", "--bare", empty);
  f.git(f.control, "config", "--unset-all", `url.${f.origin}.insteadOf`);
  f.git(f.control, "config", `url.${empty}.insteadOf`, "https://github.com/fixture/stagekeeper.git");
  const result = await f.run("create", { owner: "owner", branch: "harness/new", path: path.join(f.root, "new") });
  assert.equal(result.exitCode, 1); assert.equal(result.report.error, "protected-remote-missing");
  assert.equal(existsSync(path.join(f.root, "new")), false);
  assert.equal(f.git(f.control, "branch", "--list", "harness/new"), "");
});

for (const variant of ["unstaged", "staged", "untracked", "env", "report", "assume", "skip", "sparse", "merge", "nested", "empty-directory", "index-lock", "submodule"]) {
  it(`preserves worktree files when ${variant} prevents finalization`, async () => {
    const f = fixture(), item = await f.create();
    const target = path.join(item.path, "src/source.mjs");
    if (variant === "assume" || variant === "skip") f.git(item.path, "update-index", variant === "assume" ? "--assume-unchanged" : "--skip-worktree", "src/source.mjs");
    if (["unstaged", "staged", "assume", "skip"].includes(variant)) writeFileSync(target, "owner work\n");
    if (variant === "staged") f.git(item.path, "add", "src/source.mjs");
    if (variant === "untracked") writeFileSync(path.join(item.path, "notes.md"), "owner work\n");
    if (variant === "env") writeFileSync(path.join(item.path, ".env"), "PRIVATE_CANARY\n");
    if (variant === "report") writeFileSync(path.join(item.path, "report.log"), "owner report\n");
    if (variant === "sparse") f.git(item.path, "config", "core.sparseCheckout", "true");
    if (variant === "merge") writeFileSync(path.join(item.gitDir, "MERGE_HEAD"), f.base + "\n");
    if (variant === "empty-directory") mkdirSync(path.join(item.path, "owner-folder"));
    if (variant === "index-lock") writeFileSync(path.join(item.gitDir, "index.lock"), "held\n");
    if (variant === "submodule") writeFileSync(path.join(item.path, ".gitmodules"), "[submodule]\n");
    if (variant === "nested") { mkdirSync(path.join(item.path, ".next")); f.git(item.path, "init", path.join(item.path, ".next", "nested")); }
    const before = readFileSync(target);
    const result = await f.run("finish", f.finishOptions(item));
    assert.equal(result.exitCode, 2, JSON.stringify(result.report));
    assert.equal(existsSync(item.path), true); assert.deepEqual(readFileSync(target), before);
    assert.equal(f.record(item.taskId).state, "active");
    assert.equal(f.git(item.path, "rev-parse", "HEAD"), f.base);
    if (variant === "env") assert.equal(readFileSync(path.join(item.path, ".env"), "utf8"), "PRIVATE_CANARY\n");
  });
}

it("disposes only ignored regenerable files and retains an independent descendant worktree", async () => {
  const f = fixture(), item = await f.create();
  const other = path.join(f.root, "independent");
  f.git(f.control, "worktree", "add", "-b", "harness/descendant", other, item.branch);
  writeFileSync(path.join(other, "unfinished.md"), "keep B\n");
  for (const directory of ["node_modules", ".next", "src/generated", "coverage"]) {
    mkdirSync(path.join(item.path, directory), { recursive: true });
    writeFileSync(path.join(item.path, directory, "cache"), "generated\n");
  }
  writeFileSync(path.join(item.path, "next-env.d.ts"), "generated\n");
  writeFileSync(path.join(item.path, "tsconfig.tsbuildinfo"), "generated\n");
  symlinkSync("cache", path.join(item.path, "node_modules", "file-link"), "file");
  const result = await f.run("finish", f.finishOptions(item));
  assert.equal(result.exitCode, 0, JSON.stringify(result.report));
  assert.equal(existsSync(item.path), false);
  assert.equal(readFileSync(path.join(other, "unfinished.md"), "utf8"), "keep B\n");
  assert.equal(f.git(other, "rev-parse", "HEAD"), f.base);
});

it("refuses external directory links and keeps the external canary", async () => {
  const f = fixture(), item = await f.create();
  const outside = path.join(f.root, "external"); mkdirSync(outside); writeFileSync(path.join(outside, "canary"), "keep\n");
  symlinkSync(outside, path.join(item.path, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const result = await f.run("finish", f.finishOptions(item));
  assert.equal(result.exitCode, 2); assert.ok(result.report.results[0].reasons.includes("linked-path"));
  assert.equal(readFileSync(path.join(outside, "canary"), "utf8"), "keep\n");
  unlinkSync(path.join(item.path, "node_modules"));
});

it("requires owner, revision, head and explicit usage termination without modifying refused records", async () => {
  const f = fixture(), item = await f.create(), options = f.finishOptions(item);
  const file = path.join(f.directory, "tasks", `${item.taskId}.json`), before = readFileSync(file);
  for (const changed of [{ owner: "someone-else" }, { expectedRevision: item.revision + 1 }, { expectedHead: "0".repeat(40) }, { usageEnded: undefined }]) {
    const result = await f.run("finish", { ...options, ...changed });
    assert.equal(result.exitCode, 2, JSON.stringify(result.report));
    assert.deepEqual(readFileSync(file), before);
  }
  const cwdResult = await invoke(["finish", "--root", f.control, "--task", item.taskId, "--owner", item.owner,
    "--expected-revision", String(item.revision), "--expected-head", f.base, "--usage-ended"], { cwd: item.path });
  assert.equal(cwdResult.code, 2); assert.equal(existsSync(item.path), true);
});

it("protects a locked or identity-replaced worktree even when path, branch and HEAD match", async () => {
  const f = fixture(), item = await f.create();
  f.git(f.control, "worktree", "lock", "--reason", "another owner", item.path);
  const locked = await f.run("finish", f.finishOptions(item));
  assert.equal(locked.exitCode, 2);
  f.git(f.control, "worktree", "unlock", item.path);
  const options = f.finishOptions(item);
  f.git(f.control, "worktree", "remove", item.path);
  f.git(f.control, "worktree", "add", item.path, item.branch);
  assert.equal(f.git(item.path, "rev-parse", "--absolute-git-dir").replaceAll("\\", "/"), item.gitDir.replaceAll("\\", "/"));
  const result = await f.run("finish", options);
  assert.equal(result.exitCode, 2, JSON.stringify(result.report));
  assert.ok(result.report.results[0].reasons.includes("identity-changed"));
  assert.equal(existsSync(item.path), true);
});

it("keeps the worktree until a local commit has remote preservation evidence", async () => {
  const f = fixture(), item = await f.create();
  writeFileSync(path.join(item.path, "README.md"), "local change\n"); f.git(item.path, "commit", "-am", "local");
  const options = f.finishOptions(item);
  const blocked = await f.run("finish", options);
  assert.equal(blocked.exitCode, 2, JSON.stringify(blocked.report)); assert.equal(existsSync(item.path), true);
  f.git(item.path, "push", "origin", item.branch);
  const removed = await f.run("finish", { ...options, expectedRevision: f.record(item.taskId).revision });
  assert.equal(removed.report.results[0].worktree, "removed");
  assert.equal(removed.report.results[0].branch.status, "skipped");
  assert.equal(f.git(f.control, "rev-parse", item.branch), options.expectedHead);
});

it("supports squash preservation while keeping a branch needed as another PR's base", async () => {
  const f = fixture(), item = await f.create();
  writeFileSync(path.join(item.path, "README.md"), "feature\n"); f.git(item.path, "commit", "-am", "feature");
  const sha = f.git(item.path, "rev-parse", "HEAD");
  f.git(f.control, "switch", "dev"); f.git(f.control, "merge", "--squash", item.branch); f.git(f.control, "commit", "-m", "squashed");
  const merge = f.git(f.control, "rev-parse", "HEAD"); f.git(f.control, "push", "origin", "dev"); f.git(f.control, "switch", "main");
  const pr = { number: 1, state: "closed", merged_at: "2026-11-12T00:00:00Z", merge_commit_sha: merge,
    head: { ref: item.branch, sha, repo: { full_name: "fixture/stagekeeper" } }, base: { ref: "dev", repo: { full_name: "fixture/stagekeeper" } } };
  const github = (endpoint, query) => {
    assert.ok(endpoint.endsWith("/pulls"));
    return query.state === "all" ? [[pr]] : [[{ number: 2, state: "open", base: { ref: item.branch, repo: { full_name: "fixture/stagekeeper" } } }]];
  };
  const result = await f.run("finish", { ...f.finishOptions(item), github });
  assert.equal(result.report.results[0].worktree, "removed");
  assert.equal(result.report.results[0].branch.reason, "dependent-pr");
  assert.equal(f.record(item.taskId).closing.preservation.kind, "merged-pr");
  assert.equal(f.git(f.control, "rev-parse", item.branch), sha);
});

it("keeps branch diagnostics separate when the control checkout is dirty", async () => {
  const f = fixture(), item = await f.create();
  writeFileSync(path.join(f.control, "owner.md"), "owner\n");
  const result = await f.run("finish", f.finishOptions(item));
  assert.equal(result.exitCode, 2, JSON.stringify(result.report));
  assert.equal(result.report.results[0].worktree, "removed");
  assert.equal(result.report.results[0].branch.reason, "working-tree-dirty");
  assert.equal(readFileSync(path.join(f.control, "owner.md"), "utf8"), "owner\n");
  assert.equal(f.git(f.control, "rev-parse", item.branch), f.base);
});

it("serializes distinct callers creating the same target and never overwrites the winner", async () => {
  const f = fixture();
  const options = { branch: "harness/race", path: path.join(f.root, "race") };
  const results = await Promise.all([f.run("create", { ...options, owner: "one" }), f.run("create", { ...options, owner: "two" })]);
  assert.equal(results.filter(result => result.exitCode === 0).length, 1, JSON.stringify(results));
  assert.equal(readdirSync(path.join(f.directory, "tasks")).filter(name => name.endsWith(".json")).length, 1);
  assert.equal(existsSync(path.join(options.path, "README.md")), true);
});

it("resumes a stopped closing operation without generating a new consent snapshot", async () => {
  const f = fixture(), item = await f.create();
  const stopped = await interruptFinish(f, item);
  assert.equal(stopped.item.state, "closing");
  const requestTime = stopped.item.closing.requestedAt;
  const result = await f.run("retry", { task: item.taskId });
  assert.equal(result.exitCode, 0, JSON.stringify(result.report));
  assert.equal(f.record(item.taskId).state, "removed");
  assert.equal(f.record(item.taskId).closing.requestedAt, requestTime);
});

it("requires renewed consent after a close is cancelled and protects new work on retry", async () => {
  const f = fixture(), item = await f.create(), oldOptions = f.finishOptions(item);
  const stopped = await interruptFinish(f, item);
  const resumed = await f.run("resume", { task: item.taskId, owner: item.owner, expectedRevision: stopped.item.revision });
  assert.equal(resumed.exitCode, 0);
  const active = f.record(item.taskId);
  assert.equal(active.closing, null); assert.equal(active.removalStartedAt, null);
  assert.deepEqual(active.branchCleanup, { state: "not-started", headSha: null, result: null });
  assert.equal((await f.run("finish", oldOptions)).exitCode, 2);
  writeFileSync(path.join(item.path, "new-work.md"), "keep\n");
  assert.equal((await f.run("retry", { task: item.taskId })).exitCode, 2);
  assert.equal(readFileSync(path.join(item.path, "new-work.md"), "utf8"), "keep\n");
});

it("completes the durable record after Git removed the worktree but the process stopped", async () => {
  const f = fixture(), item = await f.create();
  const stopped = await interruptFinish(f, item, "removed");
  assert.equal(stopped.item.state, "closing"); assert.equal(existsSync(item.path), false);
  const result = await f.run("retry", { task: item.taskId });
  assert.equal(result.exitCode, 0, JSON.stringify(result.report));
  assert.equal(f.record(item.taskId).state, "removed");
});

it("preserves changed files and partial removals after an interrupted close", async () => {
  const f = fixture(), item = await f.create();
  await interruptFinish(f, item);
  writeFileSync(path.join(item.path, ".env"), "new owner material\n");
  const blocked = await f.run("retry", { task: item.taskId });
  assert.equal(blocked.exitCode, 2); assert.equal(existsSync(item.path), true);
  assert.equal(readFileSync(path.join(item.path, ".env"), "utf8"), "new owner material\n");
  renameSync(item.path, item.path + "-retained");
  const partial = await f.run("retry", { task: item.taskId });
  assert.equal(partial.exitCode, 2); assert.ok(partial.report.results[0].reasons.includes("partial-removal"));
  assert.equal(existsSync(item.path + "-retained"), true);
});

it("does not release a live or incomplete guard and never retires a successor for an old nonce", async () => {
  const f = fixture(), item = await f.create();
  const stopped = await interruptFinish(f, item);
  const guard = path.join(f.directory, "command.guard");
  mkdirSync(guard);
  const nonce = "10000000-0000-4000-8000-000000000001";
  const owner = { schemaVersion: 1, nonce, host: (await import("node:os")).hostname(), pid: process.pid, operation: "status", taskId: null, createdAt: new Date().toISOString() };
  writeFileSync(path.join(guard, "owner.json"), JSON.stringify(owner));
  const denied = await f.run("recover-guard", { expectedNonce: nonce, confirmedQuiescent: true });
  assert.equal(denied.exitCode, 2); assert.equal(existsSync(guard), true);
  const old = await f.run("recover-guard", { expectedNonce: stopped.nonce, confirmedQuiescent: true });
  assert.equal(old.exitCode, 0); assert.deepEqual(JSON.parse(readFileSync(path.join(guard, "owner.json"))), owner);
  unlinkSync(path.join(guard, "owner.json"));
  assert.equal((await f.run("retry", { task: item.taskId })).exitCode, 2);
  assert.equal((await f.run("recover-guard")).exitCode, 1);
  assert.equal(existsSync(item.path), true);
});

it("preserves corrupt and newer records instead of adopting their worktrees", async () => {
  const f = fixture(), item = await f.create();
  const file = path.join(f.directory, "tasks", `${item.taskId}.json`);
  writeFileSync(file, JSON.stringify({ ...item, schemaVersion: 2 }));
  const before = readFileSync(file);
  assert.equal((await f.run("status")).exitCode, 1);
  assert.equal((await f.run("retry")).exitCode, 1);
  assert.deepEqual(readFileSync(file), before); assert.equal(existsSync(item.path), true);
});

it("does not run a post-checkout hook during managed creation", async () => {
  const f = fixture();
  const hook = path.join(f.control, ".git", "hooks", "post-checkout");
  writeFileSync(hook, "#!/bin/sh\nprintf hook > hook-ran\n", { mode: 0o755 });
  const item = await f.create();
  assert.equal(existsSync(path.join(item.path, "hook-ran")), false);
  assert.equal(f.git(item.path, "status", "--porcelain"), "");
});

it("returns parseable errors and rejects path-like identifiers before state access", async () => {
  const f = fixture();
  for (const args of [["finish", "--task", "../../main"], ["recover-guard", "--expected-nonce", "../../main", "--confirmed-quiescent"], ["status", "--force"], ["status", "--task", "x", "--task", "y"]]) {
    const result = await invoke(args, { cwd: f.control });
    assert.equal(result.code, 2); assert.equal(JSON.parse(result.stdout).aborted, true);
    assert.equal(existsSync(f.directory), false);
  }
});

function checkpoint(f, name, condition, action, after = true) {
  const file = path.join(f.root, `checkpoint-${name}.mjs`);
  writeFileSync(file, `import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const rename=fs.renameSync;
fs.renameSync=(from,to)=>{const value=JSON.parse(fs.readFileSync(from,'utf8'));if(${condition}){${after ? 'rename(from,to);' : ''}${action}}else rename(from,to)};
syncBuiltinESMExports();
`);
  return file;
}

async function recoverStopped(f) {
  const observed = await f.run("recover-guard");
  assert.equal(observed.report.guard.status, "abandoned", JSON.stringify(observed.report));
  const recovered = await f.run("recover-guard", { expectedNonce: observed.report.guard.nonce, confirmedQuiescent: true });
  assert.equal(recovered.exitCode, 0, JSON.stringify(recovered.report));
}

for (const gap of ["record", "branch", "before-marker", "after-marker"]) {
  it(`recovers an interrupted creation at ${gap} without adopting unconfirmed material`, async () => {
    const f = fixture(), target = path.join(f.root, "interrupted");
    const condition = gap.includes("marker") ? "String(to).endsWith('stagekeeper-task.json')" : "value.state==='creating'&&value.gitDir===null";
    const action = (gap === "branch" ? `execFileSync('git',['-C',${JSON.stringify(f.control)},'branch',value.branch,value.baseSha]);` : "") + "process.kill(process.pid,'SIGKILL');";
    const stopped = await invoke(["create", "--root", f.control, "--owner", "owner", "--branch", "harness/interrupted", "--path", target], {
      cwd: f.control, preload: checkpoint(f, gap, condition, action, gap !== "before-marker"),
    });
    assert.notEqual(stopped.code, 0);
    const id = readdirSync(path.join(f.directory, "tasks")).find(name => name.endsWith(".json")).slice(0, -5);
    await recoverStopped(f);
    const options = { task: id, owner: "owner", expectedRevision: f.record(id).revision };
    const recovered = await f.run("create", options);
    if (["branch", "before-marker"].includes(gap)) {
      assert.equal(recovered.exitCode, 2);
      assert.ok(recovered.report.results[0].reasons.includes("creation-confirmation-required"));
      const confirmed = await f.run("create", { ...options, expectedRevision: f.record(id).revision, confirmCreatedByTask: true });
      assert.equal(confirmed.exitCode, 0, JSON.stringify(confirmed.report));
    } else assert.equal(recovered.exitCode, 0, JSON.stringify(recovered.report));
    assert.equal(f.record(id).state, "active");
    assert.equal(f.git(target, "rev-parse", "HEAD"), f.base);
  });
}

it("does not replace a different task marker during creation recovery", async () => {
  const f = fixture(), target = path.join(f.root, "unconfirmed");
  await invoke(["create", "--root", f.control, "--owner", "owner", "--branch", "harness/unconfirmed", "--path", target], {
    cwd: f.control, preload: checkpoint(f, "marker", "String(to).endsWith('stagekeeper-task.json')", "process.kill(process.pid,'SIGKILL');"),
  });
  await recoverStopped(f);
  const id = readdirSync(path.join(f.directory, "tasks")).find(name => name.endsWith(".json")).slice(0, -5), item = f.record(id);
  const marker = path.join(item.gitDir, "stagekeeper-task.json");
  writeFileSync(marker, JSON.stringify({ schemaVersion: 1, taskId: id, instanceId: "00000000-0000-4000-8000-000000000000" }));
  const bytes = readFileSync(marker);
  const result = await f.run("create", { task: id, owner: "owner", expectedRevision: item.revision, confirmCreatedByTask: true });
  assert.equal(result.exitCode, 2); assert.deepEqual(readFileSync(marker), bytes); assert.equal(existsSync(target), true);
});

it("records preservation refusals for read-only status without exposing ignored file contents", async () => {
  const f = fixture(), item = await f.create();
  writeFileSync(path.join(item.path, ".env"), "PRIVATE_CANARY\n");
  await f.run("finish", f.finishOptions(item));
  const file = path.join(f.directory, "tasks", `${item.taskId}.json`), bytes = readFileSync(file);
  const result = await f.run("status", { task: item.taskId });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.results[0].lastReasons, ["unpreserved-files"]);
  assert.equal(result.report.results[0].owner, item.owner); assert.equal(result.report.results[0].branchName, item.branch);
  assert.deepEqual(readFileSync(file), bytes); assert.ok(!JSON.stringify(result).includes("PRIVATE_CANARY"));
});

it("preserves the checkout when the closing record cannot be atomically written", async t => {
  const f = fixture(), item = await f.create(), rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    if (String(to).endsWith(`${item.taskId}.json`) && JSON.parse(readFileSync(from, "utf8")).state === "closing") throw Object.assign(new Error(), { code: "EACCES" });
    return rename(from, to);
  });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const result = await f.run("finish", f.finishOptions(item));
  assert.equal(result.exitCode, 1); assert.equal(result.report.aborted, true);
  assert.equal(f.record(item.taskId).state, "active"); assert.equal(existsSync(item.path), true);
  assert.equal(readFileSync(path.join(item.path, "README.md"), "utf8"), "base\n");
});

it("does not repeat an uncertain branch deletion after the ref name is reused", async () => {
  const f = fixture(), item = await f.create();
  const preload = checkpoint(f, "attempted", "value.branchCleanup?.state==='attempted'", "process.kill(process.pid,'SIGKILL');");
  await invoke(["finish", "--root", f.control, "--task", item.taskId, "--owner", item.owner,
    "--expected-revision", String(item.revision), "--expected-head", f.base, "--usage-ended"], { cwd: f.control, preload });
  await recoverStopped(f);
  f.git(f.control, "update-ref", "-d", `refs/heads/${item.branch}`, f.base);
  f.git(f.control, "branch", item.branch, f.base);
  const result = await f.run("retry", { task: item.taskId });
  assert.equal(result.exitCode, 1); assert.equal(result.report.results[0].branch.reason, "branch-result-unknown");
  assert.equal(f.calls.length, 0); assert.equal(f.git(f.control, "rev-parse", item.branch), f.base);
});

it("propagates a branch cleanup abort and preserves the remaining batch worktree", async () => {
  const f = fixture(), first = await f.create("first"), second = await f.create("second");
  await interruptFinish(f, first); await interruptFinish(f, second);
  const github = () => { f.git(f.control, "config", "remote.origin.url", path.join(f.root, "missing-origin")); return [[]]; };
  const result = await f.run("retry", { github });
  assert.equal(result.exitCode, 1); assert.equal(result.report.aborted, true);
  const removed = result.report.results.find(item => item.worktree === "already-removed");
  assert.equal(removed.branch.details.aborted, true);
  assert.ok(removed.branch.reasons.includes("inspection-failed"));
  const remaining = result.report.results.find(item => item.reasons.includes("batch-aborted"));
  assert.equal(existsSync(remaining.path), true);
});

it("rejects corrupt nested branch results without re-running cleanup", async () => {
  const f = fixture(), item = await f.create();
  await f.run("finish", f.finishOptions(item));
  const completed = f.record(item.taskId), file = path.join(f.directory, "tasks", `${item.taskId}.json`);
  completed.branchCleanup.result.results[0].worktrees = [null]; writeFileSync(file, JSON.stringify(completed));
  f.git(f.control, "branch", item.branch, f.base);
  const calls = f.calls.length;
  assert.equal((await f.run("retry", { task: item.taskId })).exitCode, 1);
  assert.equal(f.calls.length, calls); assert.equal(f.git(f.control, "rev-parse", item.branch), f.base);
});

it("terminates its Git child before releasing the guard on cancellation", async t => {
  const f = fixture(), original = childProcess.spawn, controller = new AbortController();
  let held;
  t.mock.method(childProcess, "spawn", (command, args, options) => {
    if (command !== "git" || !args.includes("fetch")) return original(command, args, options);
    held = original(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); process.stdout.write('ready'); setInterval(()=>{},1000)"], options);
    held.stdout.once("data", () => controller.abort()); return held;
  });
  syncBuiltinESMExports(); t.after(() => { held?.kill("SIGKILL"); t.mock.restoreAll(); syncBuiltinESMExports(); });
  const result = await f.run("create", { owner: "owner", branch: "harness/cancelled", path: path.join(f.root, "cancelled"), signal: controller.signal });
  assert.equal(result.exitCode, 1); assert.equal(result.report.aborted, true);
  assert.ok(held.exitCode !== null || held.signalCode !== null);
  assert.equal(existsSync(path.join(f.directory, "command.guard")), false);
  assert.equal(existsSync(path.join(f.root, "cancelled")), false);
});

it("uses the same canonical checkout for Windows short and long temp paths", { skip: process.platform !== "win32" ? "Windows 8.3 path contract" : false }, async t => {
  const f = fixture();
  const short = execFileSync("cmd.exe", ["/d", "/s", "/c", `for %I in ("${f.control}") do @echo %~sI`], { encoding: "utf8" }).trim();
  if (short.toLowerCase() === f.control.toLowerCase()) { t.skip("8.3 aliases are disabled on this volume"); return; }
  assert.equal(realpathSync.native(short), realpathSync.native(f.control));
  const created = await f.run("create", { root: short, owner: "owner", branch: "harness/short", path: path.join(f.root, "short task") });
  assert.equal(created.exitCode, 0, JSON.stringify(created.report));
  const item = f.record(created.report.results[0].taskId);
  assert.equal(item.commonGit, realpathSync.native(path.join(f.control, ".git")));
  assert.equal((await f.run("finish", f.finishOptions(item))).exitCode, 0);
});

for (const contender of ["finish", "resume"]) {
  it(`holds the repository guard until removal settles against concurrent ${contender}`, async t => {
    const f = fixture(), item = await f.create(), options = f.finishOptions(item);
    const stopped = await interruptFinish(f, item);
    const original = childProcess.spawn;
    let rival, held;
    t.mock.method(childProcess, "spawn", (command, args, settings) => {
      if (command !== "git" || !args.includes("remove") || held) return original(command, args, settings);
      held = original(process.execPath, ["-e", `process.stdin.once('data',()=>{require('node:child_process').execFileSync('git',${JSON.stringify(args)},{stdio:'inherit'});process.exit(0)})`], { ...settings, stdio: ["pipe", "pipe", "pipe"] });
      rival = f.run(contender, contender === "finish" ? options : { task: item.taskId, owner: item.owner, expectedRevision: stopped.item.revision });
      rival.finally(() => held.stdin.end("continue"));
      return held;
    });
    syncBuiltinESMExports(); t.after(() => { held?.kill("SIGKILL"); t.mock.restoreAll(); syncBuiltinESMExports(); });
    const result = await f.run("finish", options);
    assert.equal(result.exitCode, 0, JSON.stringify(result.report));
    assert.ok(rival);
    const blocked = await rival;
    assert.equal(blocked.exitCode, 2); assert.ok(blocked.report.results[0].reasons.includes("guard-held"));
    assert.equal(f.record(item.taskId).state, "removed"); assert.equal(existsSync(item.path), false);
    assert.equal(existsSync(path.join(f.directory, "command.guard")), false);
  });
}

it("retains the guard when a cancelled child cannot be confirmed stopped", async t => {
  const f = fixture(), original = childProcess.spawn, controller = new AbortController();
  let held, terminate;
  t.mock.method(childProcess, "spawn", (command, args, options) => {
    if (command !== "git" || !args.includes("fetch")) return original(command, args, options);
    held = original(process.execPath, ["-e", "process.stdout.write('ready'); setInterval(()=>{},1000)"], options);
    terminate = held.kill.bind(held); held.kill = () => false;
    held.stdout.once("data", () => controller.abort()); return held;
  });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  try {
    const result = await f.run("create", { owner: "owner", branch: "harness/unsettled", path: path.join(f.root, "unsettled"), signal: controller.signal });
    assert.equal(result.exitCode, 1); assert.equal(result.report.aborted, true);
    assert.equal(held.exitCode, null); assert.equal(held.signalCode, null);
    assert.equal(existsSync(path.join(f.directory, "command.guard", "owner.json")), true);
    assert.equal((await f.run("retry", { task: "00000000-0000-4000-8000-000000000000" })).exitCode, 2);
  } finally {
    if (held) await new Promise(resolve => { held.once("close", resolve); terminate("SIGKILL"); });
  }
});

it("preserves branch and folder outcomes when the cleanup delegate throws", async t => {
  const f = fixture(), item = await f.create(), rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (from, to) => {
    const value = JSON.parse(readFileSync(from, "utf8"));
    rename(from, to);
    if (value.taskId === item.taskId && value.state === "removed") f.git(f.control, "config", "remote.origin.url", path.join(f.root, "missing-origin"));
  });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const result = await f.run("finish", f.finishOptions(item));
  assert.equal(result.exitCode, 1); assert.equal(result.report.aborted, true);
  assert.equal(result.report.results[0].worktree, "already-removed");
  assert.equal(result.report.results[0].branch.reason, "branch-inspection-failed");
  assert.equal(f.git(f.control, "rev-parse", item.branch), f.base); assert.equal(existsSync(item.path), false);
});

it("reports a failed status inspection without mutating its task or worktree", async t => {
  const f = fixture(), item = await f.create(), original = childProcess.spawn;
  const file = path.join(f.directory, "tasks", `${item.taskId}.json`), bytes = readFileSync(file);
  t.mock.method(childProcess, "spawn", (command, args, settings) => {
    if (command === "git" && args.includes(item.path) && args.includes("status")) return original(process.execPath, ["-e", "process.exit(1)"], settings);
    return original(command, args, settings);
  });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const result = await f.run("status", { task: item.taskId });
  assert.equal(result.exitCode, 1); assert.equal(result.report.aborted, true);
  assert.ok(result.report.results[0].reasons.includes("git-inspection-failed"));
  assert.deepEqual(readFileSync(file), bytes); assert.equal(existsSync(item.path), true);
});
