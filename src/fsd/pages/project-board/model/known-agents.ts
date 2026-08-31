// 순수. 발화 주체의 정체성. ApcH pages/pipeline/model/known-agents.ts(de25a1c) 이식.
// 다른 점: roster(= Workspace.agent[])가 프로젝트마다 다르므로 고정 상수 ROSTER_AGENT_IDS를 인자로 바꿨다.
// 역할 라벨은 product-copy.md §6.

export type AgentIdentity = {
  id: string;
  handle: string; // 화면 이름(보드 agent 필드와 연결)
  role: string;
  emoji: string; // 초기 아바타(추후 일러스트 교체)
};

// 고정 4역만 남긴다 — 워크스페이스 dev는 프로젝트의 harness.json이 정한다.
const ROSTER: Record<string, AgentIdentity> = {
  pm: { id: "pm", handle: "pm", role: "Selection", emoji: "📋" },
  "plan-verifier": {
    id: "plan-verifier",
    handle: "plan-verifier",
    role: "Plan verification",
    emoji: "🔬",
  },
  "doc-auditor": {
    id: "doc-auditor",
    handle: "doc-auditor",
    role: "Doc audit",
    emoji: "🔍",
  },
  "feature-scout": {
    id: "feature-scout",
    handle: "feature-scout",
    role: "Feature scouting",
    emoji: "🧭",
  },
};

// pm이 먼저(선정), 그다음 워크스페이스 dev들이 harness.json 순서대로, 그다음 보고 전용 3역.
export function rosterOrder(roster: readonly string[]): string[] {
  return ["pm", ...roster, "plan-verifier", "doc-auditor", "feature-scout"];
}

export function identityFor(
  agentId: string | null,
  roster: readonly string[] = [],
): AgentIdentity {
  if (agentId !== null) {
    // ROSTER는 고정 4역만 담는다 — 워크스페이스 dev·미지 id는 여기 없어서 런타임에 undefined다.
    const known = ROSTER[agentId];
    if (known !== undefined) return known;
    // 워크스페이스 에이전트는 일반 개발 정체성을 받는다(고정 dev별 identity는 프로젝트마다 다르다).
    if (roster.includes(agentId)) {
      return { id: agentId, handle: agentId, role: "Development", emoji: "🛠️" };
    }
    return { id: agentId, handle: agentId, role: "Agent", emoji: "" };
  }
  return { id: "system", handle: "System", role: "Unassigned", emoji: "•" };
}

export function initialOf(identity: AgentIdentity): string {
  const ch = identity.handle.trim().charAt(0); // charAt은 없으면 "" 반환
  return ch === "" ? "?" : ch.toUpperCase();
}
