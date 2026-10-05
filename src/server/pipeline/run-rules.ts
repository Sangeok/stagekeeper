// 순수. DB·프레임워크 없음(board-rules.ts와 같은 층). run.ts가 읽은 사실로 pipeline_next의 답 하나를 정한다.
import { dispatcherFor, slotAgent, boundaryOf, isGateId, AUTO_SCOUT_DISABLED_REASON } from "@harness/core/pipeline.mjs";
import { canPropose } from "@harness/core/transitions.mjs";

// 응답 — 항목 하나의 다음 일. 세션은 이 값을 읽고 그 턴에 행동한다(런북 "The cycle").
import type { PipelineEntry, GateEntry } from "./run-query";
import type { UsageLimitFailure } from "../result";

export type PipelineNext =
  | { key: string; node: string; version: number; action: "dispatch"; agent: string; hint: string; format: string | null; entry?: PipelineEntry }  // 그 에이전트를 key와 함께 디스패치. hint = 그 노드에서 지켜야 할 한 문장
  | { key: string; node: string; version: number; action: "wait"; on: "gate"; gate: string; boundary: { from: string; to: string } | null; planCommit: string | null; format: string | null; gateEntry?: GateEntry }
  | { key: string; node: string; version: number; action: "wait"; on: "handoff"; note: string | null }  // 커밋 핸드오프(배너와 같은 판정)
  | { key: string; node: string; version: number; action: "wait"; on: "acceptance"; checks: number[]; note: string }
  | { key: string; node: string; version: number; action: "wait"; on: "cap"; reason: string; code: "USAGE_LIMIT_REACHED"; resetAt: string }
  | { key: string; node: string; version: number; action: "accept"; hint: string }                           // main-loop 본인이 인수 5조건을 재현한다
  | { key: string; node: string | null; version: number; action: "done" };

// run.ts(nextFor)가 읽어 넘기는 사실. 어느 질의로 읽는지는 아래 "판정 순서" 문단.
export type PipelineNextInput = {
  key: string;
  format?: string | null;
  entry?: PipelineEntry;
  hasResumableRun?: boolean;
  acceptanceFailure?: { checks: number[]; note: string } | null;
  version: number;                          // PipelineRun.version.version
  node: string | null;                      // PipelineRun.node. null이면 런이 닫혔다
  status: string;
  planCommit: string | null;
  agent: string;                            // BoardItem.agent — plan·implement 노드가 디스패치하는 dev
  handoff: { note: string | null } | null;  // 열린 dev run의 마지막 원장 행이 handoff면 그 note
  cap: UsageLimitFailure | null;
};

// dispatch의 hint — 그 노드에서 지켜야 할 한 문장. product-copy.md §13에 같은 문장.
export const HINT: Record<string, string> = {
  propose: "Dispatch pm with no key. It proposes at most one item per run.",
  accept: "You run this one — reproduce the five acceptance checks yourself. All pass: write the acceptance section in docs/agents/main-loop/<KEY>.md, commit it, then record it with report_submit({ actor: \"main-loop\" }). Any fails: record it with acceptance_fail and tell the owner; don't reopen.",
  plan: "Dispatch with the item key. One item per dispatch.",
  verify: "Pick this item's required paths from docs/plans/verification-paths.md and write them, with what you ran for each, into docs/agents/main-loop/<KEY>.md — plan-verifier is briefed from that list. Run your own round first (reconciling-proposals-with-codebase). Dispatch plan-verifier only when your round finds nothing, then record the clean pass with validation_record — the node completes on that record.",
  implement: "Dispatch with the item key. It submits a report bound to its AgentRun and closes the normal report step after verify/ok. The server completes the implementation span; acceptance is separate.",
  "doc-audit": "Dispatch doc-auditor with no key; append its report to docs/agents/doc-auditor/audit-log.md yourself.",
  scoutHead: "Dispatch feature-scout with no key. It adds up to three backlog items it has evidence for. Append its report to docs/agents/feature-scout/scouting-log.md yourself, then call pipeline_next again.",
  scout: "Dispatch feature-scout with no key; it adds up to three items it has evidence for to the backlog. Append its report to docs/agents/feature-scout/scouting-log.md yourself.",
};

