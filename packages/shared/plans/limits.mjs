/** @typedef {(typeof PLANS)[number]} Plan */
export const PLANS = /** @type {const} */ (["free", "pro", "max"]);

/** @type {Plan} */
export const DEFAULT_PLAN = "free";

export const UNLIMITED = Infinity;

export const RESIDENT_RUNNER_PLAN_GATE = "The background runner opens on Pro. Use /harness:watch in a Claude Code session for now.";

export const CODEX_RESIDENT_RUNNER_PLAN_GATE = "The background runner opens on Pro. Use $harness-run or $harness-resume in Codex for now.";

export const REPORT_AGENTS = ["pm", "work-assigner", "work-discoverer", "plan-verifier", "doc-auditor", "feature-scout", "qa-verifier", "impl-verifier"];

export const LIMITS = {
  free: { projects: 1, workspaces: 1, backlog: 10, historyDays: 30, agents: ["pm", "feature-scout", "work-assigner", "work-discoverer"], sessionApprovals: false, pipelineEdit: false, dispatches: 20, residentRunner: false },
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
