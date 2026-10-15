// 순수. import는 entitlement.mjs뿐.
// 파이프라인 그래프 — "이 프로젝트에서 항목이 어느 노드를 어떤 순서로 지나고, 어디서 사람이 멈추는가"의 단일 출처.
// 서버(board-query.ts·run-query.ts)가 커서를 옮기거나 세울 때, 웹(edit-pipeline)이 레일을 그릴 때, 저장 액션이 검증할 때 같은 함수를 쓴다.
import { limitsFor } from "./entitlement.mjs";

// 비게이트 노드 9종, 골격 순서. 게이트는 노드가 아니라 간선(before-<kind>)이다.
export const NODE_KINDS = ["propose", "plan", "verify", "implement", "impl-verify", "qa", "accept", "doc-audit", "scout"];
export const REQUIRED_NODES = ["plan", "implement", "accept"]; // 못 뺀다 — accept는 증거 규칙이지 게이트가 아니다
export const TAIL_NODES = ["doc-audit", "scout"];               // accept 뒤. 서로 순서를 바꿀 수 있다
// 노드가 디스패치하는 에이전트. plan·implement는 항목의 dev(BoardItem.agent), accept는 main-loop 본인(디스패치 아님).
export const NODE_AGENT = { propose: "pm", verify: "plan-verifier", "impl-verify": "impl-verifier", qa: "qa-verifier", "doc-audit": "doc-auditor", scout: "feature-scout" };
export const SLOT_FORMAT = "slots-v1";
export const PROJECT_AGENTS = ["doc-auditor", "feature-scout"];
export const AUTO_SCOUT_DISABLED_REASON = "Automatic scouting is off. Add a backlog item, or turn it on in the Pipeline tab.";
// Slot identity is deliberately separate from agent identity. Legacy aliases are
// accepted only without a suffix; anchors are never repeatable.
export function slotAgent(slot) {
  if (typeof slot !== "string") return null;
  if (Object.hasOwn(NODE_AGENT, slot)) return NODE_AGENT[slot];
  const match = /^(doc-auditor|feature-scout)(?:#([2-9]|[1-9][0-9]+))?$/.exec(slot);
  return match ? match[1] : null;
}
// 그 노드를 실제로 도는 에이전트. plan·implement는 항목의 dev고 그 밖은 고정이다. accept는 디스패치가 없어 null.
// "지금 이 일을 하는 run이 열려 있나"를 묻는 화면이 이걸 쓴다 — 항목에 아무 run이나 열려 있는 것과 다르다.
export const dispatcherFor = (node, itemAgent) =>
  node === "plan" || node === "implement" ? itemAgent : slotAgent(node);
export const isItemNode = (node) => ["plan", "implement", "verify", "impl-verify", "qa"].includes(node);
export const GATE_PREFIX = "before-";
export const gateId = (kind) => `${GATE_PREFIX}${kind}`;
export const isGateId = (id) => typeof id === "string" && id.startsWith(GATE_PREFIX);
export const gateKind = (id) => (isGateId(id) ? id.slice(GATE_PREFIX.length) : null);
// 상태 경계가 있는 게이트 둘. 승인이 전이까지 한다. 없으면 같은 상태의 이벤트만 남는다.
export const BOUNDARY = {
  [gateId("plan")]: { from: "proposed", to: "planning" },
  [gateId("implement")]: { from: "in_review", to: "implementing" },
};
export const boundaryOf = (id) => BOUNDARY[id] ?? null;
export const DEFAULT_GATES = [gateId("plan"), gateId("implement")]; // 지금의 게이트①·②

// 이 플랜에서 쓸 수 있는 노드인가 — 노드의 에이전트가 플랜의 보고 에이전트 집합에 있어야 한다. 에이전트 없는 노드는 언제나.
export function nodeAllowed(plan, kind) {
  const agent = slotAgent(kind);
  return agent === null || limitsFor(plan).agents.includes(agent);
}
// 선택 노드 — 기본 그래프에 넣지 않는다(Pipeline 탭에서 넣는다). scout·qa는 서버가 모르는 harness.json 설정에 달렸고, impl-verify는 항목마다 검증 비용을 더한다.
export const OPT_IN_NODES = ["scout", "impl-verify", "qa"];
// 정의에 넣을 수 있는 노드 = 골격에서 propose를 뺀 것. propose는 옛 판을 읽으려고 NODE_KINDS에 남고, 지금은 프로젝트 설정(autoProposeEnabled)이다.
export const STEP_KINDS = NODE_KINDS.filter((k) => k !== "propose");
// 기본 그래프 = 정의 노드에서 플랜 밖 노드와 opt-in 노드를 뺀 것 + 게이트 둘. Free: plan·implement·accept (verify·doc-audit 없음).
export function defaultGraph(plan) {
  return { nodes: STEP_KINDS.filter((k) => nodeAllowed(plan, k) && !OPT_IN_NODES.includes(k)), gates: [...DEFAULT_GATES] };
}
export function allowsPipelineEdit(plan) { return limitsFor(plan).pipelineEdit; }

export const PROPOSE_SETTING_REASON = "propose is no longer a node — turn on Automatic picking in the Pipeline tab";

// 순서 규칙 — 두 노드가 다 있을 때만 본다. 표의 순서가 사유의 우선순위다(예전 validateGraph가 검사하던 순서).
// 앵커가 다 있는 그래프에서는 이 아홉 짝이 plan·verify·implement·impl-verify·qa·accept의 전순서를 이미 강제한다.
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
  for (const [first, then, reason] of ORDER) {
    const a = nodes.indexOf(first), b = nodes.indexOf(then);
    if (a >= 0 && b >= 0 && a > b) return reason;
  }
  // 조각에서만 걸리는 짝(예: [accept, plan]처럼 사이 노드가 없는 경우). 앵커가 다 있으면 위 아홉 짝이 먼저 같은 결론을 낸다.
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

// 항목에 붙일 수 있는 그래프인가 — 실행 판(펼친 결과)의 검증. 사유는 화면에 그대로 보인다(product-copy.md §12).
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

// 커서가 걷는 순서: 노드마다 그 앞 게이트(있으면) → 노드. 예: [propose, before-plan, plan, verify, before-implement, implement, accept, doc-audit, scout]
export function sequence(graph) {
  return graph.nodes.flatMap((k) => (graph.gates.includes(gateId(k)) ? [gateId(k), k] : [k]));
}
export function nextAfter(graph, id) {
  const seq = sequence(graph), i = seq.indexOf(id);
  return i < 0 || i === seq.length - 1 ? null : seq[i + 1];
}
// 사람이 상태를 되돌리거나 옮긴 뒤 커서가 서는 자리 — 상태가 말하는 노드(그 앞 게이트가 있으면 게이트).
// proposed는 plan 앞, in_review는 verify(없으면 implement 앞), on_hold는 부르지 않는다(커서는 그대로 잠든다).
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
// 노드 하나가 끝났는가 — 증거로만 판정한다(에이전트의 말이 아니라 원장·보드).
//   propose: 행이 있다(런이 있다는 뜻) · plan: 계획서가 제출돼 in_review 이후다 · verify: 검증 기록 · implement: done
//   accept: acceptedAt · doc-audit/scout: 커서가 들어온 뒤 그 에이전트의 run이 닫혔다
//   qa·impl-verify: 현재 entry에서 통과로 닫힌 검증 run과 그 보고
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
    case "verify": return facts.validation !== null;
    case "implement": return facts.status === "done" || facts.implementationComplete === true;
    case "accept": return facts.accepted;
    default: return facts.closedAgents.includes(slotAgent(kind));
  }
}
// 커서 전진의 순수 판정. cursor에서 시작해 끝난 노드·승인된 게이트를 넘고, 게이트 없는 경계는 자동 전이로 넘는다.
// 돌려주는 것: 새 커서(끝나면 null), 지나온 자리(게이트 포함 — enteredAt 갱신의 근거), 해야 할 자동 전이.
// 경계 검사는 **커서가 서 있는 노드**에서 한다 — "다음 노드로 넘어갈 때"가 아니라. 그래야 propose 없는 그래프의 첫 노드(plan)나
// 웹 "Put on the board"로 만들어져 plan에 선 런, cursorForStatus로 자리 잡은 런도 proposed에 갇히지 않는다.
export function advance(graph, cursor, facts) {
  let at = cursor, status = facts.status;
  const entered = [], transitions = [];
  for (;;) {
    if (at === null) return { cursor: null, entered, transitions };
    if (isGateId(at)) {
      if (!facts.approvedGates.includes(at)) return { cursor: at, entered, transitions };
    } else {
      // 이 노드 앞에 경계가 있는데 그래프에 게이트가 없으면 서버가 넘는다(actor pipeline). 게이트가 있으면 커서가 게이트에 섰을 것이다.
      const b = boundaryOf(gateId(at));
      if (b !== null && status === b.from && !graph.gates.includes(gateId(at))) { transitions.push(b); status = b.to; }
      if (!nodeDone(at, { ...facts, status })) return { cursor: at, entered, transitions };
    }
    const next = nextAfter(graph, at);
    if (next !== null) entered.push(next);
    // Facts belong to the entry we read. Never consume them for another slot.
    if (facts.format === SLOT_FORMAT) {
      const boundary = boundaryOf(gateId(next));
      if (boundary && status === boundary.from && !graph.gates.includes(gateId(next))) transitions.push(boundary);
      if (["impl-verify", gateId("impl-verify"), "accept", gateId("accept"), "qa", gateId("qa")].includes(next) && status === "implementing") {
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

// 연결 step. 정의의 steps에 노드 id 대신 pipeline:<id>로 들어가고, 그 앞 게이트는 before-pipeline:<id>다(gateId가 그대로 만든다).
export const REF_PREFIX = "pipeline:";
export const isRef = (step) => typeof step === "string" && step.startsWith(REF_PREFIX);
export const refId = (step) => (isRef(step) ? step.slice(REF_PREFIX.length) : null);
export const refStep = (pipelineId) => `${REF_PREFIX}${pipelineId}`;

// 정의 하나의 단독 검사(저장 시). 앵커가 다 있는지는 보지 않는다 — 그건 펼친 결과의 validateGraph다.
// 연결이 가리키는 파이프라인이 있는지·순환인지는 펼칠 때(expand) 본다.
export function validateDefinition(definition, plan) {
  const { steps, gates } = definition ?? {};
  if (!Array.isArray(steps) || !Array.isArray(gates)) return { ok: false, reason: "pipeline must have steps and gates" };
  if (![...steps, ...gates].every((id) => typeof id === "string")) return { ok: false, reason: "step and gate ids must be strings" };
  if (steps.length === 0) return { ok: false, reason: "a pipeline needs at least one step" };
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

// 연결을 반복 스택으로 펼친다. 유효한 중첩 깊이에 임의 상한을 두지 않는다.
// definitions는 단독 검사를 통과한 비보관 정의 묶음이다. 연결·중복은 여기서 검사한다.
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
      if (stack.length === 0) return { ok: true, graph };
      const parent = stack[stack.length - 1];
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

// 펼친 결과의 구조 검사 — 앵커가 다 있는지는 보지 않는다(항목에 붙일 수 있는지는 validateGraph).
export function composedReason(graph) {
  if (new Set(graph.nodes).size !== graph.nodes.length) return "a node appears twice";
  return orderReason(graph.nodes) ?? aliasReason(graph.nodes);
}

// 이 파이프라인을 직·간접으로 쓰는 파이프라인들(자기 자신 제외). 순환이 있어도 끝난다.
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

// 저장 판정. changedId의 정의를 바꾼 definitions에서, 그것과 그것을 쓰는 모든 파이프라인을 다시 펼친다.
// mustRun(실행 판이 있거나 기본·규칙 대상인 파이프라인)은 펼친 결과가 validateGraph를 통과해야 한다 — 붙을 수 있던 것은 계속 붙을 수 있어야 한다.
// runnable[id] = 항목에 붙일 수 있게 된 펼친 그래프(null = 조각).
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

// 새 항목이 붙을 파이프라인 — type 규칙이 있으면 그것, 없거나 type이 비었으면 기본(결정 6).
export function routePipeline(type, rules, defaultPipelineId) {
  return type !== null && Object.hasOwn(rules, type) ? rules[type] : defaultPipelineId;
}

export const AUTO_PROPOSE_DISABLED_REASON = "Automatic picking is off. Put an item on the board from the Backlog tab, or turn it on in the Pipeline tab.";

// Free에서 파이프라인 편집·설정과 Automatic picking 변경을 막는 문장. src/server는 FSD를 import하지 않으므로(fsd.md) 서비스·웹 action·레일이 함께 쓰도록 core가 소유한다.
export const PIPELINE_EDIT_PLAN_GATE = "Pipeline editing opens on Pro. The default pipeline stays as is.";
