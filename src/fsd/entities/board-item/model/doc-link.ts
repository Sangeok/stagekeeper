// ApcH entities/repo-doc/model/doc-location.ts(de25a1c) 이식 — briefing이 쓰는 링크 조립만.
// slug 라우팅(locationFromSlug·isWhitelistedDocPath)은 문서 뷰어의 것이라 Phase 1 범위 밖이다.

export type DocKind = "plan" | "report";
export type DocLink = { label: string; href: string; kind: DocKind };

export function planDocHref(id: string): string {
  return `/pipeline/docs/plans/${id}`;
}
export function reportDocHref(agent: string, name: string): string {
  return `/pipeline/docs/agents/${agent}/${name}`;
}
const REPORT_LABEL: Record<string, string> = {
  "main-loop": "검증 기록",
  "admin-dev": "구현 보고",
  "web-dev": "구현 보고",
  "backend-dev": "구현 보고",
  "doc-auditor": "감사 보고",
  "feature-scout": "정찰 보고",
};
// docs/agents/README.md의 보고 행위자 닫힌 목록(pm은 폴더 없음).
// 결정적 순서: 계획→검증→구현→감사→정찰.
const DOC_LINK_AGENTS: readonly string[] = [
  "main-loop", "admin-dev", "web-dev", "backend-dev", "doc-auditor", "feature-scout",
];

/** 항목 ID의 형제 문서 링크. AgentReport 타입에 의존하지 않도록 원시값만 받는다
 *  — entities peer import(agent-report) 금지를 피하기 위함. */
export function docLinksForItem(
  id: string,
  hasPlan: boolean,
  agentsWithDoc: ReadonlySet<string>,
): DocLink[] {
  const links: DocLink[] = [];
  if (hasPlan) links.push({ label: "계획서", href: planDocHref(id), kind: "plan" });
  for (const agent of DOC_LINK_AGENTS) {
    if (agentsWithDoc.has(agent)) {
      links.push({ label: REPORT_LABEL[agent] ?? "기록", href: reportDocHref(agent, id), kind: "report" });
    }
  }
  return links;
}
