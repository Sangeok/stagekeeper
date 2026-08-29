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

export function rejectActionsFor(status: string): RejectAction[] {
  const actions: RejectAction[] = [];
  if (findRule("human", status, "계획지시")?.kind === "bounce") actions.push("bounce");
  if (findRule("human", status, "보류") !== null) actions.push("hold");
  if (canDiscard(status)) actions.push("discard");
  return actions;
}
