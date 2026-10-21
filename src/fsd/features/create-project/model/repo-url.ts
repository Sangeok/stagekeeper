import { SLUG_MAX } from "./project-slug";
import { parseRepoUrl as parseCoreRepoUrl } from "@harness/core/repo-url.mjs";

export { SEGMENT } from "@harness/core/repo-url.mjs";

export type RepoRef = { owner: string; repo: string };

export type RepoOption = { name: string; defaultBranch: string };

export function parseRepoUrl(input: string): RepoRef | null {
  return parseCoreRepoUrl(input);
}

export function slugFromRepo(repo: string): string {
  return repo
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}
