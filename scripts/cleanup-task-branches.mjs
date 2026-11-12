import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const protectedBranches = new Set(["main", "dev"]);
const shaPattern = /^[a-f0-9]{40}$/;
const reasonOrder = [
  "working-tree-dirty", "worktree-in-use", "branch-missing", "symbolic-ref", "invalid-commit", "branch-changed",
  "open-pr", "merged-pr-unverified", "merge-not-on-origin-dev", "ci-unverified", "check-workflow-missing",
  "ci-not-successful", "dependent-pr", "origin-dev-changed", "remote-branch-changed", "inspection-failed",
  "branch-changed-or-locked",
];

class CleanupAborted extends Error {
  constructor(reason = "inspection-failed") {
    super("Shared Git state could not be verified; remaining branches preserved.");
    this.reason = reason;
  }
}

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
  return {
    ok: !result.error && result.status === 0, output: result.stdout ?? "",
    status: result.status, failed: Boolean(result.error || result.signal),
  };
}

function git(cwd, args) {
  const result = command(cwd, "git", args);
  if (!result.ok) throw new Error("Git inspection failed; no branch deletion is authorized.");
  return result.output.replace(/\r?\n$/, "");
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

function sameRepository(left, right) {
  return typeof left === "string" && typeof right === "string" && left.length > 0
    && left.toLowerCase() === right.toLowerCase();
}

function localBranches(cwd) {
  return git(cwd, ["for-each-ref", "--format=%(refname)%09%(objectname)%09%(symref)", "refs/heads/harness/"])
    .split("\n").filter(Boolean).map(line => {
      const [ref, sha, symbolic] = line.split("\t");
      return { branch: ref.slice("refs/heads/".length), sha, symbolic: Boolean(symbolic) };
    });
}

function worktrees(cwd) {
  try {
    const output = git(cwd, ["worktree", "list", "--porcelain", "-z"]);
    if (!output.endsWith("\0\0")) throw new Error();
    return output.slice(0, -2).split("\0\0").map(record => {
      const fields = new Map();
      for (const field of record.split("\0")) {
        const separator = field.indexOf(" ");
        const key = separator < 0 ? field : field.slice(0, separator);
        const value = separator < 0 ? "" : field.slice(separator + 1);
        if (fields.has(key) || !["worktree", "HEAD", "branch", "detached", "bare", "locked", "prunable"].includes(key)) throw new Error();
        fields.set(key, value);
      }
      const path = fields.get("worktree"), head = fields.get("HEAD"), branch = fields.get("branch");
      if (!path || ["branch", "detached", "bare"].filter(key => fields.has(key)).length !== 1
        || !fields.has("bare") && !head || head !== undefined && !shaPattern.test(head)
        || ["detached", "bare"].some(key => fields.has(key) && fields.get(key) !== "")
        || fields.has("branch") && (!branch.startsWith("refs/heads/") || branch === "refs/heads/")) throw new Error();
      return {
        path, head: head && head !== "0".repeat(40) ? head : null, branch,
        locked: fields.has("locked"), prunable: fields.has("prunable"),
      };
    });
  } catch {
    throw new CleanupAborted();
  }
}

function worktreeChanges(path) {
  try {
    const top = git(path, ["rev-parse", "--show-toplevel"]);
    if (realpathSync(top) !== realpathSync(path)) return "unknown";
    return git(path, ["status", "--porcelain=v1", "--untracked-files=all"]) ? "dirty" : "clean";
  } catch {
    return "unknown";
  }
}

function inspectLocal(cwd, candidate, entries = worktrees(cwd)) {
  const reasons = [];
  const connected = entries.filter(entry => entry.branch === `refs/heads/${candidate.branch}`)
    .map(({ path, head, locked, prunable }) => ({ path, head, locked, prunable, changes: worktreeChanges(path) }));
  if (git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"])) reasons.push("working-tree-dirty");
  if (connected.length) reasons.push("worktree-in-use");
  const current = localBranches(cwd).find(item => item.branch === candidate.branch);
  if (!current) reasons.push("branch-missing");
  else {
    if (current.symbolic) reasons.push("symbolic-ref");
    if (!shaPattern.test(current.sha)) reasons.push("invalid-commit");
    if (current.sha !== candidate.sha) reasons.push("branch-changed");
  }
  return { reasons, worktrees: connected };
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

function verifyRemoteSnapshot(cwd, { branch, sha }, devSha) {
  let heads;
  try {
    heads = remoteHeads(cwd, [branch]);
  } catch {
    throw new CleanupAborted();
  }
  if (heads.get("dev") !== devSha) throw new CleanupAborted("origin-dev-changed");
  return heads.has(branch) && heads.get(branch) !== sha ? "remote-branch-changed" : null;
}

function isAncestor(cwd, sha, devSha) {
  const result = command(cwd, "git", ["merge-base", "--is-ancestor", sha, devSha]);
  if (result.failed || ![0, 1].includes(result.status)) throw new Error("Git ancestry inspection failed.");
  return result.status === 0;
}

function headPulls(pages) {
  const pulls = arrayPages(pages);
  if (pulls.some(pr => !Number.isSafeInteger(pr?.number) || pr.number <= 0
    || !["open", "closed"].includes(pr.state) || typeof pr.head?.ref !== "string" || !pr.head.ref
    || typeof pr.head?.repo?.full_name !== "string" || !pr.head.repo.full_name)) throw new Error("Invalid pull request evidence.");
  return pulls;
}

function hasDependentPulls(pages, repo, branch) {
  const pulls = arrayPages(pages);
  if (pulls.some(pr => !Number.isSafeInteger(pr?.number) || pr.number <= 0 || pr.state !== "open"
    || pr.base?.ref !== branch || !sameRepository(pr.base?.repo?.full_name, repo))) throw new Error("Invalid dependent pull request evidence.");
  return pulls.length > 0;
}

function ciReason(pages, pr, sha) {
  if (!Array.isArray(pages) || pages.length === 0 || !pages.every(page => Array.isArray(page?.workflow_runs))) return "ci-unverified";
  const latest = new Map();
  for (const run of pages.flatMap(page => page.workflow_runs)) {
    if (run.head_sha !== sha || run.event !== "pull_request") continue;
    if (typeof run.head_branch !== "string" || typeof run.head_repository?.full_name !== "string"
      || typeof run.repository?.full_name !== "string" || !Array.isArray(run.pull_requests)) return "ci-unverified";
    if (run.head_branch !== pr.head.ref || !sameRepository(run.head_repository.full_name, pr.head.repo.full_name)
      || !sameRepository(run.repository.full_name, pr.base.repo.full_name)) continue;
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
  const pulls = headPulls(github(`repos/${repo}/pulls`, { state: "all", head: `${repo.split("/")[0]}:${branch}` }));
  const matching = pulls.filter(pr => pr.head.ref === branch && sameRepository(pr.head.repo.full_name, repo));
  if (matching.some(pr => pr.state === "open")) return { reason: "open-pr" };
  const dependent = hasDependentPulls(github(`repos/${repo}/pulls`, { state: "open", base: branch }), repo, branch);
  if (candidate.preservation === "ancestor") return dependent ? { reason: "dependent-pr" } : {};
  const dependentReasons = dependent ? ["dependent-pr"] : [];
  const merged = matching.filter(pr => pr.state === "closed" && pr.merged_at && pr.base?.ref === "dev"
    && sameRepository(pr.base?.repo?.full_name, repo) && pr.head?.sha === sha);
  if (merged.length !== 1) return { reasons: ["merged-pr-unverified", ...dependentReasons] };
  const pr = merged[0];
  if (!Number.isSafeInteger(pr.number) || pr.number <= 0 || !shaPattern.test(pr.merge_commit_sha)) return { reasons: ["merged-pr-unverified", ...dependentReasons] };
  if (!isAncestor(cwd, pr.merge_commit_sha, devSha)) return { reasons: ["merge-not-on-origin-dev", ...dependentReasons] };
  if (dependent) return { reason: "dependent-pr" };
  const ci = ciReason(github(`repos/${repo}/actions/runs`, { head_sha: sha, event: "pull_request" }), pr, sha);
  if (ci) return { reason: ci };
  return { pr: pr.number, preservation: "merged-pr" };
}

function deleteLocalBranch(cwd, candidate) {
  validateBranch(candidate.branch);
  const local = inspectLocal(cwd, candidate);
  candidate.worktrees = local.worktrees;
  if (local.reasons.length) return local.reasons;
  const result = command(cwd, "git", ["update-ref", "--no-deref", "-d", `refs/heads/${candidate.branch}`, candidate.sha]);
  if (!result.ok) return ["branch-changed-or-locked"];
  candidate.status = "deleted";
  const config = command(cwd, "git", ["config", "--local", "--remove-section", `branch.${candidate.branch}`]);
  if (!config.ok) candidate.note = "branch-config-absent-or-retained";
  return [];
}

function skip(candidate, reasons, invalidate = false) {
  candidate.status = "skipped";
  candidate.reasons = [...new Set([...candidate.reasons, ...reasons])]
    .sort((a, b) => reasonOrder.indexOf(a) - reasonOrder.indexOf(b));
  candidate.reason = candidate.reasons[0];
  if (invalidate || candidate.reasons.some(reason => ["branch-missing", "symbolic-ref", "invalid-commit", "branch-changed", "branch-changed-or-locked"].includes(reason))) {
    candidate.preservation = "unverified";
    delete candidate.pr;
  }
}

function report(apply, results, aborted = false) {
  const summary = { total: results.length, ancestor: 0, mergedPr: 0, unverified: 0, worktreeInUse: 0, eligible: 0, deleted: 0, skipped: 0 };
  for (const candidate of results) {
    summary[candidate.preservation === "merged-pr" ? "mergedPr" : candidate.preservation]++;
    summary[candidate.status]++;
    if (candidate.reasons.includes("worktree-in-use")) summary.worktreeInUse++;
  }
  return { apply, results, summary, aborted };
}

export function cleanupTaskBranches({ cwd = process.cwd(), apply = false, branches = [], github } = {}) {
  if (typeof apply !== "boolean" || !Array.isArray(branches)) throw new Error("Invalid cleanup options; branches preserved.");
  for (const branch of branches) validateBranch(branch);
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  const available = localBranches(root);
  const candidates = branches.length ? [...new Set(branches)].map(branch => available.find(item => item.branch === branch) ?? { branch }) : available;
  for (const candidate of candidates) validateBranch(candidate.branch);
  if (!candidates.length) return report(apply, []);
  const entries = worktrees(root);
  const results = candidates.map(({ branch, sha }) => ({
    branch, ...(sha ? { sha } : {}), status: "skipped", preservation: "unverified", worktrees: [], reasons: [],
  }));
  for (const candidate of results) {
    const local = inspectLocal(root, candidate, entries);
    candidate.worktrees = local.worktrees;
    if (local.reasons.length) skip(candidate, local.reasons);
  }
  const valid = results.filter(candidate => shaPattern.test(candidate.sha ?? "")
    && !candidate.reasons.some(reason => ["branch-missing", "symbolic-ref", "invalid-commit", "branch-changed"].includes(reason)));
  if (!valid.length) return report(apply, results);
  const repo = repository(root);
  remoteHeads(root);
  git(root, ["fetch", "--no-tags", "origin", "refs/heads/dev:refs/remotes/origin/dev"]);
  const devSha = git(root, ["rev-parse", "--verify", "refs/remotes/origin/dev"]);
  const readGithub = github ?? ((endpoint, query) => githubPages(root, endpoint, query));
  for (const candidate of valid) candidate.devSha = devSha;
  for (const candidate of valid) {
    try {
      const local = inspectLocal(root, candidate);
      candidate.worktrees = local.worktrees;
      if (local.reasons.length) skip(candidate, local.reasons);
      if (candidate.reasons.some(reason => ["branch-missing", "symbolic-ref", "invalid-commit", "branch-changed"].includes(reason))) continue;
      if (isAncestor(root, candidate.sha, devSha)) candidate.preservation = "ancestor";
      if (candidate.reasons.length) continue;
      const completion = inspectCompletion(root, repo, candidate, devSha, readGithub);
      if (completion.reason || completion.reasons) { skip(candidate, completion.reasons ?? [completion.reason]); continue; }
      Object.assign(candidate, completion);
      const remoteReason = verifyRemoteSnapshot(root, candidate, devSha);
      if (remoteReason) { skip(candidate, [remoteReason]); continue; }
      if (apply) {
        const reasons = deleteLocalBranch(root, candidate);
        if (reasons.length) skip(candidate, reasons);
      } else {
        const finalLocal = inspectLocal(root, candidate);
        candidate.worktrees = finalLocal.worktrees;
        if (finalLocal.reasons.length) skip(candidate, finalLocal.reasons);
        else candidate.status = "eligible";
      }
    } catch (error) {
      if (error instanceof CleanupAborted) {
        for (const remaining of results) if (remaining.status !== "deleted") skip(remaining, [error.reason], true);
        return report(apply, results, true);
      }
      skip(candidate, ["inspection-failed"]);
    }
  }
  return report(apply, results);
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
    if (result.aborted) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith("GitHub") ? "GitHub inspection failed; branches preserved."
      : error instanceof Error && !error.message.includes("\n") ? error.message : "Branch cleanup failed; branches preserved.");
    process.exitCode = 1;
  }
}
