import { expand, refId, type DefinitionInput, type Definitions } from "@harness/core/pipeline/pipeline.mjs";

export type InsertionConflicts = {
  nodes: string[];
  stepIds: string[];
};

export function findInsertionConflicts(
  definition: DefinitionInput,
  pipelineId: string,
  definitions: Definitions,
): InsertionConflicts | null {
  const incoming = expand(pipelineId, definitions);
  if (!incoming.ok) return null;

  const incomingNodes = new Set(incoming.graph.nodes);
  const nodes = new Set<string>();
  const stepIds: string[] = [];

  for (const step of definition.steps) {
    const target = refId(step);
    const existing = target === null ? null : expand(target, definitions);
    const existingNodes = target === null ? [step] : existing?.ok ? existing.graph.nodes : [];
    const duplicates = existingNodes.filter(node => incomingNodes.has(node));
    if (duplicates.length === 0) continue;
    stepIds.push(step);
    for (const node of duplicates) nodes.add(node);
  }

  return nodes.size > 0 ? { nodes: [...nodes], stepIds } : null;
}
