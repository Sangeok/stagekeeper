import assert from "node:assert/strict";
import { it } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRoleFiles } from "../runtime/role-files.mjs";
import { createRoleGit, nativeGitExecutable } from "../runtime/role-git.mjs";

const temporary = realpathSync(tmpdir()), digest = bytes => createHash("sha256").update(bytes).digest("hex");
// Host Git is intentionally absent from the LPAC command snapshot. This broker
// runs in the owner process; its real host tests remain visible as snapshot skips.
const host = { skip: process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1" };
function fixture(t, lifecycle = {}) {
  const base = mkdtempSync(path.join(temporary, "harness-git-test-")), root = path.join(base, "repo");
  mkdirSync(root); mkdirSync(path.join(root, "foreign"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init");
  const file = path.join(root, "code.txt"); writeFileSync(file, "before\n");
  writeFileSync(path.join(root, "foreign/private.txt"), "DENIED_CANARY\n");
  git("add", "."); git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const head = git("rev-parse", "HEAD");
  const files = createRoleFiles({ ":root": "deny", [root]: "write", [path.join(root, "foreign")]: "deny", [path.join(root, ".git")]: "read" }, "dev");
  const broker = createRoleGit({ root, agent: "dev", fileBroker: files, planCommit: head }, lifecycle);
  t.after(async () => { await broker.close(); assert.equal(path.dirname(base), temporary); assert.ok(path.basename(base).startsWith("harness-git-test-")); await rm(base, { recursive: true }); });
  return { base, root, file, head, git, files, broker };
}
const query = (f, operation, extra = {}) => f.broker.call("role_git_read", { operation, ...(operation === "head" ? {} : { paths: [f.file] }), ...extra });

it("reads HEAD and scoped committed/current bytes without changing the original index or metadata", host, async t => {
  const f = fixture(t), index = digest(readFileSync(path.join(f.root, ".git/index"))), config = readFileSync(path.join(f.root, ".git/config"));
  writeFileSync(f.file, "after\n");
  assert.equal((await query(f, "head")).head, f.head);
  assert.equal((await query(f, "show", { ref: f.head })).output, "before\n");
  const diff = await query(f, "diff");
  assert.match(diff.output, /-before\r?\n\+after/); assert.ok(!diff.output.includes("DENIED_CANARY"));
  assert.deepEqual(diff.files, [{ path: f.file, hash: digest(Buffer.from("after\n")) }]);
  assert.equal(diff.scope, "explicit-files"); assert.equal(diff.originalRepositoryWrites, false);
  assert.match((await query(f, "status")).output, / M code.txt/);
  f.git("add", "code.txt"); assert.match((await query(f, "status")).output, /M  code.txt/);
  assert.notEqual(digest(readFileSync(path.join(f.root, ".git/index"))), index); // Only the explicit test-owner add changed it.
  const staged = digest(readFileSync(path.join(f.root, ".git/index"))); await query(f, "status");
  assert.equal(digest(readFileSync(path.join(f.root, ".git/index"))), staged);
  assert.deepEqual(readFileSync(path.join(f.root, ".git/config")), config);
});

it("refuses outside/denied/auth/env paths, directory and wildcard selections, arbitrary refs and extra arguments", host, async t => {
  const f = fixture(t);
  for (const name of [path.join(f.root, "foreign/private.txt"), path.join(f.base, "external.txt"), f.root, path.join(f.root, ".git/config"), path.join(f.root, ".codex/auth.json"), path.join(f.root, ".env"), path.join(f.root, "*.txt")])
    await assert.rejects(query(f, "show", { paths: [name] }));
  for (const extra of [{ ref: "HEAD~1" }, { ref: f.head + ":foreign/private.txt" }, { command: "git config" }, { paths: [f.file, f.file] }, { paths: [] }]) await assert.rejects(query(f, "diff", extra));
  await assert.rejects(query(f, "head", { paths: [f.file] }));
  await assert.rejects(query(f, "status", { ref: f.head }));
  assert.throws(() => createRoleGit({ root: f.root, agent: "pm", fileBroker: f.files }));
  const wrong = createRoleGit({ root: f.root, agent: "dev", fileBroker: f.files, commonDirectory: f.base });
  await assert.rejects(wrong.call("role_git_read", { operation: "head" }), /binding/);
  await wrong.close();
  const foreign = fixture(t);
  const other = createRoleGit({ root: f.root, agent: "dev", fileBroker: f.files, commonDirectory: path.join(foreign.root, ".git") });
  try { await assert.rejects(other.call("role_git_read", { operation: "head" }), /binding/); }
  finally { await other.close(); }
  const alias = path.join(f.base, "bound-git-alias");
  symlinkSync(path.join(f.root, ".git"), alias, process.platform === "win32" ? "junction" : "dir");
  const linked = createRoleGit({ root: f.root, agent: "dev", fileBroker: f.files, commonDirectory: alias });
  try { await assert.rejects(linked.call("role_git_read", { operation: "head" }), /alias/); }
  finally { await linked.close(); }
});

it("ignores repository/system/owner config, filters, diff helpers, fsmonitor and credentials", host, async t => {
  const f = fixture(t), marker = path.join(f.base, "FORBIDDEN"), command = `node -e "require('fs').writeFileSync('${marker.replaceAll("\\", "/")}','ran')"`;
  f.git("config", "core.fsmonitor", command); f.git("config", "diff.external", command);
  f.git("config", "diff.attack.textconv", command); f.git("config", "filter.attack.clean", command); f.git("config", "filter.attack.required", "true");
  writeFileSync(path.join(f.root, ".gitattributes"), "* filter=attack diff=attack\n");
  const previous = process.env.GIT_CONFIG_COUNT; process.env.GIT_CONFIG_COUNT = "invalid-parent-environment";
  const token = process.env.HARNESS_TOKEN; process.env.HARNESS_TOKEN = "AUTH_CANARY";
  try {
    writeFileSync(f.file, "after\n");
    assert.match((await query(f, "diff")).output, /\+after/);
    assert.match((await query(f, "status")).output, /code.txt/);
    assert.equal((await query(f, "show")).output, "before\n");
    assert.equal(existsSync(marker), false);
  } finally { if (previous === undefined) delete process.env.GIT_CONFIG_COUNT; else process.env.GIT_CONFIG_COUNT = previous; if (token === undefined) delete process.env.HARNESS_TOKEN; else process.env.HARNESS_TOKEN = token; }
});

it("supports ordinary Git worktrees and packed objects, including Windows short paths, without copying their config", host, async t => {
  const f = fixture(t); f.git("gc");
  const root = path.join(f.base, "worktree"); f.git("worktree", "add", "--detach", root, "HEAD");
  // The runner's TEMP can use RUNNER~1 while Git writes runneradmin in .git.
  const spellings = new Set([path.join(f.root, ".git"), realpathSync.native(path.join(f.root, ".git"))]);
  try {
    for (const commonDirectory of spellings) {
      const files = createRoleFiles({ ":root": "deny", [root]: "write" }, "dev");
      const broker = createRoleGit({ root, agent: "dev", fileBroker: files, commonDirectory });
      try { assert.equal((await broker.call("role_git_read", { operation: "show", paths: [path.join(root, "code.txt")] })).output, "before\n"); }
      finally { await broker.close(); }
    }
  }
  catch (error) {
    // Only disposable fixture metadata enters diagnostics; owner config stays private.
    const pointer = readFileSync(path.join(root, ".git"), "utf8").trim();
    const directory = path.resolve(root, pointer.replace(/^gitdir: /, ""));
    const commonPointer = readFileSync(path.join(directory, "commondir"), "utf8").trim();
    t.diagnostic(JSON.stringify({ gitVersion: f.git("--version"), root, pointer, commonPointer,
      resolvedCommonDirectory: path.resolve(directory, commonPointer), expectedCommonDirectory: path.join(f.root, ".git") }));
    throw error;
  }
});

it("refuses file/metadata aliases and alternate object sources", host, async t => {
  const f = fixture(t); const linked = path.join(f.root, "linked.txt"); linkSync(f.file, linked);
  await assert.rejects(query(f, "diff", { paths: [linked] }), /link/i);
  const alternate = path.join(f.root, ".git/objects/info/alternates"); writeFileSync(alternate, path.join(f.base, "external-objects") + "\n");
  await assert.rejects(query(f, "head"), /alternates/);
  await rm(alternate);
  const objects = path.join(f.root, ".git/objects"), prefix = readdirSync(objects).find(name => /^[a-f0-9]{2}$/.test(name));
  const name = readdirSync(path.join(objects, prefix))[0], original = path.join(objects, prefix, name), backup = path.join(f.base, "object");
  writeFileSync(backup, readFileSync(original)); await rm(original); linkSync(backup, original);
  await assert.rejects(query(f, "head"), /alias/);
  const other = fixture(t); symlinkSync(other.base, path.join(other.root, "alias"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(query(other, "diff", { paths: [path.join(other.root, "alias/external.txt")] }), /alias/);
});

it("refuses binary/oversize output and stale original files", host, async t => {
  const f = fixture(t); writeFileSync(f.file, Buffer.alloc(1024 * 1024 + 1, 65));
  await assert.rejects(query(f, "diff"), /size/);
  const binary = fixture(t); writeFileSync(binary.file, Buffer.from([0, 255])); binary.git("add", "code.txt"); binary.git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "binary");
  await assert.rejects(query(binary, "show"), /Binary/);
  let file, queries = 0; const stale = fixture(t, { onSpawn: async () => { if (++queries === 2) writeFileSync(file, "changed during query\n"); } }); file = stale.file;
  await assert.rejects(query(stale, "diff"), /changed during query/);
});

it("honors owner refusal and cancellation and settles only after the fixed reader exits", host, async t => {
  let spawned = 0; const denied = fixture(t, { beforeActivate: async () => { throw new Error("owner stopped"); }, onSpawn: async () => spawned++ });
  await assert.rejects(query(denied, "head"), /owner stopped/); assert.equal(spawned, 0);
  const controller = new AbortController(); let settled = 0, pid;
  const f = fixture(t, { onSpawn: async child => { pid = child.pid; controller.abort(); }, onSettled: async () => { assert.throws(() => process.kill(pid, 0)); settled++; } });
  await assert.rejects(f.broker.call("role_git_read", { operation: "head" }, controller.signal), { name: "AbortError" });
  assert.equal(settled, 1);
});

it("bounds historical blob output and rejects a changed index or HEAD before accepting evidence", host, async t => {
  const big = fixture(t); writeFileSync(big.file, "x".repeat(1024 * 1024 + 1)); big.git("add", "code.txt");
  big.git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "large blob"); writeFileSync(big.file, "small\n");
  await assert.rejects(query(big, "show"), /output limit/);
  let index, queries = 0; const changed = fixture(t, { onSpawn: async () => { if (++queries === 2) writeFileSync(index, "changed-index"); } }); index = path.join(changed.root, ".git/index");
  await assert.rejects(query(changed, "status"), /index changed/);
  let gitHead; const head = fixture(t, { onSpawn: async () => writeFileSync(gitHead, "0".repeat(40) + "\n") }); gitHead = path.join(head.root, ".git/HEAD");
  await assert.rejects(query(head, "head"), /HEAD changed/);
});

it("uses literal filenames and an owned index when the original index is absent", host, async t => {
  const f = fixture(t), file = path.join(f.root, "-literal.txt"); writeFileSync(file, "before\n"); f.git("add", "--", "-literal.txt");
  f.git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "literal filename");
  writeFileSync(file, "after\n"); await rm(path.join(f.root, ".git/index"));
  assert.match((await query(f, "diff", { paths: [file] })).output, /\+after/);
  assert.equal(existsSync(path.join(f.root, ".git/index")), false);
});

it("cannot hide current source changes through assume-unchanged or skip-worktree index flags", host, async t => {
  for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
    const f = fixture(t); f.git("update-index", flag, "code.txt"); writeFileSync(f.file, "after\n");
    const index = digest(readFileSync(path.join(f.root, ".git/index")));
    assert.match((await query(f, "diff")).output, /\+after/);
    assert.match((await query(f, "status")).output, / M code.txt/);
    assert.equal(digest(readFileSync(path.join(f.root, ".git/index"))), index);
  }
});

it("resolves the real Git for Windows reader from the standard launcher PATH", { skip: process.platform !== "win32" || host.skip }, t => {
  const actual = nativeGitExecutable(), directory = path.dirname(path.dirname(path.dirname(actual))), shim = path.join(directory, "cmd/git.exe");
  if (!existsSync(shim)) { t.skip("Host uses a standalone Git distribution"); return; }
  assert.equal(nativeGitExecutable({ Path: path.join(directory, "cmd") }), actual);
  const f = fixture(t), fake = path.join(f.base, "unresolved/cmd"); mkdirSync(fake, { recursive: true }); writeFileSync(path.join(fake, "git.exe"), "launcher");
  assert.throws(() => nativeGitExecutable({ PATH: fake }), /termination/);
});

it("cannot disclose denied historical descendants through a deleted or replaced directory path", host, async t => {
  const f = fixture(t), directory = path.join(f.root, "prior"); mkdirSync(directory); writeFileSync(path.join(directory, "denied.txt"), "HISTORICAL_DENIED_CANARY\n");
  f.git("add", "prior"); f.git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "historical tree");
  assert.equal(path.relative(f.root, directory), "prior"); await rm(directory, { recursive: true });
  const files = createRoleFiles({ ":root": "deny", [f.root]: "write", [path.join(directory, "denied.txt")]: "deny" }, "dev");
  const broker = createRoleGit({ root: f.root, agent: "dev", fileBroker: files });
  try {
    await assert.rejects(broker.call("role_git_read", { operation: "diff", paths: [directory] }), /Historical.*scope/);
    writeFileSync(directory, "replacement regular file\n"); f.git("add", "-A", "--", "prior");
    for (const operation of ["diff", "show", "status"]) await assert.rejects(broker.call("role_git_read", { operation, paths: [directory] }), /Historical.*scope/);
  } finally { await broker.close(); }
});
