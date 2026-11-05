export const RUNNER_MODES = /** @type {const} */ (["session", "resident"]);
export const RUNNER_WAIT_REASONS = /** @type {const} */ (["dirty", "branch"]);
export const RUNNER_PERMISSIONS = /** @type {const} */ (["auto", "allowlist", "scoped"]);
export const RUNNER_STOP_REASONS = /** @type {const} */ (["owner", "stuck", "error", "plan"]);
export const RUNNER_AUTOSTART_STATES = /** @type {const} */ (["on", "off", "refused"]);
export const RUNNER_SIGNIN_CODES = /** @type {const} */ (["dirty", "autostart-branch", "detached", "push-url", "checkout-in-use", "other"]);

export const SIGNAL_TIMEOUT_MS = 3 * 60_000;
export const WORKING_TIMEOUT_MS = 60 * 60_000;
export const BEAT_WRITE_INTERVAL_MS = 30_000;
export const SIGNAL_GRACE_MS = 2 * 60_000;
export const WORKING_BEAT_MS = 60_000;
export const IDLE_STEPS = Object.freeze([
  Object.freeze({ after: 0, every: 60_000 }),
  Object.freeze({ after: 10 * 60_000, every: 15 * 60_000 }),
  Object.freeze({ after: 120 * 60_000, every: 30 * 60_000 }),
]);

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
 * @property {Date | null} [idleSince]
 */

/** @param {number} idleMs @returns {number} */
export function idleInterval(idleMs) {
  let every = IDLE_STEPS[0].every;
  for (const step of IDLE_STEPS) if (idleMs >= step.after) every = step.every;
  return every;
}

/** @param {RunnerSignal} row @returns {Date | null} */
export function runnerNextSignalAt(row) {
  if (row.state === "working" || row.state === "stopped" || row.idleSince === null || row.idleSince === undefined) return null;
  const seen = time(row.seenAt, "seenAt");
  return new Date(seen + idleInterval(seen - time(row.idleSince, "idleSince")));
}

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

/** @param {Pick<RunnerSignal, "mode" | "state"> & Partial<Pick<RunnerSignal, "seenAt" | "idleSince">>} row */
export function runnerSilenceLimit(row) {
  if (needsAgentActivity(row)) return WORKING_TIMEOUT_MS;
  const next = row.seenAt === undefined ? null : runnerNextSignalAt(/** @type {RunnerSignal} */ (row));
  if (next === null) return SIGNAL_TIMEOUT_MS;
  return Math.max(SIGNAL_TIMEOUT_MS, next.getTime() - time(row.seenAt, "seenAt") + SIGNAL_GRACE_MS);
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
