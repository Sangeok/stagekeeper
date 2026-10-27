import type { Plan } from "@harness/core/entitlement.mjs";
import { countNoun } from "@/fsd/shared/lib/count-noun";
import { planLabel } from "@/fsd/entities/account-plan";
import type { ProjectConnectionInput } from "./project-connection-input";

export type ProjectConnectionTarget = { id: string; name: string; repoOwner: string; repo: string; disconnectedAt: string | null };
export type ProjectConnectionSummary = {
  plan: Plan; limit: number | null; version: number; connectedCount: number;
};
export type ProjectConnectionState = { status: "success" } | { status: "stale" } | { status: "error"; reason: string };
export type ProjectConnectionAction = (input: ProjectConnectionInput) => Promise<ProjectConnectionState>;
export const STALE_CONNECTION_MESSAGE = "Your project list changed. Review the latest connection details and try again.";
export const UNKNOWN_CONNECTION_MESSAGE = "Couldn't confirm the result. Refresh to check the latest repository connection.";

export function connectionControlKey(targetId: string, model: ProjectConnectionSummary): string {
  return `connection:${targetId}:${model.version}:${model.plan}`;
}

function noFreeSlot(plan: Plan, limit: number): string {
  return `No free slot. The ${planLabel(plan)} plan allows ${countNoun(limit, "connected repository", "connected repositories")}.`;
}

export function reconnectBlock(model: Pick<ProjectConnectionSummary, "plan" | "limit" | "connectedCount">): string | null {
  if (model.limit !== null && model.connectedCount >= model.limit) return noFreeSlot(model.plan, model.limit);
  return null;
}

export function reconnectCapReason(plan: Plan, limit: number): string {
  return `${noFreeSlot(plan, limit)} Disconnect another repository first.`;
}
