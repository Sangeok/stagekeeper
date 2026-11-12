import assert from "node:assert/strict";
import childProcess, { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanupTaskBranches } from "./cleanup-task-branches.mjs";

const directories = [];
const repo = "fixture/stagekeeper";
const branch = "harness/completed";
const script = fileURLToPath(new URL("./cleanup-task-branches.mjs", import.meta.url));
let originalGitEnvironment;

beforeEach(() => {
  originalGitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("GIT_")));
  for (const key of Object.keys(originalGitEnvironment)) delete process.env[key];
  const directory = mkdtempSync(join(realpathSync(tmpdir()), "stagekeeper-git-config-"));
  directories.push(directory);
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.GIT_CONFIG_GLOBAL = join(directory, "empty-config");
});

function interceptCommands(t, intercept) {
  const original = spawnSync;
  t.mock.method(childProcess, "spawnSync", (executable, args, options) => intercept(executable, args, options, original));
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

function assertSummary(report) {
  assert.equal(report.summary.total, report.results.length);
  assert.equal(report.summary.ancestor + report.summary.mergedPr + report.summary.unverified, report.summary.total);
  assert.equal(report.summary.eligible + report.summary.deleted + report.summary.skipped, report.summary.total);
  for (const row of report.results) {
    if (row.status === "skipped") assert.equal(row.reason, row.reasons[0]);
    else { assert.deepEqual(row.reasons, []); assert.equal(row.reason, undefined); }
  }
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(cwd, ".no-global-git-config"),
  } });
  assert.equal(result.status, 0, `git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function fixture({ squash = false, rebase = false, remoteDev = true } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "stagekeeper-branch-cleanup-"));
  directories.push(root);
  const cwd = join(root, "checkout");
  const origin = join(root, "origin.git");
  git(root, "init", "--bare", origin);
  git(root, "init", "--initial-branch=main", cwd);
  git(cwd, "config", "user.name", "Fixture");
  git(cwd, "config", "user.email", "fixture@example.test");
  writeFileSync(join(cwd, "README.md"), "base\n");
  git(cwd, "add", "README.md");
  git(cwd, "commit", "-m", "base");
  const base = git(cwd, "rev-parse", "HEAD");
  const url = "https://github.com/fixture/stagekeeper.git";
  git(cwd, "config", `url.${origin}.insteadOf`, url);
  git(cwd, "remote", "add", "origin", url);
  git(cwd, "push", "origin", "main");
  git(cwd, "switch", "-c", "dev");
  git(cwd, "switch", "-c", branch);
  writeFileSync(join(cwd, "feature.txt"), "completed\n");
  git(cwd, "add", "feature.txt");
  git(cwd, "commit", "-m", "feature");
  const sha = git(cwd, "rev-parse", "HEAD");
  git(cwd, "config", `branch.${branch}.remote`, "origin");
  git(cwd, "config", `branch.${branch}.merge`, `refs/heads/${branch}`);
  git(cwd, "switch", "dev");
  if (rebase) {
    git(cwd, "commit", "--allow-empty", "-m", "integration advance");
    git(cwd, "switch", "-c", "rebased", branch);
    git(cwd, "rebase", "dev");
    git(cwd, "switch", "dev");
    git(cwd, "merge", "--ff-only", "rebased");
  } else if (squash) {
    git(cwd, "merge", "--squash", branch);
    git(cwd, "commit", "-m", "squashed feature");
  } else git(cwd, "merge", "--no-ff", branch, "-m", "merge feature");
  const merge = git(cwd, "rev-parse", "HEAD");
  if (remoteDev) git(cwd, "push", "origin", "dev");
  git(cwd, "switch", "main");
  const pr = {
    number: 9, state: "closed", merged_at: "2026-10-21T00:00:00Z", merge_commit_sha: merge,
    base: { ref: "dev", repo: { full_name: repo } }, head: { ref: branch, sha, repo: { full_name: repo } },
  };
  const runs = [{
    path: ".github/workflows/check.yml", head_sha: sha, event: "pull_request", pull_requests: [{ number: 9 }],
    head_branch: branch, head_repository: { full_name: repo }, repository: { full_name: repo },
    run_number: 1, run_attempt: 1, status: "completed", conclusion: "success",
  }];
  const calls = [];
  const github = (endpoint, query) => {
    calls.push({ endpoint, query });
    if (endpoint.endsWith("/pulls")) return [query.state === "all" ? [pr] : []];
    return [{ workflow_runs: runs }];
  };
  return { root, cwd, base, sha, merge, pr, runs, calls, github };
}

function result(f, options = {}) {
  return cleanupTaskBranches({ cwd: f.cwd, github: f.github, branches: [branch], ...options }).results[0];
}

function exists(f, name = branch) {
  return spawnSync("git", ["show-ref", "--verify", `refs/heads/${name}`], { cwd: f.cwd, stdio: "ignore" }).status === 0;
}

function protectedHeads(f) {
  assert.equal(git(f.cwd, "rev-parse", "refs/heads/main"), f.base);
  assert.equal(git(f.cwd, "rev-parse", "refs/heads/dev"), f.merge);
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];
  Object.assign(process.env, originalGitEnvironment);
});

it("recognizes an ancestor without a pull request or Actions evidence", () => {
  const f = fixture();
  const github = endpoint => {
    assert.ok(endpoint.endsWith("/pulls"));
    return [[]];
  };
  const preview = result(f, { github });
  assert.equal(preview.status, "eligible");
  assert.equal(preview.preservation, "ancestor");
  assert.ok(exists(f));
  assert.equal(result(f, { github, apply: true }).status, "deleted");
  assert.ok(!exists(f));
  protectedHeads(f);
});

it("reports inclusion even when a checked-out branch cannot be deleted", () => {
  const f = fixture();
  git(f.cwd, "switch", branch);
  const report = cleanupTaskBranches({ cwd: f.cwd, github: () => assert.fail("Unexpected API call") });
  assert.equal(report.results[0].preservation, "ancestor");
  assert.equal(report.results[0].reason, "worktree-in-use");
  assert.equal(report.summary.ancestor, 1);
  assert.equal(report.summary.worktreeInUse, 1);
  assert.equal(report.summary.eligible, 0);
  assert.ok(exists(f));
});

it("rejects protected names, ref aliases and invalid targets before inspecting any repository", () => {
  for (const name of ["main", "dev", "refs/heads/main", "origin/dev", "refs/remotes/origin/main", "refs/heads/harness/x", "harness/../main", "harness/a//b", "harness/a.lock", "harness/a\nmain", "--all", "harness/x;git branch -D main"]) {
    assert.throws(() => cleanupTaskBranches({ cwd: "/does-not-exist", apply: true, branches: [name] }), /must never|Only literal/);
  }
});

it("rejects malformed apply options and CLI arguments before any Git or GitHub inspection", () => {
  assert.throws(() => cleanupTaskBranches({ apply: "false" }), /Invalid cleanup options/);
  const script = fileURLToPath(new URL("./cleanup-task-branches.mjs", import.meta.url));
  for (const args of [["--branch", "main", "--apply"], ["--branch", "dev"], ["--branch"], ["--force"], ["--apply", "--apply"]]) {
    const invocation = spawnSync(process.execPath, [script, ...args], { cwd: realpathSync(tmpdir()), encoding: "utf8" });
    assert.equal(invocation.status, 1);
    assert.match(invocation.stderr, /must never|Usage:/);
    assert.equal(invocation.stdout, "");
  }
});

it("defaults to a preview and deletes only the verified local task ref when explicitly applied", () => {
  const f = fixture();
  assert.equal(result(f).status, "eligible");
  assert.ok(exists(f));
  assert.equal(result(f, { apply: true }).status, "deleted");
  assert.ok(!exists(f));
  protectedHeads(f);
  assert.equal(result(f, { apply: true }).reason, "branch-missing");
});

it("uses merged PR evidence for a squash merge without relying on the original commit being an ancestor", () => {
  const f = fixture({ squash: true });
  assert.notEqual(f.sha, f.merge);
  assert.equal(spawnSync("git", ["merge-base", "--is-ancestor", f.sha, "dev"], { cwd: f.cwd }).status, 1);
  assert.equal(result(f, { apply: true }).status, "deleted");
  protectedHeads(f);
});

it("does not select main, dev or branches outside harness even when all PR evidence would allow deletion", () => {
  const f = fixture();
  git(f.cwd, "branch", "feature/keep", f.sha);
  const report = cleanupTaskBranches({ cwd: f.cwd, github: f.github, apply: true });
  assert.deepEqual(report.results.map(item => item.branch), [branch]);
  assert.ok(exists(f, "feature/keep"));
  protectedHeads(f);
});

it("refuses a symbolic harness ref that aliases a protected branch without querying GitHub", () => {
  const f = fixture();
  git(f.cwd, "symbolic-ref", "refs/heads/harness/alias", "refs/heads/main");
  const report = cleanupTaskBranches({ cwd: f.cwd, apply: true, branches: ["harness/alias"], github: () => assert.fail("Unexpected GitHub query") });
  assert.equal(report.results[0].reason, "symbolic-ref");
  protectedHeads(f);
});

for (const dirty of ["unstaged", "staged", "untracked"]) {
  it(`preserves branches when the executing worktree has ${dirty} changes`, () => {
    const f = fixture();
    writeFileSync(join(f.cwd, dirty === "untracked" ? "draft.txt" : "README.md"), "preserve me\n");
    if (dirty === "staged") git(f.cwd, "add", "README.md");
    assert.equal(result(f, { apply: true }).reason, "working-tree-dirty");
    assert.equal(f.calls.length, 0);
    assert.ok(exists(f));
    protectedHeads(f);
  });
}

it("preserves a branch checked out in either the current or another linked worktree", () => {
  const f = fixture();
  git(f.cwd, "switch", branch);
  assert.equal(result(f, { apply: true }).reason, "worktree-in-use");
  git(f.cwd, "switch", "main");
  git(f.cwd, "worktree", "add", join(f.root, "other checkout"), branch);
  assert.equal(result(f, { apply: true }).reason, "worktree-in-use");
  assert.equal(f.calls.length, 0);
  assert.ok(exists(f));
});

for (const [condition, change] of [
  ["closed without merging", pr => { pr.merged_at = null; }],
  ["still open", pr => { pr.state = "open"; }],
  ["merged into main", pr => { pr.base.ref = "main"; }],
  ["different base repository", pr => { pr.base.repo.full_name = "other/repo"; }],
  ["different head repository", pr => { pr.head.repo.full_name = "fork/repo"; }],
  ["additional local commits", pr => { pr.head.sha = "a".repeat(40); }],
  ["merge missing from dev", pr => { pr.merge_commit_sha = "b".repeat(40); }],
]) {
  it(`preserves a branch when its PR is ${condition}`, () => {
    const f = fixture({ squash: true });
    change(f.pr);
    assert.equal(result(f, { apply: true }).status, "skipped");
    assert.ok(exists(f));
    protectedHeads(f);
  });
}

it("preserves branches referenced by dependent open PRs", () => {
  const f = fixture();
  const github = (endpoint, query) => query.base === branch ? [[{ number: 10, state: "open", base: { ref: branch, repo: { full_name: repo } } }]] : f.github(endpoint, query);
  assert.equal(result(f, { apply: true, github }).reason, "dependent-pr");
  assert.ok(exists(f));
});

it("uses all returned PR pages instead of treating the first page as complete", () => {
  const f = fixture({ squash: true });
  const github = (endpoint, query) => query.state === "all" ? [[], [f.pr]] : f.github(endpoint, query);
  assert.equal(result(f, { apply: true, github }).status, "deleted");
  assert.ok(f.calls.some(call => call.endpoint.endsWith("/actions/runs")));
  protectedHeads(f);
});

it("verifies the repository, source branch and commit when GitHub drops PR links after branch deletion", () => {
  const f = fixture({ squash: true });
  f.runs[0].pull_requests = [];
  assert.equal(result(f, { apply: true }).status, "deleted");
  assert.ok(f.calls.some(call => call.endpoint.endsWith("/actions/runs")));
  protectedHeads(f);
});

for (const [condition, change] of [
  ["missing", runs => { runs.length = 0; }],
  ["for another commit", runs => { runs[0].head_sha = "a".repeat(40); }],
  ["linked to another PR", runs => { runs[0].pull_requests = [{ number: 10 }]; }],
  ["missing its PR association metadata", runs => { delete runs[0].pull_requests; }],
  ["for another branch at the same commit", runs => { runs[0].head_branch = "harness/other"; }],
  ["from another source repository", runs => { runs[0].head_repository = { full_name: "fork/stagekeeper" }; }],
  ["from another workflow repository", runs => { runs[0].repository = { full_name: "other/stagekeeper" }; }],
  ["missing the check workflow", runs => { runs[0].path = ".github/workflows/other.yml"; }],
  ["failed", runs => { runs[0].conclusion = "failure"; }],
  ["running", runs => { runs[0].status = "in_progress"; }],
  ["missing the attempt number", runs => { runs[0].run_attempt = undefined; }],
  ["failed on a newer attempt", runs => { runs.push({ ...runs[0], run_attempt: 2, conclusion: "failure" }); }],
  ["waiting for Windows CI", runs => { runs.push({ ...runs[0], path: ".github/workflows/windows-role-runtime.yml", status: "queued", conclusion: null }); }],
]) {
  it(`preserves branches whose final commit CI is ${condition}`, () => {
    const f = fixture({ squash: true });
    change(f.runs);
    assert.equal(result(f, { apply: true }).status, "skipped");
    assert.ok(exists(f));
    protectedHeads(f);
  });
}

for (const squash of [false, true]) it(`preserves branches when GitHub is unavailable or returns malformed pagination: squash=${squash}`, () => {
  const f = fixture({ squash });
  for (const github of [() => { throw new Error("credential must not appear"); }, () => [], () => [{ error: "partial response" }]]) {
    assert.equal(result(f, { apply: true, github }).reason, "inspection-failed");
    assert.ok(exists(f));
  }
});

it("stops without deleting anything if a protected remote branch is missing", () => {
  const f = fixture({ remoteDev: false });
  assert.throws(() => result(f, { apply: true }), /Protected origin/);
  assert.ok(exists(f));
  assert.equal(f.calls.length, 0);
  protectedHeads(f);
});

for (const squash of [false, true]) it(`preserves additional local commits and remote branch reuse after a merged PR: squash=${squash}`, () => {
  const f = fixture({ squash });
  const newer = git(f.cwd, "commit-tree", `${f.sha}^{tree}`, "-p", f.sha, "-m", "later work");
  git(f.cwd, "update-ref", `refs/heads/${branch}`, newer);
  assert.equal(result(f, { apply: true }).reason, "merged-pr-unverified");
  git(f.cwd, "push", "origin", branch);
  git(f.cwd, "update-ref", `refs/heads/${branch}`, f.sha, newer);
  assert.equal(result(f, { apply: true }).reason, "remote-branch-changed");
  assert.ok(exists(f));
  protectedHeads(f);
});

for (const squash of [false, true]) it(`rechecks local state before deletion when another process adds work during GitHub inspection: squash=${squash}`, () => {
  const f = fixture({ squash });
  const newer = git(f.cwd, "commit-tree", `${f.sha}^{tree}`, "-p", f.sha, "-m", "concurrent work");
  const github = (endpoint, query) => {
    const response = f.github(endpoint, query);
    if (endpoint.endsWith("/pulls") && query.state === "all") git(f.cwd, "update-ref", `refs/heads/${branch}`, newer, f.sha);
    return response;
  };
  assert.equal(result(f, { apply: true, github }).reason, "branch-changed");
  assert.equal(git(f.cwd, "rev-parse", branch), newer);
  protectedHeads(f);
});

for (const squash of [false, true]) it(`preserves branches if origin/dev moves while completion evidence is being inspected: squash=${squash}`, () => {
  const f = fixture({ squash });
  const newer = git(f.cwd, "commit-tree", `${f.merge}^{tree}`, "-p", f.merge, "-m", "new integration work");
  const github = (endpoint, query) => {
    const response = f.github(endpoint, query);
    if (endpoint.endsWith("/pulls") && query.state === "all") git(f.cwd, "push", "origin", `${newer}:refs/heads/dev`);
    return response;
  };
  assert.equal(result(f, { apply: true, github }).reason, "origin-dev-changed");
  assert.ok(exists(f));
  protectedHeads(f);
});

for (const squash of [false, true]) it(`rechecks untracked work appearing while completion evidence is being inspected: squash=${squash}`, () => {
  const f = fixture({ squash });
  const github = (endpoint, query) => {
    const response = f.github(endpoint, query);
    if (endpoint.endsWith("/pulls") && query.state === "all") writeFileSync(join(f.cwd, "new-work.txt"), "preserve me\n");
    return response;
  };
  assert.equal(result(f, { apply: true, github }).reason, "working-tree-dirty");
  assert.ok(exists(f));
  assert.equal(readFileSync(join(f.cwd, "new-work.txt"), "utf8"), "preserve me\n");
  protectedHeads(f);
});

it("accepts additional local commits already in dev without using the old PR head", () => {
  const f = fixture();
  git(f.cwd, "update-ref", `refs/heads/${branch}`, f.merge, f.sha);
  f.runs[0].conclusion = "failure";
  const row = result(f, { apply: true });
  assert.equal(row.status, "deleted");
  assert.equal(row.sha, f.merge);
  assert.equal(row.pr, undefined);
  assert.ok(!f.calls.some(call => call.endpoint.endsWith("/actions/runs")));
});

it("verifies a rebased merge with its exact original PR head", () => {
  const f = fixture({ rebase: true });
  assert.equal(spawnSync("git", ["merge-base", "--is-ancestor", f.sha, f.pr.merge_commit_sha], { cwd: f.cwd }).status, 1);
  const row = result(f, { apply: true });
  assert.equal(row.status, "deleted");
  assert.equal(row.preservation, "merged-pr");
  assert.equal(row.pr, 9);
});

for (const squash of [false, true]) {
  it(`protects an open PR on a later page regardless of repository casing: squash=${squash}`, () => {
    const f = fixture({ squash });
    f.pr.state = "open";
    f.pr.head.repo.full_name = "Fixture/StageKeeper";
    const github = (endpoint, query) => query.state === "all" ? [[], [f.pr]] : f.github(endpoint, query);
    const row = result(f, { github });
    assert.equal(row.reason, "open-pr");
    assert.ok(exists(f));
  });

  for (const invalid of [null, {}, { number: 9, state: "open", head: { ref: branch, repo: null } },
    { number: 9, state: "unknown", head: { ref: branch, repo: { full_name: repo } } }]) {
    it(`preserves ${squash ? "squashed" : "ancestor"} refs with malformed PR evidence ${JSON.stringify(invalid)}`, () => {
      const f = fixture({ squash });
      const github = (endpoint, query) => query.state === "all" ? [[invalid]] : f.github(endpoint, query);
      assert.equal(result(f, { apply: true, github }).reason, "inspection-failed");
      assert.ok(exists(f));
      protectedHeads(f);
    });
  }

  it(`protects dependent and malformed base PRs on the ${squash ? "PR" : "ancestor"} path`, () => {
    const f = fixture({ squash });
    for (const base of [{ ref: branch, repo: { full_name: repo } }, { ref: "other", repo: { full_name: repo } }]) {
      const github = (endpoint, query) => query.base ? [[{ number: 10, state: "open", base }]] : f.github(endpoint, query);
      assert.equal(result(f, { apply: true, github }).reason, base.ref === branch ? "dependent-pr" : "inspection-failed");
      assert.ok(exists(f));
    }
  });
}

it("deduplicates requested branches and reports empty and missing targets", () => {
  const f = fixture();
  const report = cleanupTaskBranches({ cwd: f.cwd, branches: [branch, branch], github: f.github, apply: true });
  assertSummary(report);
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.deleted, 1);
  assert.equal(report.aborted, false);
  const missing = cleanupTaskBranches({ cwd: f.cwd, branches: [branch, branch], github: () => assert.fail("Unexpected API") });
  assertSummary(missing);
  assert.equal(missing.results[0].reason, "branch-missing");
  const empty = cleanupTaskBranches({ cwd: f.cwd });
  assertSummary(empty);
  assert.equal(empty.summary.total, 0);
});

for (const state of ["clean", "dirty", "missing", "metadata-missing", "locked", "newline"]) {
  it(`keeps a ${state} worktree and reports its actual diagnostic state`, { skip: state === "newline" && process.platform === "win32" }, () => {
    const f = fixture();
    const path = state === "metadata-missing" ? join(f.cwd, "nested") : join(f.root, state === "newline" ? "line\nbreak" : "with space");
    git(f.cwd, "worktree", "add", path, branch);
    if (state === "dirty") writeFileSync(join(path, "draft.txt"), "keep me");
    if (state === "missing") renameSync(path, `${path}-moved`);
    if (state === "metadata-missing") unlinkSync(join(path, ".git"));
    if (state === "locked") git(f.cwd, "worktree", "lock", "--reason", "fixture owner", path);
    const row = result(f, { apply: true });
    assert.equal(row.preservation, "ancestor");
    assert.ok(row.reasons.includes("worktree-in-use"));
    assert.equal(row.worktrees[0].path, path);
    assert.equal(row.worktrees[0].changes, ["missing", "metadata-missing"].includes(state) ? "unknown" : state === "dirty" ? "dirty" : "clean");
    assert.equal(row.worktrees[0].locked, state === "locked");
    if (state === "missing") assert.equal(row.worktrees[0].prunable, true);
    assert.ok(exists(f));
    assert.equal(f.calls.length, 0);
    if (state === "dirty") assert.equal(readFileSync(join(path, "draft.txt"), "utf8"), "keep me");
  });
}

it("reports dirty and checkout reasons together without querying GitHub", () => {
  const f = fixture();
  git(f.cwd, "switch", branch);
  writeFileSync(join(f.cwd, "draft.txt"), "keep me");
  const report = cleanupTaskBranches({ cwd: f.cwd, github: () => assert.fail("Unexpected API"), apply: true });
  assertSummary(report);
  assert.equal(report.results[0].preservation, "ancestor");
  assert.deepEqual(report.results[0].reasons, ["working-tree-dirty", "worktree-in-use"]);
  assert.equal(report.summary.worktreeInUse, 1);
});

for (const failure of ["error", "timeout"]) {
  it(`does not mistake an ancestry ${failure} for a negative result`, t => {
    const f = fixture();
    interceptCommands(t, (executable, args, options, original) => {
      if (executable === "git" && args[0] === "merge-base") return failure === "timeout"
        ? { status: null, error: Object.assign(new Error("private"), { code: "ETIMEDOUT" }), stdout: "" }
        : { status: 128, stdout: "", stderr: "private" };
      return original(executable, args, options);
    });
    const row = result(f, { apply: true });
    assert.equal(row.reason, "inspection-failed");
    assert.equal(row.preservation, "unverified");
    assert.equal(f.calls.length, 0);
    assert.ok(exists(f));
  });
}

it("rejects malformed worktree registries before deleting any ref", t => {
  const f = fixture();
  interceptCommands(t, (executable, args, options, original) => {
    if (executable === "git" && args[0] === "worktree") return { status: 0, stdout: "worktree damaged\0HEAD bad\0\0" };
    return original(executable, args, options);
  });
  assert.throws(() => result(f, { apply: true }), /Shared Git state/);
  assert.ok(exists(f));
});

for (const apply of [false, true]) {
  for (const failure of ["dev-changed", "remote-unavailable", "protected-missing", "registry-unavailable"]) {
    it(`aborts ${apply ? "apply" : "preview"} after partial progress on ${failure}`, t => {
      const f = fixture();
      const second = "harness/second", third = "harness/third", checkedOut = "harness/checked-out";
      for (const name of [second, third, checkedOut]) git(f.cwd, "branch", name, f.sha);
      git(f.cwd, "worktree", "add", join(f.root, "in use"), checkedOut);
      let failRegistry = false;
      if (failure === "registry-unavailable") interceptCommands(t, (executable, args, options, original) => {
        if (failRegistry && executable === "git" && args[0] === "worktree") return { status: 1, stdout: "" };
        return original(executable, args, options);
      });
      const calls = [];
      const github = (endpoint, query) => {
        calls.push(query);
        if (query.base === second) {
          if (failure === "dev-changed") {
            const next = git(f.cwd, "commit-tree", `${f.merge}^{tree}`, "-p", f.merge, "-m", "advance");
            git(f.cwd, "push", "origin", `${next}:refs/heads/dev`);
          } else if (failure === "remote-unavailable") git(f.cwd, "remote", "set-url", "origin", join(f.root, "unavailable"));
          else if (failure === "protected-missing") {
            const alternate = join(f.root, "missing.git");
            git(f.cwd, "init", "--bare", alternate);
            git(f.cwd, "remote", "set-url", "origin", alternate);
          } else failRegistry = true;
        }
        return [[]];
      };
      const report = cleanupTaskBranches({ cwd: f.cwd, branches: [checkedOut, branch, second, third], apply, github });
      assertSummary(report);
      assert.equal(report.aborted, true);
      assert.equal(report.summary.deleted, apply ? 1 : 0);
      assert.equal(report.summary.eligible, 0);
      for (const row of report.results.filter(row => row.status !== "deleted")) {
        assert.equal(row.preservation, "unverified");
        assert.ok(row.reasons.includes(failure === "dev-changed" ? "origin-dev-changed" : "inspection-failed"));
        assert.ok(exists(f, row.branch));
      }
      assert.ok(report.results[0].reasons.includes("worktree-in-use"));
      assert.equal(exists(f), !apply);
      assert.ok(!calls.some(query => query.base === third));
      protectedHeads(f);
    });
  }
}

it("continues past a candidate API failure while preserving that branch", () => {
  const f = fixture();
  const second = "harness/second", third = "harness/third";
  for (const name of [second, third]) git(f.cwd, "branch", name, f.sha);
  const github = (endpoint, query) => {
    if (query.head?.endsWith(`:${second}`)) throw new Error("private credential");
    return [[]];
  };
  const report = cleanupTaskBranches({ cwd: f.cwd, branches: [branch, second, third], apply: true, github });
  assertSummary(report);
  assert.equal(report.aborted, false);
  assert.deepEqual(report.results.map(row => row.status), ["deleted", "skipped", "deleted"]);
  assert.ok(exists(f, second));
  assert.ok(!exists(f, third));
  assert.ok(!JSON.stringify(report).includes("private credential"));
});

for (const squash of [false, true]) it(`invalidates stale preservation when another caller deletes the ref first: squash=${squash}`, () => {
  const f = fixture({ squash });
  let nested;
  const github = (endpoint, query) => {
    if (query.state === "all" && !nested) nested = result(f, { apply: true });
    return f.github(endpoint, query);
  };
  const row = result(f, { apply: true, github });
  assert.equal(nested.status, "deleted");
  assert.equal(row.reason, "branch-missing");
  assert.equal(row.preservation, "unverified");
  protectedHeads(f);
});

it("retains the config-cleanup note after a successful ref deletion", t => {
  const f = fixture();
  interceptCommands(t, (executable, args, options, original) => {
    if (executable === "git" && args.includes("--remove-section")) return { status: 1, stdout: "" };
    return original(executable, args, options);
  });
  const row = result(f, { apply: true });
  assert.equal(row.status, "deleted");
  assert.equal(row.note, "branch-config-absent-or-retained");
  assert.ok(!exists(f));
});

it("preserves a new commit written by another caller after the final inspection", t => {
  const f = fixture();
  const newer = git(f.cwd, "commit-tree", `${f.sha}^{tree}`, "-p", f.sha, "-m", "new owner work");
  let intervened = false;
  interceptCommands(t, (executable, args, options, original) => {
    if (executable === "git" && args[0] === "update-ref" && args.includes("-d") && !intervened) {
      intervened = true;
      const update = original("git", ["update-ref", `refs/heads/${branch}`, newer, f.sha], options);
      assert.equal(update.status, 0);
    }
    return original(executable, args, options);
  });
  const row = result(f, { apply: true });
  assert.equal(intervened, true);
  assert.equal(row.reason, "branch-changed-or-locked");
  assert.equal(row.preservation, "unverified");
  assert.equal(git(f.cwd, "rev-parse", branch), newer);
  protectedHeads(f);
});

for (const squash of [false, true]) it(`preserves a branch newly checked out during evidence inspection: squash=${squash}`, () => {
  const f = fixture({ squash });
  const path = join(f.root, "new owner");
  const github = (endpoint, query) => {
    if (query.state === "all") git(f.cwd, "worktree", "add", path, branch);
    return f.github(endpoint, query);
  };
  const row = result(f, { apply: true, github });
  assert.equal(row.reason, "worktree-in-use");
  assert.equal(row.worktrees[0].path, path);
  assert.ok(exists(f));
});

it("releases an expendable clean owned worktree before deleting its branch", () => {
  const f = fixture();
  const path = join(f.root, "finished");
  git(f.cwd, "worktree", "add", path, branch);
  assert.equal(result(f, { apply: true }).reason, "worktree-in-use");
  git(f.cwd, "worktree", "remove", path);
  assert.equal(result(f, { apply: true }).status, "deleted");
  assert.equal(existsSync(path), false);
  assert.equal(exists(f), false);
  protectedHeads(f);
});

it("prints partial JSON and exits unsuccessfully when the CLI aborts", () => {
  const f = fixture();
  git(f.cwd, "branch", "harness/second", f.sha);
  const preload = join(f.root, "api-fixture.mjs");
  writeFileSync(preload, `import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const original = cp.spawnSync;
let remoteReads = 0;
cp.spawnSync = (command, args, options) => {
  if (command === "gh") return { status: 0, stdout: "[[]]" };
  if (command === "git" && args[0] === "ls-remote" && ++remoteReads === 3) return { status: 1, stdout: "" };
  return original(command, args, options);
};
syncBuiltinESMExports();
`);
  const invocation = spawnSync(process.execPath, ["--import", preload, script, "--apply"], { cwd: f.cwd, encoding: "utf8" });
  assert.equal(invocation.status, 1);
  const report = JSON.parse(invocation.stdout);
  assertSummary(report);
  assert.equal(report.aborted, true);
  assert.equal(report.summary.deleted, 1);
  assert.ok(exists(f, "harness/second"));
  assert.ok(!exists(f));
});

it("prints successful and per-candidate-skip CLI JSON with exit zero", () => {
  const f = fixture();
  const preload = join(f.root, "successful-api.mjs");
  writeFileSync(preload, `import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const original = cp.spawnSync;
cp.spawnSync = (command, args, options) => command === "gh"
  ? { status: 0, stdout: "[[]]" } : original(command, args, options);
syncBuiltinESMExports();
`);
  const preview = spawnSync(process.execPath, ["--import", preload, script], { cwd: f.cwd, encoding: "utf8" });
  assert.equal(preview.status, 0);
  const eligible = JSON.parse(preview.stdout);
  assertSummary(eligible);
  assert.equal(eligible.summary.eligible, 1);
  writeFileSync(join(f.cwd, "draft.txt"), "preserve");
  const blocked = spawnSync(process.execPath, [script], { cwd: f.cwd, encoding: "utf8" });
  assert.equal(blocked.status, 0);
  const skipped = JSON.parse(blocked.stdout);
  assertSummary(skipped);
  assert.equal(skipped.results[0].reason, "working-tree-dirty");
  assert.ok(exists(f));
});

it("exposes parseable npm-silent JSON without contacting live GitHub", () => {
  const f = fixture();
  writeFileSync(join(f.cwd, "package.json"), JSON.stringify({ scripts: { "branches:cleanup": "node cleanup.mjs" } }));
  writeFileSync(join(f.cwd, "cleanup.mjs"), readFileSync(script));
  const npmCli = process.env.npm_execpath ?? (process.platform === "win32"
    ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    : realpathSync(join(dirname(process.execPath), "npm")));
  const invocation = spawnSync(process.execPath, [npmCli, "--silent", "run", "branches:cleanup"], { cwd: f.cwd, encoding: "utf8" });
  assert.equal(invocation.status, 0, invocation.stderr);
  const report = JSON.parse(invocation.stdout);
  assertSummary(report);
  assert.equal(report.summary.skipped, 1);
  assert.equal(report.results[0].preservation, "ancestor");
  assert.ok(exists(f));
});

it("isolates Git configuration for commands executed by cleanup itself", t => {
  const f = fixture();
  const inspected = [];
  interceptCommands(t, (executable, args, options, original) => {
    if (options.env?.GIT_NO_REPLACE_OBJECTS === "1") inspected.push(options.env);
    return original(executable, args, options);
  });
  assert.equal(result(f).status, "eligible");
  assert.ok(inspected.length > 0);
  assert.ok(inspected.every(env => env.GIT_CONFIG_NOSYSTEM === "1" && env.GIT_CONFIG_GLOBAL === process.env.GIT_CONFIG_GLOBAL));
});

it("compares repository identities without changing branch-name case semantics", () => {
  const f = fixture({ squash: true });
  f.pr.head.repo.full_name = "Fixture/StageKeeper";
  f.pr.base.repo.full_name = "FIXTURE/STAGEKEEPER";
  assert.equal(result(f).preservation, "merged-pr");
  f.pr.head.ref = branch.toUpperCase();
  assert.equal(result(f).reason, "merged-pr-unverified");
  assert.ok(exists(f));
});

it("ends owned worktrees without losing ignored files or external link targets", () => {
  const f = fixture();
  const path = join(f.root, "owned"), external = join(f.root, "external");
  mkdirSync(external);
  git(f.cwd, "worktree", "add", path, branch);
  writeFileSync(join(path, ".gitignore"), "private.env\nexternal-link\n");
  git(path, "add", ".gitignore");
  git(path, "commit", "-m", "ignore local files");
  git(f.cwd, "switch", "dev");
  git(f.cwd, "merge", "--no-ff", branch, "-m", "preserve owned work");
  git(f.cwd, "push", "origin", "dev");
  git(f.cwd, "switch", "main");
  writeFileSync(join(path, "private.env"), "synthetic secret");
  writeFileSync(join(external, "data.txt"), "external data");
  symlinkSync(external, join(path, "external-link"), process.platform === "win32" ? "junction" : "dir");
  git(path, "switch", "--detach", "HEAD");
  const row = result(f, { apply: true });
  assert.equal(row.status, "deleted");
  assert.equal(readFileSync(join(path, "private.env"), "utf8"), "synthetic secret");
  assert.equal(readFileSync(join(external, "data.txt"), "utf8"), "external data");
  assert.ok(existsSync(path));
});
