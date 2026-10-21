import { STATUSES, findRule } from "@harness/core/transitions.mjs";

export type GateRow = { status: string; gate: string | null };

export function isAtGate(row: GateRow): boolean {
  return row.gate !== null;
}

export function needsHumanDecision(row: GateRow): boolean {
  return isAtGate(row) || resumeTargetsFor(row.status).length > 0;
}

export function pendingInboxCount(rows: readonly GateRow[]): number {
  return rows.filter(needsHumanDecision).length;
}

export function resumeTargetsFor(status: string): string[] {
  return STATUSES.filter((to: string) => findRule("human", status, to)?.kind === "resume");
}
