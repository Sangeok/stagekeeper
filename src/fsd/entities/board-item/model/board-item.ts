// DB BoardItem 행 → ApcH 화면 모델이 읽던 형. 날짜 섹션은 proposedOn에서 파생한다(스펙 §3.3).
import { isOverBudget } from "./text-budget";

export type BoardItem = {
  checked: boolean; id: string; title: string; agent: string | null; area: string | null;
  status: string | null; reason: string | null; result: string | null; validation: string | null;
  // 초과 여부는 results를 이어붙이기 전에 정한다 — 건별로 재는 서버 규칙과 같은 단위로.
  overBudget: boolean;
};
export type BoardSection = { heading: string; items: BoardItem[] };

type Row = { status: string; agent: string; reason: string; results: string[]; validation: string | null; proposedOn: Date;
  backlogItem: { key: string; title: string; area: string } };

export function toBoardItem(r: Row): BoardItem {
  return { checked: r.status === "done", id: r.backlogItem.key, title: r.backlogItem.title, agent: r.agent, area: r.backlogItem.area,
    status: r.status, reason: r.reason, result: r.results.length > 0 ? r.results.join(" ") : null, validation: r.validation,
    overBudget: isOverBudget([r.reason, ...r.results]) };
}

export function toBoardSections(rows: Row[]): BoardSection[] {
  const byDay = new Map<string, BoardItem[]>();
  for (const r of [...rows].sort((a, b) => b.proposedOn.getTime() - a.proposedOn.getTime())) {
    const day = r.proposedOn.toISOString().slice(0, 10);
    const item = toBoardItem(r);
    const dayItems = byDay.get(day);
    if (dayItems === undefined) byDay.set(day, [item]);
    else dayItems.push(item);
  }
  return [...byDay].map(([heading, items]) => ({ heading, items }));
}