// 핸드오프가 아직 살아 있는가. 원장의 마지막 단계만 보면 안 된다 — 소유자가 커밋하고 에이전트가 이어서
// 계획서나 보고를 제출하면 보드 행이 갱신되지만, 그 단계 행은 `handoff`인 채로 남는다. 그 상태에서
// "그 파일을 커밋하라"를 계속 답하면 이미 커밋한 파일을 다시 커밋하라고 소유자에게 말하게 된다.
// 그래서 멈춘 시각이 항목의 마지막 쓰기보다 뒤일 때만 살아 있다고 본다. 틀리는 쪽은 안전하다 —
// 살아 있는 핸드오프를 숨기면 에이전트가 다시 디스패치돼 핸드오프를 다시 남긴다.
export const handoffIsLive = (steppedAt: Date, itemUpdatedAt: Date): boolean => steppedAt.getTime() > itemUpdatedAt.getTime();

// 판정 순서: 런 닫힘 → 게이트 → accept → handoff → cap → dispatch. 에이전트 없는 노드는 있을 수 없지만(accept는 위에서 끝난다) 방어로 done.
export function decideNext(i: PipelineNextInput): PipelineNext {
  const { key, version } = i;
  if (i.node === null) return { key, node: null, version, action: "done" };
  const node = i.node;
  if (isGateId(node)) return { key, node, version, action: "wait", on: "gate", gate: node, boundary: boundaryOf(node), planCommit: i.planCommit, format: i.format ?? null, ...(i.entry ? { gateEntry: { runId: i.entry.runId, entryId: i.entry.entryId } } : {}) };
  // accept는 메인 루프가 에이전트 없이 직접 하는 유일한 동작이라 hint를 따로 단다.
  if (node === "accept") return i.acceptanceFailure
    ? { key, node, version, action: "wait", on: "acceptance", checks: i.acceptanceFailure.checks, note: i.acceptanceFailure.note }
    : { key, node, version, action: "accept", hint: HINT.accept ?? "" };
  if (i.handoff !== null) return { key, node, version, action: "wait", on: "handoff", note: i.handoff.note };
  const agent = dispatcherFor(node, i.agent);
  if (agent === null) return { key, node, version, action: "done" };
  if (i.cap !== null && !i.hasResumableRun) return { key, node, version, action: "wait", on: "cap", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
  return { key, node, version, action: "dispatch", agent, hint: hintFor(node), format: i.format ?? null, ...(i.entry ? { entry: i.entry } : {}) };
}

// key 없는 pipeline_next의 머리 — 빈 백로그는 scout가 채우고 후보가 있으면 pm이 고른다.
export type HeadNext = { action: "dispatch"; agent: "pm" | "feature-scout"; hint: string }
  | { action: "none"; reason: string; code?: never }
  | ({ action: "none" } & Omit<UsageLimitFailure, "ok">);

// 저장소의 런북이 현재 템플릿과 다를 때만 실린다 — 정상 응답은 이 필드가 아예 없다.
// init이 심은 판의 해시를 서버가 갖고 있고(POST /api/runbook), 판정은 packages/core/runbook.mjs에 있다.
// 세션이 매 턴 부르는 것이 key 없는 개요라 여기에 싣는다. product-copy.md §13에 같은 문장.
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
  hasPropose: boolean;   // 현재 버전의 nodes에 propose가 있는가
  openCount: number;     // 미결 항목 수(latestBoard(projectId, true).length)
  availableBacklog: number; // 아직 보드에 안 올라간 백로그 항목 수 — pm이 고를 수 있는 것
  cap: UsageLimitFailure | null;
};

export function scoutNodePending(items: PipelineNext[]): boolean {
  return items.some((item) => item.action === "dispatch" && item.agent === "feature-scout");
}

// Open limit first, then fill an empty backlog once per change, then propose.
export function decideHead(i: HeadInput): HeadNext {
  if (!canPropose(i.openCount)) return { action: "none", reason: `open items: ${i.openCount} (max 2)` };
  if (i.availableBacklog === 0) {
    if (i.scoutNodePending) return { action: "none", reason: "a Scout node in items dispatches feature-scout — that run looks for items to add" };
    if (!i.autoScoutEnabled) return { action: "none", reason: AUTO_SCOUT_DISABLED_REASON };
    if (i.scoutedSinceChange) return { action: "none", reason: "feature-scout already looked at this backlog — it looks again after the backlog changes; add an item on the Backlog tab" };
    if (i.cap !== null && !i.hasResumableScoutRun) return { action: "none", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
    return { action: "dispatch", agent: "feature-scout", hint: HINT.scoutHead };
  }
  if (!i.hasPropose) return { action: "none", reason: "no propose node on this pipeline — put an item on the board from the Backlog tab" };
  if (i.cap !== null && !i.hasResumablePmRun) return { action: "none", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
  return { action: "dispatch", agent: "pm", hint: HINT.propose };
}
