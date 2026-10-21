import { parseRepoUrl, type RepoRef } from "./repo-url";

export type RepositorySelection =
  | { source: "url"; url: string }
  | { source: "picker"; repository: RepoRef | null }
  | { source: "direct"; owner: string; repo: string };

export function selectedRepository(selection: RepositorySelection): RepoRef | null {
  switch (selection.source) {
    case "url": return parseRepoUrl(selection.url);
    case "picker": return selection.repository;
    case "direct": return selection.owner.trim() && selection.repo.trim()
      ? { owner: selection.owner, repo: selection.repo } : null;
    default: {
      const unreachable: never = selection;
      return unreachable;
    }
  }
}
