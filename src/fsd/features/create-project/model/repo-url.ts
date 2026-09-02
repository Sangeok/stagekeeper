// 순수. 사용자가 붙여넣은 저장소 주소에서 owner·repo만 뽑는다.
// 서비스는 GitHub에 접속하지 않으므로(스펙 §3.1) 검증이 아니라 형식 해석만 한다 — 실재 여부는 확인하지 않는다.
import { SLUG_MAX } from "./project-slug";

export type RepoRef = { owner: string; repo: string };

// 고르기 목록의 한 줄. 서버가 채워 넘긴다 - Client Component는 @/server를 import할 수 없다(fsd.md).
export type RepoOption = { name: string; defaultBranch: string };

// GitHub 계정·저장소 이름에 허용되는 모양. 점으로 끝나는 이름은 받지 않는다.
// 서버 액션도 이걸 쓴다 — 붙여넣기 경로만 걸러내면 수동 입력으로 아무 문자열이나 들어와
// 저장된 뒤 blobHref가 영영 깨진 링크를 만든다(slug와 같은 규칙: 규칙은 한 벌이다).
export const SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;

// 각 패턴은 1번이 owner, 2번이 repo다. tsconfig target이 ES2017이라 named group은 쓰지 않는다.
const PATTERNS = [
  // git@github.com:owner/repo.git
  /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  // https://github.com/owner/repo[/tree/main…]
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/i,
  // owner/repo — 호스트 없는 짧은 형태. owner에 점을 허용하지 않아 다른 호스트와 갈린다.
  /^([^/\s.]+)\/([^/\s]+?)(?:\.git)?\/?$/,
];

export function parseRepoUrl(input: string): RepoRef | null {
  const text = input.trim().replace(/[?#].*$/, "");
  if (text === "") return null;
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    const owner = match?.[1];
    const repo = match?.[2];
    if (owner && repo && SEGMENT.test(owner) && SEGMENT.test(repo)) return { owner, repo };
  }
  return null;
}

// repo 이름에서 slug 후보를 만든다. 상한은 규칙과 같은 곳에서 온다(model/project-slug.ts).
export function slugFromRepo(repo: string): string {
  return repo
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}
