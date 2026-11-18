import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim();
}

export function osLabel(): string {
  return `${process.platform}-${process.arch}`;
}

export function createRepository(work: string, scenario: string): string {
  const repo = path.join(work, "repo");
  mkdirSync(repo);
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "core.autocrlf", "false"]);
  git(repo, ["config", "user.email", "e2e@stagekeeper.invalid"]);
  git(repo, ["config", "user.name", "stagekeeper-e2e"]);
  git(repo, ["remote", "add", "origin", `https://github.com/stagekeeper-e2e/${scenario}-${osLabel()}.git`]);
  git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
  writeFileSync(path.join(repo, "package.json"), `${JSON.stringify({ name: `${scenario}-${osLabel()}`, private: true, scripts: { test: "node --test" } }, null, 2)}\n`);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "chore: initial commit"]);
  return repo;
}
