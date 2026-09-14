// 순수. import 없음. 플랜과 상한 — "이 사용자가 얼마나 쓸 수 있나"의 단일 출처.
// 서버 액션(프로젝트 생성·백로그 추가)·MCP(project_sync·agent_next)·템플릿 배포가 이 표로 판정하고,
// /billing 화면이 이 표를 그린다. 여기 없는 축에는 상한이 없다. 플랜은 사용자에 붙고 프로젝트는 소유자의 플랜을 따른다.
export const PLANS = ["free", "pro", "max"];
export const DEFAULT_PLAN = "free"; // Subscription 행이 없는 사용자
export const UNLIMITED = Infinity;
// 고정 4역. 워크스페이스 dev는 roster(Workspace.agent[])가 정하고, 그 수는 `workspaces` 축이 막는다.
export const REPORT_AGENTS = ["pm", "plan-verifier", "doc-auditor", "feature-scout"];

export const LIMITS = {
  free: { projects: 1, workspaces: 1, backlog: 10, historyDays: 30, agents: ["pm", "feature-scout"], sessionApprovals: false, pipelineEdit: false, dispatches: 60 },
  pro: { projects: 5, workspaces: 10, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS, sessionApprovals: true, pipelineEdit: true, dispatches: 600 },
  max: { projects: UNLIMITED, workspaces: UNLIMITED, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS, sessionApprovals: true, pipelineEdit: true, dispatches: UNLIMITED },
};
const AXES = ["projects", "workspaces", "backlog", "dispatches"];
// dispatches 축의 창. historyDays처럼 롤링 창이다 — 달력 경계가 없어 시간대 문제가 없고, 오래된 run이 빠지며 상한이 조금씩 풀린다.
export const DISPATCH_WINDOW_DAYS = 30;

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
const AXIS_NOUN = { projects: "project", workspaces: "workspace", backlog: "backlog", dispatches: "dispatch" };
export function capReason(plan, axis) {
  if (!AXES.includes(axis)) throw new Error(`unknown axis: ${axis}`);
  return `${AXIS_NOUN[axis]} cap reached on the ${plan} plan (${limitsFor(plan)[axis]})`;
}

// 추가 전 검사 한 줄. 상한 안이면 null, 넘으면 사용자에게 그대로 보일 문장 — 문구는 capReason 하나에서 나온다.
// currentCount는 **지금 있는 수**다(추가하려는 1은 여기서 더한다). project_sync처럼 "N개로 맞춘다"는 withinLimit을 직접 쓴다.
export function capError(plan, axis, currentCount) {
  return withinLimit(plan, axis, currentCount + 1) ? null : `${capReason(plan, axis)}. Upgrade the plan to add more.`;
}

// D2 이전 rollback 호환 정책. D3에서 제거한다.
export function activeProjectIds(projects, plan) {
  const n = limitsFor(plan).projects;
  const sorted = [...projects].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(sorted.slice(0, n).map((p) => p.id));
}

const timestamp = (value, field) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${field} must be a valid Date`);
  return value.getTime();
};

const nullableTimestamp = (value, field) => value === null ? null : timestamp(value, field);

const compareNullableDesc = (left, right) => {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
};

const compareId = (left, right) => left < right ? -1 : left > right ? 1 : 0;

/**
 * @typedef {object} AvailabilityCandidate
 * @property {string} id
 * @property {Date | null} lastSelectedAt
 * @property {Date | null} lastAgentActivityAt
 * @property {Date | null} lastSyncedAt
 * @property {Date} createdAt
 */

// D1의 준비 snapshot 정렬. 기존 activeProjectIds는 D2 cutover까지 runtime 판정으로 유지한다.
/**
 * @param {AvailabilityCandidate[]} candidates
 * @param {number} limit
 * @returns {Set<string>}
 */
export function availableProjectIds(candidates, limit) {
  if (!Array.isArray(candidates)) throw new Error("candidates must be an array");
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) {
    throw new Error("limit must be a non-negative safe integer or Infinity");
  }

  const ids = new Set();
  const normalized = candidates.map((candidate) => {
    if (candidate === null || typeof candidate !== "object") throw new Error("candidate must be an object");
    if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("candidate id must be a non-empty string");
    if (ids.has(candidate.id)) throw new Error(`duplicate candidate id: ${candidate.id}`);
    ids.add(candidate.id);

    return {
      id: candidate.id,
      lastSelectedAt: nullableTimestamp(candidate.lastSelectedAt, "lastSelectedAt"),
      lastAgentActivityAt: nullableTimestamp(candidate.lastAgentActivityAt, "lastAgentActivityAt"),
      lastSyncedAt: nullableTimestamp(candidate.lastSyncedAt, "lastSyncedAt"),
      createdAt: timestamp(candidate.createdAt, "createdAt"),
    };
  });

  if (limit === Infinity) return new Set(normalized.map((candidate) => candidate.id));

  const sorted = normalized.sort((left, right) =>
    compareNullableDesc(left.lastSelectedAt, right.lastSelectedAt)
    || compareNullableDesc(left.lastAgentActivityAt, right.lastAgentActivityAt)
    || compareNullableDesc(left.lastSyncedAt, right.lastSyncedAt)
    || right.createdAt - left.createdAt
    || compareId(left.id, right.id),
  );
  return new Set(sorted.slice(0, limit).map((candidate) => candidate.id));
}

/** @param {AvailabilityCandidate[]} candidates @param {ReadonlySet<string>} selected @param {boolean} trimmed */
export function availabilityBasis(candidates, selected, trimmed) {
  if (!trimmed) return null;
  const kept = candidates.filter((p) => selected.has(p.id));
  if (kept.some((p) => p.lastSelectedAt !== null)) return "user-selection";
  if (kept.some((p) => p.lastAgentActivityAt !== null)) return "recent-agent-activity";
  if (kept.some((p) => p.lastSyncedAt !== null)) return "recent-project-sync";
  return "recent-registration";
}

/** @param {{fromPlan: string, toPlan: string, currentIds: string[], candidates: AvailabilityCandidate[]}} input */
export function availabilityAfterPlanChange({ fromPlan, toPlan, currentIds, candidates }) {
  const fromLimit = limitsFor(fromPlan).projects;
  const toLimit = limitsFor(toPlan).projects;
  const all = availableProjectIds(candidates, Infinity);
  if (new Set(currentIds).size !== currentIds.length || all.size !== currentIds.length || currentIds.some((id) => !all.has(id))) {
    throw new Error("availability candidates must match the current set");
  }
  const trimmed = toLimit < fromLimit && all.size > toLimit;
  const selected = trimmed ? availableProjectIds(candidates, toLimit) : all;
  return {
    changed: trimmed,
    addedProjectIds: /** @type {string[]} */ ([]),
    removedProjectIds: currentIds.filter((id) => !selected.has(id)).sort(),
    availableProjectIds: [...selected].sort(),
    basis: availabilityBasis(candidates, selected, trimmed),
  };
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

// 소유자 토큰 발급(웹)과 gate_approve(MCP)가 같은 판정을 쓴다.
export function allowsSessionApprovals(plan) {
  return limitsFor(plan).sessionApprovals;
}

// 디스패치 창의 시작 — 이 시각 이후에 열린 AgentRun을 센다. historyCutoff와 같은 모양(플랜 무관, 창 상수 하나).
export function dispatchCutoff(now) {
  return new Date(now.getTime() - DISPATCH_WINDOW_DAYS * 86_400_000);
}
