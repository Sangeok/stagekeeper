// DB BoardItem 행 → ApcH 화면 모델이 읽던 형. 날짜 섹션은 proposedOn에서 파생한다(스펙 §3.3).
export type BoardItem = {
  checked: boolean; id: string; title: string; agent: string | null; area: string | null;
  status: string | null; reason: string | null; result: string | null; validation: string | null;
};
export type BoardSection = { heading: string; items: BoardItem[] };

type Row = { status: string; agent: string; reason: string; results: string[]; validation: string | null; proposedOn: Date;
  backlogItem: { key: string; title: string; area: string } };

export function toBoardItem(r: Row): BoardItem {
  return { checked: r.status === "완료", id: r.backlogItem.key, title: r.backlogItem.title, agent: r.agent, area: r.backlogItem.area,
    status: r.status, reason: r.reason, result: r.results.length ? r.results.join(" ") : null, validation: r.validation };
}

export function toBoardSections(rows: Row[]): BoardSection[] {
  const byDay = new Map<string, BoardItem[]>();
  for (const r of [...rows].sort((a, b) => b.proposedOn.getTime() - a.proposedOn.getTime())) {
    const day = r.proposedOn.toISOString().slice(0, 10);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(toBoardItem(r));
  }
  return [...byDay].map(([heading, items]) => ({ heading, items }));
}
