// 순수. import 없음. 플랜과 상한 — "이 사용자가 얼마나 쓸 수 있나"의 단일 출처.
// 서버 액션(프로젝트 생성·백로그 추가)·MCP(project_sync·agent_next)·템플릿 배포가 이 표로 판정하고,
// /billing 화면이 이 표를 그린다. 여기 없는 축에는 상한이 없다. 플랜은 사용자에 붙고 프로젝트는 소유자의 플랜을 따른다.
export const PLANS = ["free", "pro", "max"];
export const DEFAULT_PLAN = "free"; // Subscription 행이 없는 사용자
export const UNLIMITED = Infinity;
// 고정 4역. 워크스페이스 dev는 roster(Workspace.agent[])가 정하고, 그 수는 `workspaces` 축이 막는다.
export const REPORT_AGENTS = ["pm", "plan-verifier", "doc-auditor", "feature-scout"];

export const LIMITS = {
  free: { projects: 1, workspaces: 1, backlog: 10, historyDays: 30, agents: ["pm", "feature-scout"] },
  pro: { projects: 5, workspaces: 10, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS },
  max: { projects: UNLIMITED, workspaces: UNLIMITED, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS },
};
export const AXES = ["projects", "workspaces", "backlog"];

export function isPlan(x) { return PLANS.includes(x); }
export function limitsFor(plan) {
  if (!isPlan(plan)) throw new Error(`unknown plan: ${plan}`);
  return LIMITS[plan];
}

// count개가 상한 안인가. 추가 전 검사는 (현재 수 + 1)을 넘긴다; project_sync처럼 "N개로 맞춘다"는 N을 넘긴다.
export function withinLimit(plan, axis, count) {
  if (!AXES.includes(axis)) throw new Error(`unknown axis: ${axis}`);
  return count <= limitsFor(plan)[axis];
}

// 상한 문구의 단일 출처 — 프로젝트 잠금 사유, project_sync 거부, 생성기 중단, 백로그 추가 거부가 같은 문장으로 시작한다.
// 뒤에 붙는 설명("; this project is locked")은 부르는 쪽이 단다.
const AXIS_NOUN = { projects: "project", workspaces: "workspace", backlog: "backlog" };
export function capReason(plan, axis) {
  if (!AXES.includes(axis)) throw new Error(`unknown axis: ${axis}`);
  return `${AXIS_NOUN[axis]} cap reached on the ${plan} plan (${limitsFor(plan)[axis]})`;
}

// 추가 전 검사 한 줄. 상한 안이면 null, 넘으면 사용자에게 그대로 보일 문장 — 문구는 capReason 하나에서 나온다.
// currentCount는 **지금 있는 수**다(추가하려는 1은 여기서 더한다). project_sync처럼 "N개로 맞춘다"는 withinLimit을 직접 쓴다.
export function capError(plan, axis, currentCount) {
  return withinLimit(plan, axis, currentCount + 1) ? null : `${capReason(plan, axis)}. Upgrade the plan to add more.`;
}

// 상한을 넘는 프로젝트는 잠긴다 — 활성은 createdAt 오름차순 앞 N개(동률은 id). 행은 지우지 않는다.
export function activeProjectIds(projects, plan) {
  const n = limitsFor(plan).projects;
  const sorted = [...projects].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(sorted.slice(0, n).map((p) => p.id));
}

// roster는 wsId 순으로 정렬된 Workspace.agent[]. 플랜을 내린 뒤 남은 초과 워크스페이스는 뒤에서부터 닫힌다.
export function allowsAgent(plan, agent, roster) {
  const limits = limitsFor(plan);
  return limits.agents.includes(agent) || roster.slice(0, limits.workspaces).includes(agent);
}

// 조회 창의 시작. null이면 창이 없다(전체). 저장은 언제나 전부 한다.
export function historyCutoff(plan, now) {
  const days = limitsFor(plan).historyDays;
  return days === null ? null : new Date(now.getTime() - days * 86_400_000);
}
