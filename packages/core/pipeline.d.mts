// pipeline.mjs의 손으로 쓴 형. TypeScript는 `.mjs` import에 대해 `.d.mts`를 찾는다(`.d.ts`는 조용히 무시한다).
// 이 파일이 있으면 그 모듈의 형은 여기서만 정해진다 — pipeline.mjs에 export를 더하거나 모양을 바꾸면 여기도 고친다.
// 빠진 이름은 tsc가 "has no exported member"로, 틀린 모양은 호출부의 형 오류로 잡는다.
// scripts/plugin-lib.mjs는 `.mjs`로 끝나는 파일만 미러하므로 이 파일은 plugin/lib에 실리지 않는다.

export type Graph = { nodes: string[]; gates: string[] };
export type GraphInput = { readonly nodes: readonly string[]; readonly gates: readonly string[] };
export type Boundary = { from: string; to: string };
export type GraphValidation = { ok: true } | { ok: false; reason: string };

// 노드 하나가 끝났는가를 판정하는 증거(nodeDone). advance는 여기에 승인된 게이트를 더해 받는다.
export type NodeFacts = {
  status: string;
  validation: unknown;
  accepted: boolean;
  closedAgents: readonly string[];
  format?: string | null;
  slotComplete?: boolean;
  implementationComplete?: boolean;
};
export type AdvanceFacts = NodeFacts & { approvedGates: readonly string[] };
export type Advance = { cursor: string | null; entered: string[]; transitions: Boundary[] };

export const NODE_KINDS: string[];
export const REQUIRED_NODES: string[];
export const TAIL_NODES: string[];
export const NODE_AGENT: Readonly<Record<string, string>>;
export const SLOT_FORMAT: "slots-v1";
export const PROJECT_AGENTS: string[];
export function slotAgent(slot: unknown): string | null;
export function dispatcherFor(node: string | null, itemAgent: string): string | null;
export const GATE_PREFIX: "before-";
export function gateId(kind: string): string;
export function isGateId(id: unknown): id is string;
export function gateKind(id: unknown): string | null;
export const BOUNDARY: Readonly<Record<string, Boundary | undefined>>;
export function boundaryOf(id: string): Boundary | null;
export const DEFAULT_GATES: string[];
export function nodeAllowed(plan: string, kind: string): boolean;
export const OPT_IN_NODES: string[];
export function defaultGraph(plan: string): Graph;
export function allowsPipelineEdit(plan: string): boolean;
export function validateGraph(graph: unknown, plan: string): GraphValidation;
export function sequence(graph: GraphInput): string[];
export function nextAfter(graph: GraphInput, id: string): string | null;
export function cursorForStatus(graph: GraphInput, status: string): string | null;
export function nodeDone(kind: string, facts: NodeFacts): boolean;
export function advance(graph: GraphInput, cursor: string | null, facts: AdvanceFacts): Advance;
