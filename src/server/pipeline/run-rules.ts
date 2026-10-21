import { dispatcherFor, slotAgent, boundaryOf, isGateId, AUTO_SCOUT_DISABLED_REASON, AUTO_PROPOSE_DISABLED_REASON } from "@harness/core/pipeline.mjs";
import { canPropose } from "@harness/core/transitions.mjs";

import type { PipelineEntry, GateEntry } from "./run-service";
import type { UsageLimitFailure } from "@/server/result";

export type PipelineNext =
  | { key: string; node: string; version: number; action: "dispatch"; agent: string; hint: string; format: string | null; entry?: PipelineEntry }
  | { key: string; node: string; version: number; action: "wait"; on: "gate"; gate: string; boundary: { from: string; to: string } | null; planCommit: string | null; format: string | null; gateEntry?: GateEntry }
  | { key: string; node: string; version: number; action: "wait"; on: "handoff"; note: string | null }
  | { key: string; node: string; version: number; action: "wait"; on: "acceptance"; checks: number[]; note: string }
  | { key: string; node: string; version: number; action: "wait"; on: "qa"; note: string; path: string; commit: string; resume: { agent: "qa-verifier"; key: string; format: string | null; entry?: PipelineEntry; agentRunId?: string } }
  | { key: string; node: string; version: number; action: "wait"; on: "impl-verify"; note: string; path: string; commit: string; resume: { agent: "impl-verifier"; key: string; format: string | null; entry?: PipelineEntry; agentRunId?: string } }
  | { key: string; node: string; version: number; action: "wait"; on: "cap"; reason: string; code: "USAGE_LIMIT_REACHED"; resetAt: string }
  | { key: string; node: string; version: number; action: "accept"; hint: string }
  | { key: string; node: string | null; version: number; action: "done" };

export type PipelineNextInput = {
  key: string;
  format?: string | null;
  entry?: PipelineEntry;
  hasResumableRun?: boolean;
  acceptanceFailure?: { checks: number[]; note: string } | null;
  qaFailure?: { note: string; path: string; commit: string } | null;
  implVerifyFailure?: { note: string; path: string; commit: string } | null;
  version: number;
  node: string | null;
  status: string;
  planCommit: string | null;
  agent: string;
  handoff: { note: string | null } | null;
  cap: UsageLimitFailure | null;
};

export const HINT: Record<string, string> = {
  propose: "Dispatch pm with no key.",
  accept: "You run this one — reproduce the five acceptance checks yourself. All pass: write the acceptance section in docs/agents/main-loop/<KEY>.md, commit it, then record it with report_submit({ actor: \"main-loop\" }). Any fails: record it with acceptance_fail and tell the owner; don't reopen.",
  plan: "Dispatch with the item key. One item per dispatch.",
  verify: "Pick this item's required paths from docs/plans/verification-paths.md and write them, with what you ran for each, into docs/agents/main-loop/<KEY>.md — plan-verifier is briefed from that list. Run your own round first (reconciling-proposals-with-codebase). Dispatch plan-verifier only when your round finds nothing, then record the clean pass with validation_record — the node completes on that record.",
  implement: "Dispatch with the item key. It submits a report bound to its AgentRun and closes the normal report step after verify/ok. The server completes the implementation span; acceptance is separate.",
  "impl-verify": "Dispatch impl-verifier with the item key and current entry. First prepare the verification environment for the implementation report commit as the runbook says, then brief only that commit and where to verify it. Failed, blocked or stale verification cannot complete this node; final acceptance remains with the main loop.",
  qa:"Dispatch qa-verifier with the item key and current entry. Use only the explicit test environment and required scenarios in harness.json. It records browser evidence against the implementation commit. Failed, blocked or stale QA cannot complete this node; final acceptance remains with the main loop.",
  "doc-audit": "Dispatch doc-auditor with no key; append its report to docs/agents/doc-auditor/audit-log.md yourself.",
  scoutHead: "Dispatch feature-scout with no key. It adds up to three backlog items it has evidence for. Append its report to docs/agents/feature-scout/scouting-log.md yourself, then call pipeline_next again.",
  scout: "Dispatch feature-scout with no key; it adds up to three items it has evidence for to the backlog. Append its report to docs/agents/feature-scout/scouting-log.md yourself.",
};

