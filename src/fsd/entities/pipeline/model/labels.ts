import { slotAgent, refId, gateKind, gateId, boundaryOf } from "@harness/core/pipeline.mjs";

const LABEL: Record<string, string> = { propose: "Propose", plan: "Plan", verify: "Verify", implement: "Implement", "impl-verify": "Implementation check", qa: "QA", accept: "Accept", "doc-audit": "Doc audit", scout: "Scout" };
export const nodeLabel = (kind: string): string => {
  if (Object.prototype.hasOwnProperty.call(LABEL, kind)) return LABEL[kind];
  const agent = slotAgent(kind);
  if (agent === null) return kind;
  const label = agent === "doc-auditor" ? "Doc audit" : agent === "feature-scout" ? "Scout" : kind;
  const suffix = kind.includes("#") ? ` ${kind.slice(kind.indexOf("#"))}` : "";
  return label + suffix;
};
export const autoEdgeLabel = (kind: string): string | null => kind === "propose" ? null : `auto → ${boundaryOf(gateId(kind))?.to ?? nodeLabel(kind).toLowerCase()}`;
export const gateLabel = (id: string, nameOf?: (pipelineId: string) => string): string => {
  const step = gateKind(id) ?? id;
  const pipelineId = refId(step);
  return `before ${pipelineId !== null && nameOf ? nameOf(pipelineId) : nodeLabel(step)}`;
};


export const nodeAgentLabel = (kind: string, roster: readonly string[]): string =>
  kind === "plan" || kind === "implement" ? roster.join(", ") : (slotAgent(kind) ?? "");
