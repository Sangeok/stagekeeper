// 순수. 실행기(runner)의 생존 판정 — 서버의 lease 판정과 웹 배너의 표시가 같은 함수를 쓴다.
// 실행기는 파이프라인 일을 자동으로 이어 가는 로컬 프로세스다: session = 사용자가 연 Claude Code 세션의
// /harness:watch, resident = 창 없이 도는 상주 프로세스. 프로젝트마다 하나만 lease를 잡는다.
export const RUNNER_MODES = /** @type {const} */ (["session", "resident"]);
export const RUNNER_STATES = /** @type {const} */ (["idle", "working", "waiting", "stopped"]);
export const RUNNER_WAIT_REASONS = /** @type {const} */ (["dirty", "branch"]);
export const RUNNER_PERMISSIONS = /** @type {const} */ (["auto", "allowlist"]);
// owner는 소유자가 로컬에서 멈춘 것이다 — 서버는 그 행을 지운다. 나머지는 "정지됨(이유)"로 남는다.
export const RUNNER_STOP_REASONS = /** @type {const} */ (["owner", "stuck", "error", "plan"]);

// 신호가 이만큼 끊기면 응답 없음이다. 실행기는 60초마다 신호를 보내므로 세 번을 놓친 것이다.
export const SIGNAL_TIMEOUT_MS = 3 * 60_000;
// 1단계 세션이 일하는 동안에는 신호를 보낼 CLI가 없다. 디스패치마다의 --check와 프로젝트의 에이전트 활동을 함께
// 보고, 한 단계가 수십 분 걸릴 수 있어 60분을 둔다.
export const WORKING_TIMEOUT_MS = 60 * 60_000;
// 상태가 그대로인 신호는 이 간격 안이면 DB에 쓰지 않는다.
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

// 판정에 프로젝트의 마지막 에이전트 활동이 필요한가. 그 값은 이때만 읽는다.
/** @param {Pick<RunnerSignal, "mode" | "state">} row */
export function needsAgentActivity(row) {
  return row.mode === "session" && row.state === "working";
}

// "마지막으로 살아 있음을 안 시각". 1단계 작업 중에만 에이전트 활동이 신호보다 늦을 수 있다.
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

// live = lease를 잡고 있다. silent = 응답 없음(lease 만료 — 다른 실행기가 확인 없이 넘겨받는다).
// stopped = 정지했고 lease를 잡지 않는다.
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
