/** @typedef {(typeof PLANS)[number]} Plan */
export const PLANS = /** @type {const} */ (["free", "pro", "max"]);
/** @type {Plan} */
export const DEFAULT_PLAN = "free";
export const UNLIMITED = Infinity;
export const OWNER_TOKEN_PLAN_GATE = "Owner tokens open on Pro. Approve in the Inbox for now.";
export const RESIDENT_RUNNER_PLAN_GATE = "The background runner opens on Pro. Use /harness:watch in a Claude Code session for now.";
export const REPORT_AGENTS = ["pm", "plan-verifier", "doc-auditor", "feature-scout", "qa-verifier", "impl-verifier"];

export const LIMITS = {
  free: { projects: 1, workspaces: 1, backlog: 10, historyDays: 30, agents: ["pm", "feature-scout"], sessionApprovals: false, pipelineEdit: false, dispatches: 20, residentRunner: false },
  pro: { projects: 5, workspaces: 10, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS, sessionApprovals: true, pipelineEdit: true, dispatches: 100, residentRunner: true },
  max: { projects: UNLIMITED, workspaces: UNLIMITED, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS, sessionApprovals: true, pipelineEdit: true, dispatches: UNLIMITED, residentRunner: true },
};
const AXES = ["projects", "workspaces", "backlog", "dispatches"];

/** @param {unknown} x @returns {x is Plan} */
export function isPlan(x) { return PLANS.includes(x); }
export function limitsFor(plan) {
  if (!isPlan(plan)) throw new Error(`unknown plan: ${plan}`);
  return LIMITS[plan];
}

export function withinLimit(plan, axis, count) {
  if (!AXES.includes(axis)) throw new Error(`unknown axis: ${axis}`);
  return count <= limitsFor(plan)[axis];
}

const AXIS_NOUN = { projects: "project", workspaces: "workspace", backlog: "backlog", dispatches: "dispatch" };
export function capReason(plan, axis) {
  if (!AXES.includes(axis)) throw new Error(`unknown axis: ${axis}`);
  return `${AXIS_NOUN[axis]} cap reached on the ${plan} plan (${limitsFor(plan)[axis]})`;
}

export function capError(plan, axis, currentCount) {
  return withinLimit(plan, axis, currentCount + 1) ? null : `${capReason(plan, axis)}. Upgrade the plan to add more.`;
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

export function allowsAgent(plan, agent, roster) {
  const limits = limitsFor(plan);
  return limits.agents.includes(agent) || roster.slice(0, limits.workspaces).includes(agent);
}

export function historyCutoff(plan, now) {
  const days = limitsFor(plan).historyDays;
  return days === null ? null : new Date(now.getTime() - days * 86_400_000);
}

export function allowsSessionApprovals(plan) {
  return limitsFor(plan).sessionApprovals;
}
