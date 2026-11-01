import { limitsFor } from "../plans/entitlement.mjs";

export const NODE_KINDS = ["propose", "discover-work", "assign-work", "plan", "verify", "implement", "impl-verify", "qa", "accept", "doc-audit", "scout"];
export const REQUIRED_NODES = ["plan", "implement", "accept"];
export const TAIL_NODES = ["doc-audit", "scout"];
export const NODE_AGENT = { propose: "pm", "discover-work": "work-discoverer", "assign-work": "work-assigner", verify: "plan-verifier", "impl-verify": "impl-verifier", qa: "qa-verifier", "doc-audit": "doc-auditor", scout: "feature-scout" };
export const SLOT_FORMAT = "slots-v1";
export const PROJECT_AGENTS = ["doc-auditor", "feature-scout", "work-discoverer"];
export const DEFAULT_SELECTION_POLICY = "Choose the oldest eligible backlog item with supporting Source evidence and a matching workspace. Break ties by item key. Do not invent urgency, impact, dependencies, or missing evidence. Request clarification when evidence or ownership is unclear.";
export function workPrefix(graph) {
  const at = graph.nodes.indexOf("assign-work");
  const itemAt = graph.nodes.findIndex(node => !PROJECT_AGENTS.includes(slotAgent(node)));
  const nodes = at >= 0 ? graph.nodes.slice(0, at + 1) : graph.nodes.slice(0, itemAt < 0 ? graph.nodes.length : itemAt);
  return { nodes, gates: graph.gates.filter(gate => nodes.includes(gateKind(gate))) };
}
export function itemGraph(graph) {
  const at = graph.nodes.indexOf("assign-work");
  const nodes = at < 0 ? [...graph.nodes] : graph.nodes.slice(at + 1);
  return { nodes, gates: graph.gates.filter(gate => nodes.includes(gateKind(gate))) };
}
export const AUTO_SCOUT_DISABLED_REASON = "Automatic scouting is off. Add a backlog item, or turn it on in the Pipeline tab.";
export function slotAgent(slot) {
  if (typeof slot !== "string") return null;
  if (Object.hasOwn(NODE_AGENT, slot)) return NODE_AGENT[slot];
  const match = /^(doc-auditor|feature-scout|work-discoverer|discover-work)(?:#([2-9]|[1-9][0-9]+))?$/.exec(slot);
  return match ? match[1] === "discover-work" ? "work-discoverer" : match[1] : null;
}
export const dispatcherFor = (node, itemAgent) =>
  node === "plan" || node === "implement" ? itemAgent : slotAgent(node);
export const isItemNode = (node) => ["plan", "implement", "verify", "impl-verify", "qa"].includes(node);
export const GATE_PREFIX = "before-";
export const gateId = (kind) => `${GATE_PREFIX}${kind}`;
export const isGateId = (id) => typeof id === "string" && id.startsWith(GATE_PREFIX);
export const gateKind = (id) => (isGateId(id) ? id.slice(GATE_PREFIX.length) : null);
export const BOUNDARY = {
  [gateId("plan")]: { from: "proposed", to: "planning" },
  [gateId("implement")]: { from: "in_review", to: "implementing" },
};
export const boundaryOf = (id) => BOUNDARY[id] ?? null;
export const DEFAULT_GATES = [gateId("plan"), gateId("implement")];

export function nodeAllowed(plan, kind) {
  const agent = slotAgent(kind);
  return agent === null || limitsFor(plan).agents.includes(agent);
}
export const OPT_IN_NODES = ["scout", "impl-verify", "qa"];
export const STEP_KINDS = NODE_KINDS.filter((k) => !["propose", "scout"].includes(k));
export function defaultGraph(plan) {
  return { nodes: STEP_KINDS.filter((k) => nodeAllowed(plan, k) && !OPT_IN_NODES.includes(k)), gates: [...DEFAULT_GATES] };
}
export function allowsPipelineEdit(plan) { return limitsFor(plan).pipelineEdit; }

export const PROPOSE_SETTING_REASON = "Use Assign work instead of the legacy Propose node.";

const ORDER = [
  ["plan", "implement", "anchors must keep the order plan · implement · accept"],
  ["implement", "accept", "anchors must keep the order plan · implement · accept"],
  ["plan", "verify", "verify must be between plan and implement"],
  ["verify", "implement", "verify must be between plan and implement"],
  ["implement", "impl-verify", "impl-verify must be between implement and accept"],
  ["impl-verify", "accept", "impl-verify must be between implement and accept"],
  ["implement", "qa", "qa must be between implement and accept"],
  ["qa", "accept", "qa must be between implement and accept"],
  ["impl-verify", "qa", "impl-verify must come before qa"],
];
const RANK = ["plan", "verify", "implement", "impl-verify", "qa", "accept"];
function orderReason(nodes) {
  const assign = nodes.indexOf("assign-work");
  if (assign >= 0 && nodes.slice(0, assign).some(node => isItemNode(node) || node === "accept")) return "Assign work must come before steps that need an assigned item.";
  for (const [first, then, reason] of ORDER) {
    const a = nodes.indexOf(first), b = nodes.indexOf(then);
    if (a >= 0 && b >= 0 && a > b) return reason;
  }
  const ranked = nodes.filter((id) => RANK.includes(id));
  for (let i = 1; i < ranked.length; i++) {
    if (RANK.indexOf(ranked[i - 1]) > RANK.indexOf(ranked[i])) return `${ranked[i]} must come before ${ranked[i - 1]}`;
  }
  return null;
}
function aliasReason(nodes) {
  for (const [alias, agent] of [["doc-audit", "doc-auditor"], ["scout", "feature-scout"]]) {
    const slots = nodes.filter((id) => slotAgent(id) === agent);
    if (slots.includes(alias) && slots.length > 1) return `don't mix ${alias} with ${agent} slots`;
  }
  return null;
}
function gateReason(steps, gates) {
  if (new Set(gates).size !== gates.length) return "a gate appears twice";
  for (const g of gates) {
    const k = gateKind(g);
    if (k === null || !steps.includes(k)) return `gate ${g} has no node after it`;
  }
  return null;
}

export function validateGraph(graph, plan) {
  const { nodes, gates } = graph ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(gates)) return { ok: false, reason: "graph must have nodes and gates" };
  if (![...nodes, ...gates].every((id) => typeof id === "string")) return { ok: false, reason: "slot and gate ids must be strings" };
  if (new Set(nodes).size !== nodes.length) return { ok: false, reason: "a node appears twice" };
  for (const k of nodes) {
    if (k === "propose") return { ok: false, reason: PROPOSE_SETTING_REASON };
    if (!NODE_KINDS.includes(k) && !PROJECT_AGENTS.includes(slotAgent(k))) return { ok: false, reason: `unknown node: ${k}` };
  }
  for (const k of REQUIRED_NODES) if (!nodes.includes(k)) return { ok: false, reason: `${k} can't be removed` };
  for (const k of nodes) if (!nodeAllowed(plan, k)) return { ok: false, reason: `${k} is not on the ${plan} plan` };
  const reason = orderReason(nodes) ?? aliasReason(nodes) ?? gateReason(nodes, gates);
  return reason === null ? { ok: true } : { ok: false, reason };
}

