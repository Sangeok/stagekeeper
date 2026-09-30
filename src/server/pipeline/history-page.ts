import type { Prisma } from "@/generated/prisma/client";

export type HistoryView = "key" | "all";
export type HistoryCursor = { at: Date; source: "report" | "event"; id: string };
type HistoryIdentity = { id: string; at: Date; boardItemId: string; key: string };
export type HistoryEventRecord = HistoryIdentity & {
  source: "event"; actor: string; channel: string | null;
  from: string | null; to: string | null; note: string | null;
};
export type HistoryReportRecord = HistoryIdentity & {
  source: "report"; actor: string; path: string; commit: string;
  isAcceptance: boolean | null; acceptedAt: Date | null;
};
export type HistoryRecord = HistoryEventRecord | HistoryReportRecord;

export function eventWhere(view: HistoryView): Prisma.TransitionEventWhereInput {
  // SQL의 <>는 NULL에 일치하지 않으므로 일반 전이를 별도 분기로 보존한다.
  const withoutReport = { OR: [{ note: null }, { note: { not: "report" } }] };
  if (view === "all") return withoutReport;
  return { AND: [withoutReport, { OR: [
    { actor: "human" }, { note: "validation" }, { to: { in: ["done", "on_hold"] } },
  ] }] };
}

type CursorFilter = { OR?: Array<{ at: { lt: Date } } | { at: Date; id?: { lt: string } }> };

export function afterCursor(source: "report" | "event", cursor: HistoryCursor | null): CursorFilter {
  if (cursor === null) return {};
  const older: NonNullable<CursorFilter["OR"]> = [{ at: { lt: cursor.at } }];
  if (source === cursor.source) older.push({ at: cursor.at, id: { lt: cursor.id } });
  else if (source === "event") older.push({ at: cursor.at });
  return { OR: older };
}

export function mergeHistoryPage(
  events: readonly HistoryEventRecord[], reports: readonly HistoryReportRecord[], limit: number,
): { rows: HistoryRecord[]; next: HistoryCursor | null } {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("History limit must be a positive safe integer.");
  const rows: HistoryRecord[] = [];
  let eventIndex = 0;
  let reportIndex = 0;
  // 원천 안의 DB 정렬을 보존한다. 같은 시각에는 보고서가 전이보다 먼저 온다.
  while (rows.length < limit && (eventIndex < events.length || reportIndex < reports.length)) {
    const event = events[eventIndex];
    const report = reports[reportIndex];
    if (report && (!event || report.at.getTime() >= event.at.getTime())) {
      rows.push(report);
      reportIndex++;
    } else {
      rows.push(event);
      eventIndex++;
    }
  }
  const last = rows.at(-1);
  const hasMore = eventIndex < events.length || reportIndex < reports.length;
  return { rows, next: hasMore && last ? { at: last.at, source: last.source, id: last.id } : null };
}

export function parseHistoryCursor(raw: string | undefined): HistoryCursor | null {
  if (raw === undefined) return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\.(r|e)\.([a-z0-9]+)$/.exec(raw);
  if (!match) return null;
  const at = new Date(match[1]);
  if (!Number.isFinite(at.getTime()) || at.toISOString() !== match[1]) return null;
  return { at, source: match[2] === "r" ? "report" : "event", id: match[3] };
}

export function formatHistoryCursor(cursor: HistoryCursor): string {
  return `${cursor.at.toISOString()}.${cursor.source === "report" ? "r" : "e"}.${cursor.id}`;
}
