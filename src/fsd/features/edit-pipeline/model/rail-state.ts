import { NODE_KINDS, gateId, validateGraph } from "@harness/core/pipeline.mjs";
export type Graph = { nodes: string[]; gates: string[] };
export type Step = { ok: true; graph: Graph } | { ok: false; reason: string };
const check = (graph: Graph, plan: string): Step => { const v = validateGraph(graph, plan) as { ok: boolean; reason?: string }; return v.ok ? { ok: true, graph } : { ok: false, reason: v.reason ?? "invalid" }; };
export const insertGate = (g: Graph, id: string, plan: string) => check({ ...g, gates: [...g.gates, id] }, plan);
export const removeGate = (g: Graph, id: string, plan: string) => check({ ...g, gates: g.gates.filter((x) => x !== id) }, plan);
export const removeNode = (g: Graph, kind: string, plan: string) => check({ nodes: g.nodes.filter((x) => x !== kind), gates: g.gates.filter((x) => x !== gateId(kind)) }, plan);
export const addNode = (g: Graph, kind: string, plan: string) => check({ ...g, nodes: NODE_KINDS.filter((k) => g.nodes.includes(k) || k === kind) }, plan);
export const swapTail = (g: Graph, plan: string) => check({ ...g, nodes: [...g.nodes.filter((k) => k !== "doc-audit" && k !== "scout"), ...g.nodes.filter((k) => k === "doc-audit" || k === "scout").reverse()] }, plan);