export function sequence(graph) {
  return graph.nodes.flatMap((k) => (graph.gates.includes(gateId(k)) ? [gateId(k), k] : [k]));
}
export function nextAfter(graph, id) {
  const seq = sequence(graph), i = seq.indexOf(id);
  return i < 0 || i === seq.length - 1 ? null : seq[i + 1];
}
export function cursorForStatus(graph, status) {
  const at = (kind) => (graph.gates.includes(gateId(kind)) ? gateId(kind) : kind);
  switch (status) {
    case "proposed": return at("plan");
    case "planning": return "plan";
    case "in_review": return graph.nodes.includes("verify") ? "verify" : at("implement");
    case "implementing": return "implement";
    case "done": return graph.nodes.includes("impl-verify") ? at("impl-verify") : graph.nodes.includes("qa") ? at("qa") : "accept";
    default: return null;
  }
}
export function nodeDone(kind, facts) {
  if (facts.format === SLOT_FORMAT) {
    if (kind === "implement") return facts.implementationComplete === true;
    if (PROJECT_AGENTS.includes(slotAgent(kind))) return facts.slotComplete === true;
  }
  switch (kind) {
    case "impl-verify": return facts.implVerifyComplete === true;
    case "qa": return facts.qaComplete === true;
    case "propose": return true;
    case "plan": return ["in_review", "implementing", "done"].includes(facts.status);
    case "verify": return typeof facts.validation === "string";
    case "implement": return facts.status === "done" || facts.implementationComplete === true;
    case "accept": return facts.accepted;
    default: return facts.closedAgents.includes(slotAgent(kind));
  }
}
export function advance(graph, cursor, facts) {
  let at = cursor, status = facts.status;
  const entered = [], transitions = [];
  for (;;) {
    if (at === null) return { cursor: null, entered, transitions };
    if (isGateId(at)) {
      if (!facts.approvedGates.includes(at)) return { cursor: at, entered, transitions };
    } else {
      const b = boundaryOf(gateId(at));
      if (b !== null && status === b.from && !graph.gates.includes(gateId(at))) { transitions.push(b); status = b.to; }
      if (!nodeDone(at, { ...facts, status })) return { cursor: at, entered, transitions };
    }
    const next = nextAfter(graph, at);
    if (next !== null) entered.push(next);
    if (facts.format === SLOT_FORMAT) {
      const boundary = boundaryOf(gateId(next));
      if (boundary && status === boundary.from && !graph.gates.includes(gateId(next))) transitions.push(boundary);
      if ((next === null || ["impl-verify", gateId("impl-verify"), "accept", gateId("accept"), "qa", gateId("qa")].includes(next)) && status === "implementing" && graph.nodes.includes("implement")) {
        transitions.push({ from: "implementing", to: "done" });
      }
      return { cursor: next, entered, transitions };
    }
    if ((next === "accept" || next === gateId("accept")) && status === "implementing" && facts.implementationComplete) {
      transitions.push({ from: "implementing", to: "done" });
      status = "done";
    }
    at = next;
  }
}

