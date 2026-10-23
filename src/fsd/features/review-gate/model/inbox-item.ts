import { blobHref, type RepoRef } from "@/fsd/entities/board-item";
import type { ActionResult } from "@/fsd/shared/api/result";
import { isGateId } from "@harness/core/pipeline/pipeline.mjs";
import { needsHumanDecision } from "./gate-source";
import type { ApproveGateInput, DiscardInput, RetryAcceptanceInput, TransitionInput } from "./review-gate-input";

export type GateEntry = NonNullable<ApproveGateInput["gateEntry"]>;
export type InboxReadOnlyLabel = "Disconnected" | "Not selected" | "Read only";

export function inboxReadOnlyLabel(access: { available: boolean; code?: "disconnected" | "not-selected" | "integrity" }): InboxReadOnlyLabel {
  if (!access.available && access.code === "disconnected") return "Disconnected";
  if (!access.available && access.code === "not-selected") return "Not selected";
  return "Read only";
}
export type InboxItem = {
  format?: string | null;
  gateEntry?: GateEntry;
  key: string;
  title: string;
  type: string | null;
  area: string;
  agent: string;
  status: string;
  gate: string | null;
  reason: string;
  results: string[];
  validation: string | null;
  planPath: string | null;
  planUrl: string | null;
  planCommit: string | null;
  proposedBy: "you" | "pm";
  proposedOn: string;
  statusSince: string;
  heldFrom: string | null;
  heldBy: "human" | "agent" | null;
  updatedAt: string;
};

export type RetryAcceptanceAction = (input: RetryAcceptanceInput) => Promise<ActionResult<void>>;

export type TransitionAction = (input: TransitionInput) => Promise<ActionResult<void>>;

export type DiscardAction = (key: DiscardInput["key"], expectedUpdatedAt: DiscardInput["expectedUpdatedAt"]) => Promise<ActionResult<void>>;

export type GateAction = (input: ApproveGateInput) => Promise<ActionResult<void>>;

const INBOX_SORT: Record<string, number> = { in_review: 0, proposed: 1, on_hold: 2 };

type BoardRow = {
  status: string;
  agent: string;
  reason: string;
  results: string[];
  validation: string | null;
  planPath: string | null;
  planCommit: string | null;
  proposedOn: Date;
  updatedAt: Date;
  backlogItem: { key: string; title: string; area: string; type: string | null };
  events: { at: Date; from: string | null; to: string | null; actor: string }[];
  run: { id?: string; entryId?: string | null; version?: { format: string | null }; node: string; closedAt: Date | null } | null;
};

export function toInboxItems(rows: readonly BoardRow[], repo: RepoRef): InboxItem[] {
  const gateOf = (row: BoardRow) => (row.run && row.run.closedAt === null && isGateId(row.run.node) ? row.run.node : null);
  return rows
    .filter((row) => needsHumanDecision({ status: row.status, gate: gateOf(row) }))
    .sort((a, b) => (INBOX_SORT[a.status] ?? 9) - (INBOX_SORT[b.status] ?? 9))
    .map((row) => {
      const became = row.events.find((e) => e.to === row.status && e.from !== e.to);
      const held = row.status === "on_hold" ? row.events.find((e) => e.to === "on_hold" && e.from !== e.to) : undefined;
      const opened = row.events.find((e) => e.from === null && e.to === "proposed");
      return {
        key: row.backlogItem.key,
        title: row.backlogItem.title,
        type: row.backlogItem.type,
        area: row.backlogItem.area,
        agent: row.agent,
        status: row.status,
        gate: gateOf(row),
        format: row.run?.version?.format ?? null,
        ...(row.run?.version?.format === "slots-v1" && row.run.id && row.run.entryId ? { gateEntry: { runId: row.run.id, entryId: row.run.entryId } } : {}),
        reason: row.reason,
        results: row.results,
        validation: row.validation,
        planPath: row.planPath,
        planUrl: row.planPath === null ? null : blobHref(repo, row.planPath, row.planCommit),
        planCommit: row.planCommit,
        proposedBy: opened?.actor === "human" ? ("you" as const) : ("pm" as const),
        proposedOn: row.proposedOn.toISOString(),
        statusSince: (became?.at ?? row.updatedAt).toISOString(),
        heldFrom: held?.from ?? null,
        heldBy: held === undefined ? null : held.actor === "human" ? "human" : "agent",
        updatedAt: row.updatedAt.toISOString(),
      };
    });
}

export function slotGateEntry(item: InboxItem): GateEntry | null {
  return item.gate !== null && item.format === "slots-v1" && item.gateEntry ? item.gateEntry : null;
}

export function gateCardKey(item: InboxItem): string {
  const entry = slotGateEntry(item);
  return JSON.stringify(entry ? [item.key, item.gate, entry.runId, entry.entryId] : [item.key, item.gate, item.updatedAt]);
}
