// ApcH entities/repo-doc/model/doc-location.ts(de25a1c) 이식 — 항목 문서의 주소·라벨·순서.
// slug 라우팅(locationFromSlug·isWhitelistedDocPath)은 문서 뷰어의 것이라 Phase 1 범위 밖이다.
// 라벨은 product-copy.md §11. **이 파일이 라벨과 순서의 유일한 소유자다** — 화면이 직접 짓지 않는다.

// 저장소 문서의 실제 주소. 라우트마다 템플릿을 다시 쓰면 화면마다 다른 링크가 나온다.
export type RepoRef = { owner: string; repo: string; branch: string };

// ref가 있으면 그 커밋을 연다 — 게이트②가 승인하는 것은 planCommit이고, 보고도 자기 커밋이 있다.
// 없을 때만 브랜치 HEAD(계획서가 아직 제출 전인 경우)다.
export function blobHref(repo: RepoRef, path: string, ref: string | null = null): string {
  return `https://github.com/${repo.owner}/${repo.repo}/blob/${ref ?? repo.branch}/${path}`;
}

// blobHref가 만드는 주소는 **기록된 커밋**을 가리킨다. 그 커밋이 원격에 없으면 조용히 404다 —
// 푸시는 규칙상 소유자만 하는데(런북 "A pipeline step never grants commit or push permission")
// 화면이 그 조건을 말하지 않아, 네 사이클의 게이트 2가 죽은 링크였다(실측). 링크를 내미는 자리는
// 이 문장을 함께 낸다. product-copy.md §7 · §11에 같은 문장.
export const DOC_LINK_NOTE = "Opens the recorded commit on GitHub. If it 404s, that commit is not pushed yet.";

// 고정 역할의 보고 라벨. 워크스페이스 dev는 roster가 프로젝트마다 달라 여기 열거하지 않고 기본 라벨을 받는다.
const REPORT_LABEL: Record<string, string> = {
  "main-loop": "Validation record",
  "doc-auditor": "Audit report",
  "feature-scout": "Scouting report",
};
const DEV_REPORT_LABEL = "Implementation report";
// main-loop의 보고는 둘이다 — in_review의 검증 라운드 기록과 done의 인수 기록. 어느 쪽인지는 호출자가
// acceptedAt으로 가른다(item-docs.ts): 이 파일은 라벨만 소유하고 판정 재료(시각)는 갖지 않는다.
const ACCEPTANCE_LABEL = "Acceptance record";

export function reportDocLabel(actor: string, isAcceptance = false): string {
  if (actor === "main-loop" && isAcceptance) return ACCEPTANCE_LABEL;
  return REPORT_LABEL[actor] ?? DEV_REPORT_LABEL;
}

/** 결정적 순서: 검증 기록 → 구현 보고(dev들, 이름순) → 감사 → 정찰. */
export function orderReportActors(actors: ReadonlySet<string>): string[] {
  const rest = [...actors]
    .filter((a) => !(a in REPORT_LABEL))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ["main-loop", ...rest, "doc-auditor", "feature-scout"].filter((a) => actors.has(a));
}
