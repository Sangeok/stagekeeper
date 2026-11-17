import { withinLimit, capReason, limitsFor } from "../../shared/plans/limits.mjs";

export const OWNER_TOKEN_PLAN_GATE = "Owner tokens open on Pro. Approve in the Inbox for now.";

export function capError(plan, axis, currentCount) {
  return withinLimit(plan, axis, currentCount + 1) ? null : `${capReason(plan, axis)}. Upgrade the plan to add more.`;
}

export function allowsAgent(plan, agent, roster) {
  const limits = limitsFor(plan);
  return limits.agents.includes(agent) || roster.slice(0, limits.workspaces).includes(agent);
}

export function historyCutoff(plan, now) {
  const days = limitsFor(plan).historyDays;
  return days === null ? null : new Date(now.getTime() - days * 86_400_000);
}

export function allowsSessionApprovals(plan) {
  return limitsFor(plan).sessionApprovals;
}
