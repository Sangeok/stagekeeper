import { parseRepoUrl, type RepoRef } from "./repo-url";

export type RepositorySelection =
  | { source: "url"; url: string }
  | { source: "picker"; repository: RepoRef | null }
  | { source: "direct"; owner: string; repo: string };

// URL 상태는 지금 보이는 주소에서만 식별자를 얻는다. 이전에 성공한 파싱 값은 제출 권한이 없다.
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
