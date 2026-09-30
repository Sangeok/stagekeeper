import type { RepoRef } from "@/fsd/entities/board-item";
import type { HistoryEventInput, HistoryReportInput } from "@/fsd/widgets/history-feed";

export type ItemHistorySummary = {
  id: string; key: string; title: string; status: string; discardedAt: Date | null; at: Date;
};
export type ExpandedItemHistory = {
  key: string; events: readonly HistoryEventInput[]; reports: readonly HistoryReportInput[];
  currentRounds: ReadonlyMap<string, string>; nextCursor: string | null; hasBefore: boolean;
};
type HistoryBase = { slug: string; repo: RepoRef; historyTruncated: boolean; nextCursor: string | null; hasBefore: boolean };
export type ProjectHistoryProps = HistoryBase & (
  | { mode: "items"; items: readonly ItemHistorySummary[]; before: string | null; expanded: ExpandedItemHistory | null }
  | { mode: "events"; view: "key" | "all"; events: readonly HistoryEventInput[]; reports: readonly HistoryReportInput[];
      currentRounds: ReadonlyMap<string, string> }
);
