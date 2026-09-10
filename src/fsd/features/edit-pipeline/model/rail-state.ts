// 레일 조작의 순수 규칙. 조작마다 결과 그래프를 validateGraph에 통과시키고, 막히면 그 사유를 그대로 돌려준다 —
// 화면은 규칙을 다시 구현하지 않고 버튼을 비활성으로 두면서 서버와 같은 문장을 보여 준다(§E.6).
import { NODE_KINDS, TAIL_NODES, gateId, validateGraph } from "@harness/core/pipeline.mjs";

export type Graph = { nodes: string[]; gates: string[] };
export type Step = { ok: true; graph: Graph } | { ok: false; reason: string };

const check = (graph: Graph, plan: string): Step => {
  const v = validateGraph(graph, plan) as { ok: boolean; reason?: string };
  return v.ok ? { ok: true, graph } : { ok: false, reason: v.reason ?? "invalid" };
};

export const insertGate = (g: Graph, id: string, plan: string): Step => check({ ...g, gates: [...g.gates, id] }, plan);

export const removeGate = (g: Graph, id: string, plan: string): Step => check({ ...g, gates: g.gates.filter((x) => x !== id) }, plan);

// 노드를 빼면 그 앞 게이트도 함께 빠진다 — 남으면 뒤에 노드가 없어 저장이 막힌다.
export const removeNode = (g: Graph, kind: string, plan: string): Step =>
  check({ nodes: g.nodes.filter((x) => x !== kind), gates: g.gates.filter((x) => x !== gateId(kind)) }, plan);

// 뺐던 노드 되돌리기와 opt-in 노드 넣기가 같은 함수다. 앞머리는 골격 순서로 다시 세우고,
// 꼬리(accept 뒤)는 사용자가 바꿔 둔 순서를 그대로 둔다 — 여기서 다시 세우면 swapTail이 조용히 풀린다.
export const addNode = (g: Graph, kind: string, plan: string): Step => {
  const acceptAt = g.nodes.indexOf("accept");
  const head = acceptAt === -1 ? g.nodes : g.nodes.slice(0, acceptAt + 1);
  const tail = acceptAt === -1 ? [] : g.nodes.slice(acceptAt + 1);
  const nodes = TAIL_NODES.includes(kind)
    ? [...head, ...tail, kind]
    : [...NODE_KINDS.filter((k: string) => (head.includes(k) || k === kind) && !TAIL_NODES.includes(k)), ...tail];
  return check({ ...g, nodes }, plan);
};

// 꼬리 두 노드의 순서만 뒤집는다. 하나뿐이면 그래프는 그대로다.
export const swapTail = (g: Graph, plan: string): Step => {
  const isTail = (k: string) => TAIL_NODES.includes(k);
  return check({ ...g, nodes: [...g.nodes.filter((k) => !isTail(k)), ...g.nodes.filter(isTail).reverse()] }, plan);
};
