import { STATUSES, canDiscard, findRule, type RuleKind } from "@harness/core/pipeline/transitions.mjs";
import type { RejectAction } from "./gate-text";

export { needsHumanDecision, pendingInboxCount, resumeTargetsFor } from "@/fsd/entities/board-item";

const ruleKind = (actor: string, from: string, to: string): RuleKind | null =>
  findRule(actor, from, to)?.kind ?? null;

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
