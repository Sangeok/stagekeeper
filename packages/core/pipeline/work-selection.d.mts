export type SelectionDecision = {
  contextKey: string; policy: string; criterion: string; readiness: string; assignmentReason: string;
  evidence: { key: string; quote: string }[]; comparisons: { key: string; reason: string }[]; uncertainties: string[];
};
export type SelectionCandidate = { key: string; title: string; area: string; source: string; createdAt: string; eligible: boolean; reason: string | null; agents: string[] };
export type SelectionContext = { contextKey: string; policy: string; candidates: SelectionCandidate[] };
export function selectionReason(decision: unknown, context: SelectionContext, key: string, agent: string): string | null;
export function readSelectionDecision(value: unknown): SelectionDecision | null;
export function matchingAgents(area: string, workspaces: readonly { path: string; agent: string }[]): string[];
