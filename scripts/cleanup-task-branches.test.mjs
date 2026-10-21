import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanupTaskBranches } from "./cleanup-task-branches.mjs";

const directories = [];
const repo = "fixture/stagekeeper";
const branch = "harness/completed";

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: {
    ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(cwd, ".no-global-git-config"),
  } });
  assert.equal(result.status, 0, `git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function fixture({ squash = false, remoteDev = true } = {}) {
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
  if (squash) {
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
    const f = fixture();
    change(f.pr);
    assert.equal(result(f, { apply: true }).status, "skipped");
    assert.ok(exists(f));
    protectedHeads(f);
  });
}

it("preserves branches referenced by dependent open PRs", () => {
  const f = fixture();
  const github = (endpoint, query) => query.base === branch ? [[{ number: 10 }]] : f.github(endpoint, query);
  assert.equal(result(f, { apply: true, github }).reason, "dependent-pr");
  assert.ok(exists(f));
});

it("uses all returned PR pages instead of treating the first page as complete", () => {
  const f = fixture();
  const github = (endpoint, query) => query.state === "all" ? [[], [f.pr]] : f.github(endpoint, query);
  assert.equal(result(f, { apply: true, github }).status, "deleted");
  protectedHeads(f);
});

it("verifies the repository, source branch and commit when GitHub drops PR links after branch deletion", () => {
  const f = fixture();
  f.runs[0].pull_requests = [];
  assert.equal(result(f, { apply: true }).status, "deleted");
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
    const f = fixture();
    change(f.runs);
    assert.equal(result(f, { apply: true }).status, "skipped");
    assert.ok(exists(f));
    protectedHeads(f);
  });
}

it("preserves branches when GitHub is unavailable or returns malformed pagination", () => {
  const f = fixture();
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

it("preserves additional local commits and remote branch reuse after a merged PR", () => {
  const f = fixture();
  const newer = git(f.cwd, "commit-tree", `${f.sha}^{tree}`, "-p", f.sha, "-m", "later work");
  git(f.cwd, "update-ref", `refs/heads/${branch}`, newer);
  assert.equal(result(f, { apply: true }).reason, "merged-pr-unverified");
  git(f.cwd, "push", "origin", branch);
  git(f.cwd, "update-ref", `refs/heads/${branch}`, f.sha, newer);
  assert.equal(result(f, { apply: true }).reason, "remote-branch-changed");
  assert.ok(exists(f));
  protectedHeads(f);
});

it("rechecks local state before deletion when another process adds work during GitHub inspection", () => {
  const f = fixture();
  const newer = git(f.cwd, "commit-tree", `${f.sha}^{tree}`, "-p", f.sha, "-m", "concurrent work");
  const github = (endpoint, query) => {
    const response = f.github(endpoint, query);
    if (endpoint.endsWith("/actions/runs")) git(f.cwd, "update-ref", `refs/heads/${branch}`, newer, f.sha);
    return response;
  };
  assert.equal(result(f, { apply: true, github }).reason, "branch-changed");
  assert.equal(git(f.cwd, "rev-parse", branch), newer);
  protectedHeads(f);
});

it("preserves branches if origin/dev moves while completion evidence is being inspected", () => {
  const f = fixture();
  const newer = git(f.cwd, "commit-tree", `${f.merge}^{tree}`, "-p", f.merge, "-m", "new integration work");
  const github = (endpoint, query) => {
    const response = f.github(endpoint, query);
    if (endpoint.endsWith("/actions/runs")) git(f.cwd, "push", "origin", `${newer}:refs/heads/dev`);
    return response;
  };
  assert.equal(result(f, { apply: true, github }).reason, "origin-dev-changed");
  assert.ok(exists(f));
  protectedHeads(f);
});

it("rechecks untracked work appearing while completion evidence is being inspected", () => {
  const f = fixture();
  const github = (endpoint, query) => {
    const response = f.github(endpoint, query);
    if (endpoint.endsWith("/actions/runs")) writeFileSync(join(f.cwd, "new-work.txt"), "preserve me\n");
    return response;
  };
  assert.equal(result(f, { apply: true, github }).reason, "working-tree-dirty");
  assert.ok(exists(f));
  protectedHeads(f);
});
