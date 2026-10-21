import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const protectedBranches = new Set(["main", "dev"]);
const shaPattern = /^[a-f0-9]{40}$/;

function validateBranch(branch) {
  if (protectedBranches.has(branch)) throw new Error("main and dev must never be deleted.");
  if (typeof branch !== "string" || !/^harness\/[a-z0-9][a-z0-9._/-]*$/.test(branch)
    || branch.includes("..") || branch.includes("//") || branch.includes("/.")
    || branch.endsWith("/") || branch.endsWith(".") || branch.endsWith(".lock")) {
    throw new Error("Only literal harness/<topic> local branch names are accepted.");
  }
}

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, {
    cwd, encoding: "utf8", timeout: 20000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0" },
    windowsHide: true,
  });
  return { ok: !result.error && result.status === 0, output: result.stdout ?? "" };
}

function git(cwd, args) {
  const result = command(cwd, "git", args);
  if (!result.ok) throw new Error("Git inspection failed; no branch deletion is authorized.");
  return result.output.trimEnd();
}

function githubPages(cwd, endpoint, query) {
  const suffix = new URLSearchParams({ ...query, per_page: "100" });
  const result = command(cwd, "gh", ["api", "--hostname", "github.com", "--method", "GET", "--paginate", "--slurp", `${endpoint}?${suffix}`]);
  if (!result.ok) throw new Error("GitHub inspection failed; branch preserved.");
  const pages = JSON.parse(result.output);
  if (!Array.isArray(pages) || pages.length === 0) throw new Error("Incomplete GitHub response; branch preserved.");
  return pages;
}

function arrayPages(pages) {
  if (!Array.isArray(pages) || pages.length === 0 || !pages.every(Array.isArray)) {
    throw new Error("Incomplete GitHub list; branch preserved.");
  }
  return pages.flat();
}

function repository(cwd) {
  const url = git(cwd, ["config", "--get", "remote.origin.url"]);
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error("origin must identify a GitHub repository without embedded credentials.");
  return match[1];
}

function localBranches(cwd) {
  return git(cwd, ["for-each-ref", "--format=%(refname)%09%(objectname)%09%(symref)", "refs/heads/harness/"])
    .split("\n").filter(Boolean).map(line => {
      const [ref, sha, symbolic] = line.split("\t");
      return { branch: ref.slice("refs/heads/".length), sha, symbolic: Boolean(symbolic) };
    });
}

