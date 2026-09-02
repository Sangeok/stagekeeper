// 어떤 사람 전이가 열려 있는지는 packages/core의 상태 기계 하나로만 판정한다.
// ApcH의 GATE_TRANSITIONS·rejectActionsFor 화이트리스트를 대체한다 — 표가 두 벌이 되지 않게.
import { STATUSES, canDiscard, findRule } from "@harness/core/transitions.mjs";
import type { RejectAction } from "./gate-text";

export function isGateSource(status: string): boolean {
  return STATUSES.some((to: string) => findRule("human", status, to)?.kind === "gate");
}

// 이 status에서 도장이 여는 다음 status(승인대기 → 계획지시, 검토대기 → 구현승인).
export function gateTargetFor(status: string): string | null {
  return STATUSES.find((to: string) => findRule("human", status, to)?.kind === "gate") ?? null;
}

// 재개(보류에서 돌아가기)로 갈 수 있는 status들.
export function resumeTargetsFor(status: string): string[] {
  return STATUSES.filter((to: string) => findRule("human", status, to)?.kind === "resume");
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
  if (findRule("human", status, "planning")?.kind === "bounce") actions.push("bounce");
  if (findRule("human", status, "on_hold") !== null) actions.push("hold");
  if (canDiscard(status)) actions.push("discard");
  return actions;
}
