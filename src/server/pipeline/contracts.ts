export type { Caller } from "./board-service";
export type { PipelineEntry } from "./run-service";
export type { PipelineNext } from "./run-rules";
export type { HistoryEventRecord } from "./history-page";

export type ExecutionItem = { id: string; key: string; agent: string; updatedAt: Date };
export type ExecutionFacts = {
  boardItemId: string;
  cursorNode: string | null;
  activityDispatched: boolean;
  turnDispatched: boolean;
  handoff: { step: string; note: string | null } | null;
};
