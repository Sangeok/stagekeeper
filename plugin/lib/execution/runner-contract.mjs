export const RUNNER_MODES = /** @type {const} */ (["session", "resident"]);

export const RUNNER_WAIT_REASONS = /** @type {const} */ (["dirty", "branch"]);

export const RUNNER_PERMISSIONS = /** @type {const} */ (["auto", "allowlist", "scoped"]);

export const RUNNER_STOP_REASONS = /** @type {const} */ (["owner", "stuck", "error", "plan"]);

export const RUNNER_AUTOSTART_STATES = /** @type {const} */ (["on", "off", "refused"]);

export const RUNNER_SIGNIN_CODES = /** @type {const} */ (["dirty", "autostart-branch", "detached", "push-url", "checkout-in-use", "other"]);

export const RUNNER_HOST_MAX = 64;

export const RUNNER_BRANCH_MAX = 255;

export const RUNNER_RESULT_MAX = 150;

export const RUNNER_LOG_MAX = 100;

export const runnerTimestamp = (value, field) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${field} must be a valid Date`);
  return value.getTime();
};

const LIMITED_RESULT = "limited: Claude usage limit until ";

const LIMITED_LINE = /^limited: Claude usage limit until (\d{4}-\d{2}-\d{2}T\d{2}:\d{2})Z$/;

/** @param {Date} resumeAt @returns {string} */
export function limitedResult(resumeAt) {
  return `${LIMITED_RESULT}${new Date(runnerTimestamp(resumeAt, "resumeAt")).toISOString().slice(0, 16)}Z`;
}

/** @param {string | null | undefined} lastResult @returns {Date | null} */
export function limitedUntil(lastResult) {
  const minute = typeof lastResult === "string" ? LIMITED_LINE.exec(lastResult)?.[1] : undefined;
  if (minute === undefined) return null;
  const value = new Date(`${minute}:00.000Z`);
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 16) === minute ? value : null;
}