function localReason(cwd, branch, sha) {
  validateBranch(branch);
  if (git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"])) return "working-tree-dirty";
  const checkedOut = git(cwd, ["worktree", "list", "--porcelain", "-z"]).split("\0");
  if (checkedOut.includes(`branch refs/heads/${branch}`)) return "worktree-in-use";
  const current = localBranches(cwd).find(item => item.branch === branch);
  if (!current) return "branch-missing";
  if (current.symbolic) return "symbolic-ref";
  if (current.sha !== sha) return "branch-changed";
  return null;
}

function remoteHeads(cwd, branches = []) {
  const refs = [...new Set(["main", "dev", ...branches])].map(branch => `refs/heads/${branch}`);
  const heads = new Map(git(cwd, ["ls-remote", "--heads", "origin", ...refs]).split("\n").filter(Boolean).map(line => {
    const [sha, ref] = line.split("\t");
    if (!shaPattern.test(sha) || !refs.includes(ref)) throw new Error("Invalid remote branch evidence.");
    return [ref.slice("refs/heads/".length), sha];
  }));
  if (!heads.has("main") || !heads.has("dev")) throw new Error("Protected origin/main or origin/dev is missing; cleanup stopped.");
  return heads;
}

function ciReason(pages, pr, sha) {
  if (!Array.isArray(pages) || pages.length === 0 || !pages.every(page => Array.isArray(page?.workflow_runs))) return "ci-unverified";
  const latest = new Map();
  for (const run of pages.flatMap(page => page.workflow_runs)) {
    if (run.head_sha !== sha || run.event !== "pull_request") continue;
    if (typeof run.head_branch !== "string" || typeof run.head_repository?.full_name !== "string"
      || typeof run.repository?.full_name !== "string" || !Array.isArray(run.pull_requests)) return "ci-unverified";
    if (run.head_branch !== pr.head.ref || run.head_repository.full_name !== pr.head.repo.full_name
      || run.repository.full_name !== pr.base.repo.full_name) continue;
    if (run.pull_requests.length && !run.pull_requests.some(item => item.number === pr.number)) continue;
    if (typeof run.path !== "string") return "ci-unverified";
    if (!Number.isSafeInteger(run.run_number) || run.run_number <= 0
      || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0) return "ci-unverified";
    const path = run.path.split("@")[0];
    const previous = latest.get(path);
    if (!previous || run.run_number > previous.run_number
      || run.run_number === previous.run_number && run.run_attempt > previous.run_attempt) latest.set(path, run);
  }
  if (!latest.has(".github/workflows/check.yml")) return "check-workflow-missing";
  if ([...latest.values()].some(run => run.status !== "completed" || run.conclusion !== "success")) return "ci-not-successful";
  return null;
}

function inspectCompletion(cwd, repo, candidate, devSha, github) {
  const { branch, sha } = candidate;
  const local = localReason(cwd, branch, sha);
  if (local) return { reason: local };
  const pulls = arrayPages(github(`repos/${repo}/pulls`, { state: "all", head: `${repo.split("/")[0]}:${branch}` }));
  const matching = pulls.filter(pr => pr.head?.ref === branch && pr.head?.repo?.full_name === repo);
  if (matching.some(pr => pr.state === "open")) return { reason: "open-pr" };
  const merged = matching.filter(pr => pr.state === "closed" && pr.merged_at && pr.base?.ref === "dev"
    && pr.base?.repo?.full_name === repo && pr.head?.sha === sha);
  if (merged.length !== 1) return { reason: "merged-pr-unverified" };
  const pr = merged[0];
  if (!Number.isSafeInteger(pr.number) || pr.number <= 0 || !shaPattern.test(pr.merge_commit_sha)) return { reason: "merged-pr-unverified" };
  if (!command(cwd, "git", ["merge-base", "--is-ancestor", pr.merge_commit_sha, devSha]).ok) return { reason: "merge-not-on-origin-dev" };
  if (arrayPages(github(`repos/${repo}/pulls`, { state: "open", base: branch })).length) return { reason: "dependent-pr" };
  const ci = ciReason(github(`repos/${repo}/actions/runs`, { head_sha: sha, event: "pull_request" }), pr, sha);
  if (ci) return { reason: ci };
  const heads = remoteHeads(cwd, [branch]);
  if (heads.get("dev") !== devSha) return { reason: "origin-dev-changed" };
  if (heads.has(branch) && heads.get(branch) !== sha) return { reason: "remote-branch-changed" };
  return { pr: pr.number };
}

function deleteLocalBranch(cwd, candidate) {
  validateBranch(candidate.branch);
  const reason = localReason(cwd, candidate.branch, candidate.sha);
  if (reason) return { status: "skipped", reason };
  const result = command(cwd, "git", ["update-ref", "--no-deref", "-d", `refs/heads/${candidate.branch}`, candidate.sha]);
  if (!result.ok) return { status: "skipped", reason: "branch-changed-or-locked" };
  const config = command(cwd, "git", ["config", "--local", "--remove-section", `branch.${candidate.branch}`]);
  return { status: "deleted", ...(!config.ok ? { note: "branch-config-absent-or-retained" } : {}) };
}

export function cleanupTaskBranches({ cwd = process.cwd(), apply = false, branches = [], github } = {}) {
  if (typeof apply !== "boolean" || !Array.isArray(branches)) throw new Error("Invalid cleanup options; branches preserved.");
  for (const branch of branches) validateBranch(branch);
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  const available = localBranches(root);
  const candidates = branches.length ? branches.map(branch => available.find(item => item.branch === branch) ?? { branch }) : available;
  const results = [];
  const pending = [];
  for (const candidate of candidates) {
    validateBranch(candidate.branch);
    const reason = candidate.sha ? localReason(root, candidate.branch, candidate.sha) : "branch-missing";
    if (reason) results.push({ branch: candidate.branch, status: "skipped", reason });
    else if (!shaPattern.test(candidate.sha)) results.push({ branch: candidate.branch, status: "skipped", reason: "invalid-commit" });
    else pending.push(candidate);
  }
  if (!pending.length) return { apply, results };
  const repo = repository(root);
  remoteHeads(root);
  git(root, ["fetch", "--no-tags", "origin", "refs/heads/dev:refs/remotes/origin/dev"]);
  const devSha = git(root, ["rev-parse", "--verify", "refs/remotes/origin/dev"]);
  const readGithub = github ?? ((endpoint, query) => githubPages(root, endpoint, query));
  for (const candidate of pending) {
    try {
      const completion = inspectCompletion(root, repo, candidate, devSha, readGithub);
      if (completion.reason) results.push({ branch: candidate.branch, status: "skipped", reason: completion.reason });
      else results.push({ branch: candidate.branch, sha: candidate.sha, pr: completion.pr,
        ...(apply ? deleteLocalBranch(root, candidate) : { status: "eligible" }) });
    } catch {
      results.push({ branch: candidate.branch, status: "skipped", reason: "inspection-failed" });
    }
  }
  return { apply, results };
}

function parseArguments(args) {
  const options = { apply: false, branches: [] };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--apply" && !options.apply) options.apply = true;
    else if (args[index] === "--branch" && args[index + 1] && !args[index + 1].startsWith("-")) options.branches.push(args[++index]);
    else throw new Error("Usage: npm run branches:cleanup -- [--apply] [--branch harness/<topic>]");
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = cleanupTaskBranches(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith("GitHub") ? "GitHub inspection failed; branches preserved."
      : error instanceof Error && !error.message.includes("\n") ? error.message : "Branch cleanup failed; branches preserved.");
    process.exitCode = 1;
  }
}
