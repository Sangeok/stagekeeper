// ApcH entities/repo-doc/model/doc-location.ts(de25a1c) 이식 — briefing이 쓰는 링크 조립만.
// slug 라우팅(locationFromSlug·isWhitelistedDocPath)은 문서 뷰어의 것이라 Phase 1 범위 밖이다.
// 라벨은 product-copy.md §11.

export type DocKind = "plan" | "report";
export type DocLink = { label: string; href: string; kind: DocKind };

export function planDocHref(id: string): string {
  return `/pipeline/docs/plans/${id}`;
}
export function reportDocHref(agent: string, name: string): string {
  return `/pipeline/docs/agents/${agent}/${name}`;
}

// 고정 역할의 보고 라벨. 워크스페이스 dev는 roster가 프로젝트마다 달라 여기 열거하지 않고 기본 라벨을 받는다.
const REPORT_LABEL: Record<string, string> = {
  "main-loop": "Validation record",
  "doc-auditor": "Audit report",
  "feature-scout": "Scouting report",
};
const DEV_REPORT_LABEL = "Implementation report";

// 결정적 순서: 검증 기록 → 구현 보고(dev들, 이름순) → 감사 → 정찰.
function reportOrder(agents: ReadonlySet<string>): string[] {
  const rest = [...agents]
    .filter((a) => !(a in REPORT_LABEL))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ["main-loop", ...rest, "doc-auditor", "feature-scout"].filter((a) => agents.has(a));
}

/** 항목 ID의 형제 문서 링크. AgentReport 타입에 의존하지 않도록 원시값만 받는다
 *  — entities peer import 금지를 피하기 위함. */
export function docLinksForItem(
  id: string,
  hasPlan: boolean,
  agentsWithDoc: ReadonlySet<string>,
): DocLink[] {
  const links: DocLink[] = [];
  if (hasPlan) links.push({ label: "Plan", href: planDocHref(id), kind: "plan" });
  for (const agent of reportOrder(agentsWithDoc)) {
    links.push({ label: REPORT_LABEL[agent] ?? DEV_REPORT_LABEL, href: reportDocHref(agent, id), kind: "report" });
  }
  return links;
}
