export const RUNNER_MODES = /** @type {const} */ (["session", "resident"]);
export const RUNNER_STATES = /** @type {const} */ (["idle", "working", "waiting", "stopped"]);
export const RUNNER_WAIT_REASONS = /** @type {const} */ (["dirty", "branch"]);
export const RUNNER_PERMISSIONS = /** @type {const} */ (["auto", "allowlist"]);
export const RUNNER_STOP_REASONS = /** @type {const} */ (["owner", "stuck", "error", "plan"]);

export const SIGNAL_TIMEOUT_MS = 3 * 60_000;
export const WORKING_TIMEOUT_MS = 60 * 60_000;
export const BEAT_WRITE_INTERVAL_MS = 30_000;

export const RUNNER_HOST_MAX = 64;
export const RUNNER_BRANCH_MAX = 255;
export const RUNNER_RESULT_MAX = 150;
export const RUNNER_LOG_MAX = 100;

const time = (value, field) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${field} must be a valid Date`);
  return value.getTime();
};

/**
 * @typedef {object} RunnerSignal
 * @property {string} mode
 * @property {string} state
 * @property {Date} seenAt
 */

/** @param {Pick<RunnerSignal, "mode" | "state">} row */
export function needsAgentActivity(row) {
  return row.mode === "session" && row.state === "working";
}

/** @param {RunnerSignal} row @param {Date | null} lastActivity @returns {Date} */
export function runnerSignalAt(row, lastActivity) {
  const seen = time(row.seenAt, "seenAt");
  if (!needsAgentActivity(row) || lastActivity === null) return row.seenAt;
  return time(lastActivity, "lastActivity") > seen ? lastActivity : row.seenAt;
}

/** @param {Pick<RunnerSignal, "mode" | "state">} row */
export function runnerSilenceLimit(row) {
  return needsAgentActivity(row) ? WORKING_TIMEOUT_MS : SIGNAL_TIMEOUT_MS;
}

/** @param {RunnerSignal} row @param {Date | null} lastActivity @param {Date} now @returns {"live" | "silent" | "stopped"} */
export function runnerStatus(row, lastActivity, now) {
  if (row.state === "stopped") return "stopped";
  const elapsed = time(now, "now") - runnerSignalAt(row, lastActivity).getTime();
  return elapsed > runnerSilenceLimit(row) ? "silent" : "live";
}

/** @param {RunnerSignal} row @param {Date | null} lastActivity @param {Date} now */
export function holdsRunnerLease(row, lastActivity, now) {
  return runnerStatus(row, lastActivity, now) === "live";
}
