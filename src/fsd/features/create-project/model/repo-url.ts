// 순수. 사용자가 붙여넣은 저장소 주소에서 owner·repo만 뽑는다.
// 서비스는 GitHub에 접속하지 않으므로(스펙 §3.1) 검증이 아니라 형식 해석만 한다 — 실재 여부는 확인하지 않는다.
import { SLUG_MAX } from "./project-slug";
import { parseRepoUrl as parseCoreRepoUrl } from "@harness/core/repo-url.mjs";

export { SEGMENT } from "@harness/core/repo-url.mjs";

export type RepoRef = { owner: string; repo: string };

// 고르기 목록의 한 줄. 서버가 채워 넘긴다 - Client Component는 @/server를 import할 수 없다(fsd.md).
export type RepoOption = { name: string; defaultBranch: string };

export function parseRepoUrl(input: string): RepoRef | null {
  return parseCoreRepoUrl(input);
}

// repo 이름에서 slug 후보를 만든다. 상한은 규칙과 같은 곳에서 온다(model/project-slug.ts).
export function slugFromRepo(repo: string): string {
  return repo
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}
