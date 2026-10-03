import { blobHref, reportDocLabel, reportIsAcceptance, type RepoRef } from "@/fsd/entities/board-item";
import { gateLabel } from "@/fsd/entities/pipeline";
import { utcMinute } from "@/fsd/shared/lib/relative-time";
import { itemPath } from "@/fsd/shared/routes/project";

type HistoryInput = { id: string; at: Date; boardItemId?: string; key?: string };
export type HistoryEventInput = HistoryInput & {
  actor: string; channel: string | null; from: string | null; to: string | null; note: string | null;
};
export type HistoryReportInput = HistoryInput & {
  actor: string; path: string; commit: string; isAcceptance?: boolean | null; acceptedAt: Date | null;
};
type HistoryRowBase = { id: string; at: Date; time: string; actor: string; key?: string; keyHref: string | null };
export type HistoryRowView = HistoryRowBase & (
  | { source: "event"; text: string; note: string | null }
  | { source: "report"; text: string; commit: string; href: string }
);
type HistoryOptions = {
  repo: RepoRef; order: "asc" | "desc";
  keyLinks?: { slug: string; currentRounds: ReadonlyMap<string, string> };
};

export const HISTORY_TRUNCATED_NOTE = "History older than 30 days opens on Pro.";

function eventContent(event: HistoryEventInput): { text: string; note: string | null } {
  if (event.from === event.to) {
    if (event.note === "acceptance-failed") return { text: "Acceptance failed", note: null };
    if (event.note === "acceptance-retry") return { text: "Acceptance run again", note: null };
    if (event.note === "plan") return { text: "Plan submitted", note: null };
    if (event.note === "validation") return { text: "Validation recorded", note: null };
    if (event.note?.startsWith("gate:")) return { text: `gate · ${gateLabel(event.note.slice(5))}`, note: null };
  }
  return {
    text: `${event.from ?? "—"} → ${event.to ?? "discarded"}`,
    note: event.note?.startsWith("gate:") ? `gate · ${gateLabel(event.note.slice(5))}` : event.note,
  };
}

function identity(row: HistoryInput, source: HistoryRowView["source"], keyLinks: HistoryOptions["keyLinks"]): Omit<HistoryRowBase, "actor"> {
  const key = keyLinks ? row.key : undefined;
  return {
    id: `${source}:${row.id}`, at: row.at, time: utcMinute(row.at), key,
    keyHref: keyLinks && key !== undefined && row.boardItemId !== undefined && keyLinks.currentRounds.get(key) === row.boardItemId
      ? itemPath(keyLinks.slug, key) : null,
  };
}

export function toHistoryRows(
  events: readonly HistoryEventInput[], reports: readonly HistoryReportInput[], options: HistoryOptions,
): HistoryRowView[] {
  const rows: HistoryRowView[] = [
    ...events.filter(event => event.note !== "report").map((event): HistoryRowView => ({
      ...identity(event, "event", options.keyLinks), source: "event",
      actor: event.actor === "pipeline" ? "pipeline · auto" : event.channel === "session" ? `${event.actor} · session` : event.actor,
      ...eventContent(event),
    })),
    ...reports.map((report): HistoryRowView => ({
      ...identity(report, "report", options.keyLinks), source: "report", actor: report.actor,
      text: reportDocLabel(report.actor, reportIsAcceptance(report, report.acceptedAt)),
      commit: report.commit.slice(0, 7), href: blobHref(options.repo, report.path, report.commit),
    })),
  ];
  return rows.sort((a, b) => {
    const time = b.at.getTime() - a.at.getTime();
    const source = Number(b.source === "report") - Number(a.source === "report");
    const id = a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    const descending = time || source || id;
    return options.order === "desc" ? descending : -descending;
  });
}
