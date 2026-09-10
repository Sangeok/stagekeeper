import { NODE_KINDS, gateKind } from "@harness/core/pipeline.mjs";
const LABEL: Record<string, string> = { propose: "Propose", plan: "Plan", verify: "Verify", implement: "Implement", accept: "Accept", "doc-audit": "Doc audit", scout: "Scout" };
export const nodeLabel = (kind: string): string => LABEL[kind] ?? kind;
export const gateLabel = (id: string): string => `before ${nodeLabel(gateKind(id) ?? id)}`;
export const nodeAgentLabel = (kind: string, roster: readonly string[]): string => (kind === "plan" || kind === "implement" ? roster.join(", ") : nodeLabel(kind));
export const NODE_ORDER = NODE_KINDS;
