// 레일 조작의 순수 규칙. 조작마다 결과 그래프를 validateGraph에 통과시키고, 막히면 그 사유를 그대로 돌려준다 —
// 화면은 규칙을 다시 구현하지 않고 버튼을 비활성으로 두면서 서버와 같은 문장을 보여 준다(§E.6).
import { TAIL_NODES, PROJECT_AGENTS, slotAgent, gateKind, gateId, validateGraph } from "@harness/core/pipeline.mjs";

export type Graph = { nodes: string[]; gates: string[] };
export type Step = { ok: true; graph: Graph } | { ok: false; reason: string };

// 프로젝트 에이전트(doc-auditor·feature-scout)의 슬롯인가. slotAgent는 슬롯이 아니면 null이다.
export function isProjectSlot(id: string): boolean {
  const agent = slotAgent(id);
  return agent !== null && PROJECT_AGENTS.includes(agent);
}

export function normalizeSlots(graph: Graph): Graph {
  const normalize = (id: string) => {
    const agent = slotAgent(id);
    return agent !== null && PROJECT_AGENTS.includes(agent) && !id.includes("#") ? agent : id;
  };
  return { nodes: graph.nodes.map(normalize), gates: graph.gates.map((id) => gateId(normalize(gateKind(id) ?? id))) };
}

export function addSlot(graph: Graph, agent: string, before: string | null, plan: string): Step {
  if (!PROJECT_AGENTS.includes(agent)) return { ok: false, reason: "unknown project agent" };
  const g = normalizeSlots(graph);
  let id = agent, index = 2;
  while (g.nodes.includes(id)) id = `${agent}#${index++}`;
  const nodes = [...g.nodes];
  const destination = before === null ? null : normalizeSlots({ nodes: [before], gates: [] }).nodes[0];
  nodes.splice(destination === null ? nodes.length : nodes.indexOf(destination), 0, id);
  return check({ ...g, nodes }, plan);
}

export function moveSlot(graph: Graph, id: string, before: string | null, plan: string): Step {
  if (!isProjectSlot(id)) return { ok: false, reason: "only project slots can move" };
  if (id === before) return check(graph, plan);
  const nodes = graph.nodes.filter((node) => node !== id);
  if (before !== null && !nodes.includes(before)) return { ok: false, reason: "unknown destination" };
  nodes.splice(before === null ? nodes.length : nodes.indexOf(before), 0, id);
  return check({ ...graph, nodes }, plan);
}

const check = (graph: Graph, plan: string): Step => {
  const v = validateGraph(graph, plan);
  return v.ok ? { ok: true, graph } : { ok: false, reason: v.reason };
};

export const insertGate = (g: Graph, id: string, plan: string): Step => check({ ...g, gates: [...g.gates, id] }, plan);

export const removeGate = (g: Graph, id: string, plan: string): Step => check({ ...g, gates: g.gates.filter((x) => x !== id) }, plan);

// 노드를 빼면 그 앞 게이트도 함께 빠진다 — 남으면 뒤에 노드가 없어 저장이 막힌다.
export const removeNode = (g: Graph, kind: string, plan: string): Step =>
  check({ nodes: g.nodes.filter((x) => x !== kind), gates: g.gates.filter((x) => x !== gateId(kind)) }, plan);

// 뺐던 노드 되돌리기와 opt-in 노드 넣기가 같은 함수다.
export const addNode = (g: Graph, kind: string, plan: string): Step => {
  // 앞머리 노드는 골격 순서의 자리에 끼운다 — propose는 맨 앞, verify는 implement 바로 앞. 나머지 노드를 다시
  // 세우지는 않는다: 슬롯이 놓인 자리와 꼬리 순서를 그대로 둔다.
  if (!TAIL_NODES.includes(kind)) {
    const nodes = [...g.nodes];
    const at = kind === "propose" ? 0 : kind === "verify" ? nodes.indexOf("implement") : nodes.length;
    nodes.splice(at, 0, kind);
    return check({ ...g, nodes }, plan);
  }
  // 꼬리 노드(accept 뒤)는 끝에 붙인다. 꼬리는 사용자가 바꿔 둔 순서를 그대로 둔다 — 다시 세우면 swapTail이 조용히 풀린다.
  return check({ ...g, nodes: [...g.nodes, kind] }, plan);
};

// 꼬리 두 노드의 순서만 뒤집는다. 하나뿐이면 그래프는 그대로다.
export const swapTail = (g: Graph, plan: string): Step => {
  const isTail = (k: string) => TAIL_NODES.includes(k);
  return check({ ...g, nodes: [...g.nodes.filter((k) => !isTail(k)), ...g.nodes.filter(isTail).reverse()] }, plan);
};
