import { TAIL_NODES, PROJECT_AGENTS, slotAgent, gateKind, gateId, validateDefinition, expand, recompose, refStep, refId, type Definition, type Definitions, type Recompose } from "@harness/core/pipeline/pipeline.mjs";

export type { Definition } from "@harness/core/pipeline/pipeline.mjs";
export type PipelineSnapshot = {
  id: string; name: string; isDefault: boolean; definition: Definition;
  saved: { version: number; createdAt: Date } | null;
  runnable: { nodes: string[]; gates: string[]; format: string | null } | null;
};
export type CompositionContext = { pipelineId: string; definitions: Definitions; mustRun: readonly string[] };
export type Step = { ok: true; definition: Definition } | { ok: false; reason: string };

export function isProjectSlot(id: string): boolean {
  const agent = slotAgent(id);
  return agent !== null && PROJECT_AGENTS.includes(agent);
}
export function normalizeSlots(definition: Definition): Definition {
  const normalize = (id: string): string => {
    const agent = slotAgent(id);
    return agent !== null && PROJECT_AGENTS.includes(agent) && !id.includes("#") ? agent : id;
  };
  return { steps: definition.steps.map(normalize), gates: definition.gates.map(id => gateId(normalize(gateKind(id) ?? id))) };
}
export function preview(definition: Definition, plan: string, context: CompositionContext): Recompose {
  const definitions = Object.assign(Object.create(null), context.definitions, { [context.pipelineId]: definition });
  return recompose(context.pipelineId, definitions, context.mustRun, plan);
}
export function check(definition: Definition, plan: string, context?: CompositionContext): Step {
  const valid = validateDefinition(definition, plan);
  if (!valid.ok) return valid;
  if (context) {
    const composed = preview(definition, plan, context);
    if (!composed.ok) return { ok: false, reason: composed.reason };
  }
  return { ok: true, definition };
}
export function hasUngatedRunnable(result: Recompose): boolean {
  return result.ok && Object.values(result.runnable).some(graph => graph !== null && graph.gates.length === 0);
}

export function addSlot(definition: Definition, agent: string, before: string | null, plan: string, context?: CompositionContext): Step {
  if (!PROJECT_AGENTS.includes(agent)) return { ok: false, reason: "unknown project agent" };
  const draft = normalizeSlots(definition);
  const reserved = new Set(draft.steps);
  if (context) for (const step of draft.steps) {
    const id = refId(step);
    if (id === null) continue;
    const expanded = expand(id, context.definitions);
    if (expanded.ok) for (const node of expanded.graph.nodes) reserved.add(node);
  }
  let id = agent, index = 2;
  while (reserved.has(id)) id = `${agent}#${index++}`;
  const destination = before === null ? null : normalizeSlots({ steps: [before], gates: [] }).steps[0];
  if (destination !== null && !draft.steps.includes(destination)) return { ok: false, reason: "unknown destination" };
  const steps = [...draft.steps];
  steps.splice(destination === null ? steps.length : steps.indexOf(destination), 0, id);
  return check({ ...draft, steps }, plan, context);
}
export function moveSlot(definition: Definition, id: string, before: string | null, plan: string, context?: CompositionContext): Step {
  if (!definition.steps.includes(id)) return { ok: false, reason: "unknown source" };
  if (before !== null && !definition.steps.includes(before)) return { ok: false, reason: "unknown destination" };
  if (!isProjectSlot(id)) return { ok: false, reason: "only project slots can move" };
  if (id === before) return check(definition, plan, context);
  const steps = definition.steps.filter(step => step !== id);
  steps.splice(before === null ? steps.length : steps.indexOf(before), 0, id);
  return check({ ...definition, steps }, plan, context);
}
export function insertRef(definition: Definition, pipelineId: string, before: string | null, plan: string, context?: CompositionContext): Step {
  if (before !== null && !definition.steps.includes(before)) return { ok: false, reason: "unknown destination" };
  const steps = [...definition.steps];
  steps.splice(before === null ? steps.length : steps.indexOf(before), 0, refStep(pipelineId));
  return check({ ...definition, steps }, plan, context);
}
export const insertGate = (definition: Definition, id: string, plan: string, context?: CompositionContext): Step => check({ ...definition, gates: [...definition.gates, id] }, plan, context);
export const removeGate = (definition: Definition, id: string, plan: string, context?: CompositionContext): Step => check({ ...definition, gates: definition.gates.filter(gate => gate !== id) }, plan, context);
export const removeNode = (definition: Definition, kind: string, plan: string, context?: CompositionContext): Step =>
  check({ steps: definition.steps.filter(step => step !== kind), gates: definition.gates.filter(gate => gate !== gateId(kind)) }, plan, context);
export function addNode(definition: Definition, kind: string, plan: string, context?: CompositionContext): Step {
  const steps = [...definition.steps];
  const anchor = kind === "verify" ? "implement" : kind === "impl-verify" ? (steps.includes("qa") ? "qa" : "accept") : kind === "qa" ? "accept" : null;
  const at = anchor === null ? -1 : steps.indexOf(anchor);
  steps.splice(at < 0 ? steps.length : at, 0, kind);
  return check({ ...definition, steps }, plan, context);
}
export const swapTail = (definition: Definition, plan: string, context?: CompositionContext): Step => {
  const isTail = (kind: string): boolean => TAIL_NODES.includes(kind);
  return check({ ...definition, steps: [...definition.steps.filter(kind => !isTail(kind)), ...definition.steps.filter(isTail).reverse()] }, plan, context);
};