export const handoffIsLive = (steppedAt: Date, itemUpdatedAt: Date): boolean => steppedAt.getTime() > itemUpdatedAt.getTime();

export function decideNext(i: PipelineNextInput): PipelineNext {
  const { key, version } = i;
  if (i.node === null) return { key, node: null, version, action: "done" };
  const node = i.node;
  if (isGateId(node)) return { key, node, version, action: "wait", on: "gate", gate: node, boundary: boundaryOf(node), planCommit: i.planCommit, format: i.format ?? null, ...(i.entry ? { gateEntry: { runId: i.entry.runId, entryId: i.entry.entryId } } : {}) };
  if (node === "accept") return i.acceptanceFailure
    ? { key, node, version, action: "wait", on: "acceptance", checks: i.acceptanceFailure.checks, note: i.acceptanceFailure.note }
    : { key, node, version, action: "accept", hint: HINT.accept ?? "" };
  if (i.handoff !== null) return { key, node, version, action: "wait", on: "handoff", note: i.handoff.note };
  if (node === "impl-verify" && i.implVerifyFailure) return { key, node, version, action: "wait", on: "impl-verify", ...i.implVerifyFailure, resume: { agent: "impl-verifier", key, format: i.format ?? null, ...(i.entry ? { entry: i.entry } : {}) } };
  if (node === "qa" && i.qaFailure) return { key, node, version, action: "wait", on: "qa", ...i.qaFailure, resume: { agent: "qa-verifier", key, format: i.format ?? null, ...(i.entry ? { entry: i.entry } : {}) } };
  const agent = dispatcherFor(node, i.agent);
  if (agent === null) return { key, node, version, action: "done" };
  if (i.cap !== null && !i.hasResumableRun) return { key, node, version, action: "wait", on: "cap", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
  return { key, node, version, action: "dispatch", agent, hint: hintFor(node), format: i.format ?? null, ...(i.entry ? { entry: i.entry } : {}) };
}

export type HeadNext = { action: "dispatch"; agent: "pm" | "feature-scout"; hint: string }
  | { action: "none"; reason: string; code?: never }
  | ({ action: "none" } & Omit<UsageLimitFailure, "ok">);

export const RUNBOOK_STALE_NOTE =
  "This repository's runbook does not match the current template, or its version was never recorded. "
  + "Ask the owner to run /harness:init. Until then take the order of execution from pipeline_next, not from CLAUDE.md.";

export function hintFor(node: string): string {
  const agent = slotAgent(node);
  return HINT[node] ?? (agent === "doc-auditor" ? HINT["doc-audit"] : agent === "feature-scout" ? HINT.scout : "");
}

export type HeadInput = {
  autoScoutEnabled: boolean;
  hasResumablePmRun?: boolean;
  hasResumableScoutRun?: boolean;
  scoutedSinceChange: boolean;
  scoutNodePending: boolean;
  autoProposeEnabled: boolean;
  openCount: number;
  availableBacklog: number;
  cap: UsageLimitFailure | null;
};

export function scoutNodePending(items: PipelineNext[]): boolean {
  return items.some((item) => item.action === "dispatch" && item.agent === "feature-scout");
}

export function decideHead(i: HeadInput): HeadNext {
  if (!canPropose(i.openCount)) return { action: "none", reason: `open items: ${i.openCount} (max 2)` };
  if (i.availableBacklog === 0) {
    if (i.scoutNodePending) return { action: "none", reason: "a Scout node in items dispatches feature-scout — that run looks for items to add" };
    if (!i.autoScoutEnabled) return { action: "none", reason: AUTO_SCOUT_DISABLED_REASON };
    if (i.scoutedSinceChange) return { action: "none", reason: "feature-scout already looked at this backlog — it looks again after the backlog changes; add an item on the Backlog tab" };
    if (i.cap !== null && !i.hasResumableScoutRun) return { action: "none", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
    return { action: "dispatch", agent: "feature-scout", hint: HINT.scoutHead };
  }
  if (!i.autoProposeEnabled) return { action: "none", reason: AUTO_PROPOSE_DISABLED_REASON };
  if (i.cap !== null && !i.hasResumablePmRun) return { action: "none", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
  return { action: "dispatch", agent: "pm", hint: HINT.propose };
}
