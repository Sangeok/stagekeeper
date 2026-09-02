// 어떤 사람 전이가 열려 있는지는 packages/core의 상태 기계 하나로만 판정한다.
// ApcH의 GATE_TRANSITIONS·rejectActionsFor 화이트리스트를 대체한다 — 표가 두 벌이 되지 않게.
import { STATUSES, canDiscard, findRule } from "@harness/core/transitions.mjs";
import type { RejectAction } from "./gate-text";

// 규칙의 kind 어휘. 값의 출처는 packages/core/transitions.mjs의 RULES 표이고, 서버 쪽 쌍둥이는
// src/server/pipeline/board-rules.ts의 RuleKind다 — FSD는 @/server를, 서버는 FSD를 import할 수
// 없어 타입을 한 곳에 둘 수 없다. 대신 두 목록이 RULES와 어긋나면 gate-source.test.ts가 깨진다.
// 이 형이 없으면 아래 비교가 그냥 string 비교라, 오타가 컴파일을 통과하고 분류만 조용히 어긋난다.
export type RuleKind = "gate" | "bounce" | "hold" | "resume" | "plan" | "done";

const ruleKind = (actor: string, from: string, to: string): RuleKind | null =>
  (findRule(actor, from, to)?.kind ?? null) as RuleKind | null;

export function isGateSource(status: string): boolean {
  return STATUSES.some((to: string) => ruleKind("human", status, to) === "gate");
}

// 이 status에서 도장이 여는 다음 status(승인대기 → 계획지시, 검토대기 → 구현승인).
export function gateTargetFor(status: string): string | null {
  return STATUSES.find((to: string) => ruleKind("human", status, to) === "gate") ?? null;
}

// 재개(보류에서 돌아가기)로 갈 수 있는 status들.
export function resumeTargetsFor(status: string): string[] {
  return STATUSES.filter((to: string) => ruleKind("human", status, to) === "resume");
}

// 결재함에 오르는 status = 게이트가 열려 있거나(승인 대기) 재개할 수 있는 것.
// 화이트리스트를 두 벌로 만들지 않으려고 여기서도 상태 기계에서 파생한다.
export function needsHumanDecision(status: string): boolean {
  return isGateSource(status) || resumeTargetsFor(status).length > 0;
}

// Inbox 탭 뱃지의 유일한 출처 — 목록에 실제로 오르는 카드 수와 같은 술어로 센다.
// 배너는 여기서 갈라진다: on_hold는 배너를 소유하지 않는다(product-copy.md §5).
// 뱃지는 목록을 따른다(§7: 순서가 gate2 · gate1 · on_hold).
export function pendingInboxCount(statuses: readonly string[]): number {
  return statuses.filter(needsHumanDecision).length;
}

export function rejectActionsFor(status: string): RejectAction[] {
  const actions: RejectAction[] = [];
  if (ruleKind("human", status, "planning") === "bounce") actions.push("bounce");
  if (findRule("human", status, "on_hold") !== null) actions.push("hold");
  if (canDiscard(status)) actions.push("discard");
  return actions;
}
