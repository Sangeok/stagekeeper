// 어떤 사람 전이가 열려 있는지는 packages/core의 상태 기계 하나로만 판정한다.
// ApcH의 GATE_TRANSITIONS·rejectActionsFor 화이트리스트를 대체한다 — 표가 두 벌이 되지 않게.
import { STATUSES, canDiscard, findRule, type RuleKind } from "@harness/core/transitions.mjs";
import type { RejectAction } from "./gate-text";

// 결재함 자격(게이트·재개·뱃지 수)은 배너도 쓰므로 entities/board-item이 소유한다. 이 슬라이스 소비자를 위해 다시 내보낸다.
export { isAtGate, needsHumanDecision, pendingInboxCount, resumeTargetsFor, type GateRow } from "@/fsd/entities/board-item";

const ruleKind = (actor: string, from: string, to: string): RuleKind | null =>
  findRule(actor, from, to)?.kind ?? null;

// 되돌리기(reopen)로 갈 수 있는 status들 — done에서 돌아가는 사람 전이. 항목 상세만 쓴다:
// 결재함 자격(needsHumanDecision)에는 세지 않는다 — 세면 모든 done이 영원히 결재함에 남는다.
export function reopenTargetsFor(status: string): string[] {
  return STATUSES.filter((to: string) => ruleKind("human", status, to) === "reopen");
}

export function rejectActionsFor(status: string): RejectAction[] {
  const actions: RejectAction[] = [];
  if (ruleKind("human", status, "planning") === "bounce") actions.push("bounce");
  if (findRule("human", status, "on_hold") !== null) actions.push("hold");
  if (canDiscard(status)) actions.push("discard");
  return actions;
}