export const REF_PREFIX = "pipeline:";
export const isRef = (step) => typeof step === "string" && step.startsWith(REF_PREFIX);
export const refId = (step) => (isRef(step) ? step.slice(REF_PREFIX.length) : null);
export const refStep = (pipelineId) => `${REF_PREFIX}${pipelineId}`;

export function validateDefinition(definition, plan) {
  const { steps, gates } = definition ?? {};
  if (!Array.isArray(steps) || !Array.isArray(gates)) return { ok: false, reason: "pipeline must have steps and gates" };
  if (![...steps, ...gates].every((id) => typeof id === "string")) return { ok: false, reason: "step and gate ids must be strings" };
  if (steps.length === 0) return { ok: false, reason: "a pipeline needs at least one step" };
  if (definition.selectionPolicy !== undefined && (typeof definition.selectionPolicy !== "string" || !definition.selectionPolicy.trim() || definition.selectionPolicy.length > 3000)) return { ok: false, reason: "Selection policy must contain 1 to 3000 characters." };
  if (new Set(steps).size !== steps.length) return { ok: false, reason: "a step appears twice" };
  for (const s of steps) {
    if (isRef(s)) {
      if (refId(s) === "") return { ok: false, reason: `unknown step: ${s}` };
      continue;
    }
    if (s === "propose") return { ok: false, reason: PROPOSE_SETTING_REASON };
    if (!NODE_KINDS.includes(s) && !PROJECT_AGENTS.includes(slotAgent(s))) return { ok: false, reason: `unknown node: ${s}` };
    if (!nodeAllowed(plan, s)) return { ok: false, reason: `${s} is not on the ${plan} plan` };
  }
  const own = steps.filter((s) => !isRef(s));
  const reason = orderReason(own) ?? aliasReason(own) ?? gateReason(steps, gates);
  return reason === null ? { ok: true } : { ok: false, reason };
}

