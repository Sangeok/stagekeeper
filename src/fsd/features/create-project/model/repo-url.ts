import { SLUG_MAX } from "./project-slug";
import { parseRepoUrl as parseGitHubRepoUrl } from "@harness/github/repo-url.mjs";
import type { PublicRepository, AuthorizedRepository } from "./github-connection-state";

export { SEGMENT } from "@harness/github/repo-url.mjs";

export type RepoRef = { owner: string; repo: string };

export type RepoOption = PublicRepository | AuthorizedRepository;

export function parseRepoUrl(input: string): RepoRef | null {
  return parseGitHubRepoUrl(input);
}

export function slugFromRepo(repo: string): string {
  return repo
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}
