// packages/core/pipeline.mjs — 순수. import는 entitlement.mjs뿐.
// 파이프라인 그래프 — "이 프로젝트에서 항목이 어느 노드를 어떤 순서로 지나고, 어디서 사람이 멈추는가"의 단일 출처.
// 서버(run.ts)가 커서를 옮길 때, 웹(edit-pipeline)이 레일을 그릴 때, 저장 액션이 검증할 때 같은 함수를 쓴다.
import { limitsFor } from "./entitlement.mjs";

// 비게이트 노드 7종, 골격 순서. 게이트는 노드가 아니라 간선(before-<kind>)이다.
export const NODE_KINDS = ["propose", "plan", "verify", "implement", "accept", "doc-audit", "scout"];
export const REQUIRED_NODES = ["plan", "implement", "accept"]; // 못 뺀다 — accept는 증거 규칙이지 게이트가 아니다
export const TAIL_NODES = ["doc-audit", "scout"];               // accept 뒤. 서로 순서를 바꿀 수 있다
// 노드가 디스패치하는 에이전트. plan·implement는 항목의 dev(BoardItem.agent), accept는 main-loop 본인(디스패치 아님).
export const NODE_AGENT = { propose: "pm", verify: "plan-verifier", "doc-audit": "doc-auditor", scout: "feature-scout" };
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
  const agent = NODE_AGENT[kind];
  return agent === undefined || limitsFor(plan).agents.includes(agent);
}
// harness.json에 달린 노드 — 서버가 설정을 모르므로 기본 그래프에 넣지 않는다(Pipeline 탭에서 넣는다). 지금은 scout 하나.
export const OPT_IN_NODES = ["scout"];
// 기본 그래프 = 골격에서 플랜 밖 노드와 opt-in 노드를 뺀 것 + 게이트 둘. Free: propose·plan·implement·accept (verify·doc-audit 없음).
export function defaultGraph(plan) {
  return { nodes: NODE_KINDS.filter((k) => nodeAllowed(plan, k) && !OPT_IN_NODES.includes(k)), gates: [...DEFAULT_GATES] };
}
export function allowsPipelineEdit(plan) { return limitsFor(plan).pipelineEdit; }

// 저장 전 검증. 사유는 화면에 그대로 보인다(product-copy.md §12).
export function validateGraph(graph, plan) {
  const { nodes, gates } = graph ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(gates)) return { ok: false, reason: "graph must have nodes and gates" };
  if (new Set(nodes).size !== nodes.length) return { ok: false, reason: "a node appears twice" };
  for (const k of nodes) if (!NODE_KINDS.includes(k)) return { ok: false, reason: `unknown node: ${k}` };
  for (const k of REQUIRED_NODES) if (!nodes.includes(k)) return { ok: false, reason: `${k} can't be removed` };
  for (const k of nodes) if (!nodeAllowed(plan, k)) return { ok: false, reason: `${k} is not on the ${plan} plan` };
  // 순서: accept까지는 골격의 부분열, 그 뒤는 꼬리 노드만(순서 자유).
  const acceptAt = nodes.indexOf("accept");
  const head = nodes.slice(0, acceptAt + 1), tail = nodes.slice(acceptAt + 1);
  const headOrder = head.map((k) => NODE_KINDS.indexOf(k));
  if (headOrder.some((n, i) => i > 0 && n <= headOrder[i - 1])) return { ok: false, reason: "nodes before accept must keep the order propose · plan · verify · implement · accept" };
  if (tail.some((k) => !TAIL_NODES.includes(k))) return { ok: false, reason: "only doc-audit and scout may follow accept" };
  if (new Set(gates).size !== gates.length) return { ok: false, reason: "a gate appears twice" };
  for (const g of gates) {
    const k = gateKind(g);
    if (k === null || k === "propose" || !nodes.includes(k)) return { ok: false, reason: `gate ${g} has no node after it` };
  }
  return { ok: true };
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
    case "done": return "accept";
    default: return null;
  }
}
// 노드 하나가 끝났는가 — 증거로만 판정한다(에이전트의 말이 아니라 원장·보드).
//   propose: 행이 있다(런이 있다는 뜻) · plan: 계획서가 제출돼 in_review 이후다 · verify: 검증 기록 · implement: done
//   accept: acceptedAt · doc-audit/scout: 커서가 들어온 뒤 그 에이전트의 run이 닫혔다
export function nodeDone(kind, facts) {
  switch (kind) {
    case "propose": return true;
    case "plan": return ["in_review", "implementing", "done"].includes(facts.status);
    case "verify": return facts.validation !== null;
    case "implement": return facts.status === "done";
    case "accept": return facts.accepted;
    case "doc-audit": return facts.closedAgents.includes("doc-auditor");
    case "scout": return facts.closedAgents.includes("feature-scout");
    default: return false;
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
    at = next;
  }
}
