import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REQUIRED = Object.freeze(["check.yml", "windows-role-runtime.yml", "macos-runtime-contracts.yml"]);
export const USAGE = "Usage: node scripts/checks/find-green-dev-commit.mjs [--limit <commits>] [--json]";
const repository = fileURLToPath(new URL("../../", import.meta.url));

export function classify(runs, required = REQUIRED) {
  const latest = new Map();
  for (const run of runs) {
    const file = run.path?.split("/").at(-1);
    if (!required.includes(file)) continue;
    const seen = latest.get(file);
    if (!seen || run.run_number > seen.run_number || (run.run_number === seen.run_number && run.run_attempt > seen.run_attempt)) latest.set(file, run);
  }
  const missing = required.filter(file => !latest.has(file));
  if (missing.length) return { state: "missing", detail: missing.join(", ") };
  const pending = required.filter(file => latest.get(file).status !== "completed");
  if (pending.length) return { state: "pending", detail: pending.join(", ") };
  const failedFiles = required.filter(file => latest.get(file).conclusion !== "success");
  return failedFiles.length ? { state: "failed", detail: failedFiles.map(file => `${file} ${latest.get(file).conclusion}`).join(", ") } : { state: "green", detail: "" };
}

export async function find(commits, runsOf) {
  const skipped = [];
  for (const commit of commits) {
    const verdict = classify(await runsOf(commit.sha));
    if (verdict.state === "green") return { green: commit, skipped };
    skipped.push({ ...commit, ...verdict });
  }
  return { green: null, skipped };
}

export function parse(argv) {
  const options = { limit: 30, json: false };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--json") options.json = true;
    else if (argv[index] === "--limit" && /^[1-9]\d{0,2}$/.test(argv[index + 1] ?? "")) options.limit = Number(argv[++index]);
    else throw new Error(USAGE);
  }
  return options;
}

export function render({ green, skipped }, limit) {
  const lines = [green ? green.sha : `No commit with every post-merge workflow green in the last ${limit} first-parent commits of origin/dev`];
  if (green) lines.push(`  ${green.subject}`);
  if (skipped.length) lines.push(green ? "Newer commits left out:" : "Commits checked:", ...skipped.map(commit => `  ${commit.sha.slice(0, 7)} ${commit.state}${commit.detail ? ` (${commit.detail})` : ""}  ${commit.subject}`));
  return lines.join("\n");
}

const git = args => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();

export function originRepository(url) {
  const match = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error("origin is not a GitHub repository");
  return `${match[1]}/${match[2]}`;
}

async function main(argv, env) {
  const options = parse(argv);
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN ?? execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  const name = originRepository(git(["remote", "get-url", "origin"]));
  const commits = git(["log", "--first-parent", `-n${options.limit}`, "--format=%H%x09%s", "origin/dev"]).split("\n").filter(Boolean)
    .map(line => ({ sha: line.slice(0, 40), subject: line.slice(41) }));
  const runsOf = async sha => {
    const response = await fetch(`https://api.github.com/repos/${name}/actions/runs?head_sha=${sha}&event=push&branch=dev&per_page=100`,
      { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "find-green-dev-commit" } });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for the runs of ${sha.slice(0, 7)}`);
    return (await response.json()).workflow_runs;
  };
  const result = await find(commits, runsOf);
  console.log(options.json ? JSON.stringify(result) : render(result, options.limit));
  return result.green ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).then(code => { process.exitCode = code; }, error => {
    console.error(error instanceof Error ? error.message : "find-green-dev-commit failed");
    process.exitCode = 2;
  });
}