export function expand(pipelineId, definitions, path = []) {
  const fail = (id, reason) => ({ ok: false, pipelineId: id, reason });
  const missing = "it uses a pipeline that is archived or missing";
  const loop = "pipelines can't use each other in a loop";
  if (!Object.hasOwn(definitions, pipelineId)) return fail(pipelineId, missing);
  const active = new Set(path);
  if (active.has(pipelineId)) return fail(pipelineId, loop);
  const frameOf = (id, junction) => ({ id, junction, index: 0, nodes: [], gates: new Set(), seen: new Set() });
  const stack = [frameOf(pipelineId, false)];
  active.add(pipelineId);
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const definition = definitions[frame.id];
    if (frame.index === definition.steps.length) {
      stack.pop();
      active.delete(frame.id);
      const graph = { nodes: frame.nodes, gates: [...frame.gates] };
      if (stack.length === 0) {
        const policy = frame.policy ?? definitions[pipelineId].selectionPolicy;
        return { ok: true, graph: policy ? { ...graph, selectionPolicy: policy } : graph };
      }
      const parent = stack[stack.length - 1];
      if (frame.policy) parent.policy = frame.policy;
      if (frame.junction) parent.gates.add(gateId(frame.nodes[0]));
      for (const node of frame.nodes) {
        if (parent.seen.has(node)) return fail(parent.id, "a node appears twice");
        parent.seen.add(node);
        parent.nodes.push(node);
      }
      for (const gate of frame.gates) parent.gates.add(gate);
      continue;
    }
    const step = definition.steps[frame.index++];
    const gated = definition.gates.includes(gateId(step));
    if (!isRef(step)) {
      if (step === "assign-work") frame.policy = definition.selectionPolicy ?? DEFAULT_SELECTION_POLICY;
      if (frame.seen.has(step)) return fail(frame.id, "a node appears twice");
      frame.seen.add(step);
      if (gated) frame.gates.add(gateId(step));
      frame.nodes.push(step);
      continue;
    }
    const id = refId(step);
    if (!Object.hasOwn(definitions, id)) return fail(frame.id, missing);
    if (active.has(id)) return fail(frame.id, loop);
    active.add(id);
    stack.push(frameOf(id, gated));
  }
  return fail(pipelineId, missing);
}

export function composedReason(graph) {
  if (new Set(graph.nodes).size !== graph.nodes.length) return "a node appears twice";
  return orderReason(graph.nodes) ?? aliasReason(graph.nodes);
}

export function usersOf(pipelineId, definitions) {
  const found = new Set(), queue = [pipelineId];
  while (queue.length > 0) {
    const target = refStep(queue.shift());
    for (const [id, definition] of Object.entries(definitions)) {
      if (id !== pipelineId && !found.has(id) && definition.steps.includes(target)) { found.add(id); queue.push(id); }
    }
  }
  return [...found];
}

export function recompose(changedId, definitions, mustRun, plan) {
  const runnable = Object.create(null);
  for (const id of [changedId, ...usersOf(changedId, definitions)]) {
    const expanded = expand(id, definitions);
    if (!expanded.ok) return expanded;
    const structural = composedReason(expanded.graph);
    if (structural !== null) return { ok: false, pipelineId: id, reason: structural };
    const full = validateGraph(expanded.graph, plan);
    if (!full.ok && mustRun.includes(id)) return { ok: false, pipelineId: id, reason: full.reason };
    runnable[id] = full.ok ? expanded.graph : null;
  }
  return { ok: true, runnable };
}

export function routePipeline(type, rules, defaultPipelineId) {
  return type !== null && Object.hasOwn(rules, type) ? rules[type] : defaultPipelineId;
}

export const AUTO_PROPOSE_DISABLED_REASON = "Automatic picking is off. Put an item on the board from the Backlog tab, or turn it on in the Pipeline tab.";

export const PIPELINE_EDIT_PLAN_GATE = "Pipeline editing opens on Pro. The default pipeline stays as is.";
