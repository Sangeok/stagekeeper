// ApcH entities/repo-doc/model/doc-location.ts(de25a1c) 이식 — 항목 문서의 주소·라벨·순서.
// slug 라우팅(locationFromSlug·isWhitelistedDocPath)은 문서 뷰어의 것이라 Phase 1 범위 밖이다.
// 라벨은 product-copy.md §11. **이 파일이 라벨과 순서의 유일한 소유자다** — 화면이 직접 짓지 않는다.

// 저장소 문서의 실제 주소. 라우트마다 템플릿을 다시 쓰면 화면마다 다른 링크가 나온다.
export type RepoRef = { owner: string; repo: string; branch: string };

export function blobHref(repo: RepoRef, path: string): string {
  return `https://github.com/${repo.owner}/${repo.repo}/blob/${repo.branch}/${path}`;
}

// 고정 역할의 보고 라벨. 워크스페이스 dev는 roster가 프로젝트마다 달라 여기 열거하지 않고 기본 라벨을 받는다.
const REPORT_LABEL: Record<string, string> = {
  "main-loop": "Validation record",
  "doc-auditor": "Audit report",
  "feature-scout": "Scouting report",
};
const DEV_REPORT_LABEL = "Implementation report";

export function reportDocLabel(actor: string): string {
  return REPORT_LABEL[actor] ?? DEV_REPORT_LABEL;
}

/** 결정적 순서: 검증 기록 → 구현 보고(dev들, 이름순) → 감사 → 정찰. */
export function orderReportActors(actors: ReadonlySet<string>): string[] {
  const rest = [...actors]
    .filter((a) => !(a in REPORT_LABEL))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ["main-loop", ...rest, "doc-auditor", "feature-scout"].filter((a) => actors.has(a));
}
