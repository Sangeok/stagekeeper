// 보고 = docs/agents/<행위자>/<ID>.md 의 위치 기록(스펙 Task 1.6 model Report).
export type AgentReport = { actor: string; path: string; commit: string; at: Date };

// 이식한 briefing이 읽던 문서 목록 형(ApcH entities/agent-report). 파일명으로 항목을 맞춘다.
export type ReportDoc = { name: string; label: string; size: number };

export function toReportDoc(report: { path: string }): ReportDoc {
  const name = report.path.slice(report.path.lastIndexOf("/") + 1);
  return { name, label: name.endsWith(".md") ? name.slice(0, -3) : name, size: 0 };
}
