// src/server/pipeline/run-rules.ts — 순수. DB·프레임워크 없음(board-rules.ts와 같은 층). run.ts가 읽은 사실로 pipeline_next의 답 하나를 정한다.
import { NODE_AGENT, boundaryOf, isGateId } from "@harness/core/pipeline.mjs";
import { canPropose } from "@harness/core/transitions.mjs";

// 응답 — 항목 하나의 다음 일. 세션은 이 값을 읽고 그 턴에 행동한다(런북 "The cycle").
export type PipelineNext =
  | { key: string; node: string; version: number; action: "dispatch"; agent: string; hint: string }  // 그 에이전트를 key와 함께 디스패치. hint = 그 노드에서 지켜야 할 한 문장
  | { key: string; node: string; version: number; action: "wait"; on: "gate"; gate: string; boundary: { from: string; to: string } | null; planCommit: string | null }
  | { key: string; node: string; version: number; action: "wait"; on: "handoff"; note: string | null }  // 커밋 핸드오프(배너와 같은 판정)
  | { key: string; node: string; version: number; action: "wait"; on: "cap"; reason: string }
  | { key: string; node: string; version: number; action: "accept" }                           // main-loop 본인이 인수 5조건을 재현한다
  | { key: string; node: string | null; version: number; action: "done" };

// run.ts(nextFor)가 읽어 넘기는 사실. 어느 질의로 읽는지는 아래 "판정 순서" 문단.
export type NextInput = {
  key: string;
  version: number;                          // PipelineRun.version.version
  node: string | null;                      // PipelineRun.node. null이면 런이 닫혔다
  status: string;
  planCommit: string | null;
  agent: string;                            // BoardItem.agent — plan·implement 노드가 디스패치하는 dev
  handoff: { note: string | null } | null;  // 열린 dev run의 마지막 원장 행이 handoff면 그 note
  capReason: string | null;                 // capError(plan, "dispatches", recentRuns) — 상한을 넘었으면 그 문장
};

// dispatch의 hint — 그 노드에서 지켜야 할 한 문장. product-copy.md §13에 같은 문장.
export const HINT: Record<string, string> = {
  propose: "Dispatch pm with no key. It proposes at most one item per run.",
  plan: "Dispatch with the item key. One item per dispatch.",
  verify: "Run your own verification round first (paths from docs/plans/verification-paths.md, reconciling-proposals-with-codebase). Dispatch plan-verifier only when your round finds nothing, then record the clean pass with validation_record — the node completes on that record.",
  implement: "Dispatch with the item key. It reports and moves the item to done itself.",
  "doc-audit": "Dispatch doc-auditor with no key; append its report to docs/agents/doc-auditor/audit-log.md yourself.",
  scout: "Dispatch feature-scout with no key — only when harness.json.scout is configured (init writes that agent only then); otherwise take the Scout node off the Pipeline tab. Append its report to docs/agents/feature-scout/scouting-log.md yourself.",
};

// 판정 순서: 런 닫힘 → 게이트 → accept → handoff → cap → dispatch. 에이전트 없는 노드는 있을 수 없지만(accept는 위에서 끝난다) 방어로 done.
export function decideNext(i: NextInput): PipelineNext {
  const { key, version } = i;
  if (i.node === null) return { key, node: null, version, action: "done" };
  const node = i.node;
  if (isGateId(node)) return { key, node, version, action: "wait", on: "gate", gate: node, boundary: boundaryOf(node), planCommit: i.planCommit };
  if (node === "accept") return { key, node, version, action: "accept" };
  if (i.handoff !== null) return { key, node, version, action: "wait", on: "handoff", note: i.handoff.note };
  const agent = node === "plan" || node === "implement" ? i.agent : (NODE_AGENT as Record<string, string | undefined>)[node];
  if (agent === undefined) return { key, node, version, action: "done" };
  if (i.capReason !== null) return { key, node, version, action: "wait", on: "cap", reason: i.capReason };
  return { key, node, version, action: "dispatch", agent, hint: HINT[node] ?? "" };
}

// key 없는 pipeline_next의 머리 — pm을 디스패치할 차례인가. none이면 사유가 실린다(null은 사유를 못 싣는다).
export type HeadNext = { action: "dispatch"; agent: "pm"; hint: string } | { action: "none"; reason: string };
export type PipelineOverview = { head: HeadNext; items: PipelineNext[] };
export type HeadInput = {
  hasPropose: boolean;   // 현재 버전의 nodes에 propose가 있는가
  openCount: number;     // 미결 항목 수(latestBoard(projectId, true).length)
  capReason: string | null; // capError(plan, "dispatches", recentRuns) — decideNext와 같은 수
};

// 판정 순서: propose 노드 없음 → 미결 2건(canPropose — pm 규칙과 같은 문장) → 상한 → dispatch pm.
export function decideHead(i: HeadInput): HeadNext {
  if (!i.hasPropose) return { action: "none", reason: "no propose node on this pipeline — put an item on the board from the Backlog tab" };
  if (!canPropose(i.openCount)) return { action: "none", reason: `open items: ${i.openCount} (max 2)` };
  if (i.capReason !== null) return { action: "none", reason: i.capReason };
  return { action: "dispatch", agent: "pm", hint: HINT.propose };
}
