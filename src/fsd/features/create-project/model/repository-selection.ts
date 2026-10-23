import { parseRepoUrl, type RepoRef } from "./repo-url";
import type { AuthorizedRepository } from "./github-connection-state";

export type RepositorySelection =
  | { source: "url"; url: string }
  | { source: "picker"; repository: (RepoRef & { repositoryId: string }) | null }
  | { source: "authorized"; repository: AuthorizedRepository }
  | { source: "direct"; owner: string; repo: string };

export function selectedRepository(selection: RepositorySelection): RepoRef | null {
  switch (selection.source) {
    case "url": return parseRepoUrl(selection.url);
    case "picker": return selection.repository ? { owner: selection.repository.owner, repo: selection.repository.repo } : null;
    case "authorized": return { owner: selection.repository.owner, repo: selection.repository.name };
    case "direct": return selection.owner.trim() && selection.repo.trim()
      ? { owner: selection.owner, repo: selection.repo } : null;
    default: {
      const unreachable: never = selection;
      return unreachable;
    }
  }
}
