import { NODE_AGENT, NODE_KINDS, gateKind } from "@harness/core/pipeline.mjs";

const LABEL: Record<string, string> = { propose: "Propose", plan: "Plan", verify: "Verify", implement: "Implement", accept: "Accept", "doc-audit": "Doc audit", scout: "Scout" };
export const nodeLabel = (kind: string): string => LABEL[kind] ?? kind;
export const gateLabel = (id: string): string => `before ${nodeLabel(gateKind(id) ?? id)}`;

// 그 노드를 도는 에이전트. plan·implement는 항목의 dev(워크스페이스 roster), 그 밖은 노드가 고정으로 부르는 에이전트다.
// accept는 아무도 디스패치하지 않는다(main-loop 본인) — 빈 문자열을 돌려주고 부르는 쪽이 말을 고른다.
const AGENT = NODE_AGENT as Record<string, string | undefined>;
export const nodeAgentLabel = (kind: string, roster: readonly string[]): string =>
  kind === "plan" || kind === "implement" ? roster.join(", ") : (AGENT[kind] ?? "");

export const NODE_ORDER = NODE_KINDS;
