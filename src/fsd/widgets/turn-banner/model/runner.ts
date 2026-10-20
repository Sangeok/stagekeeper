import { runnerSignalAt, runnerStatus } from "@harness/core/runner.mjs";
// 순수. 배너와 프로젝트 목록에 보이는 실행기 줄. 문구는 docs/conventions/product-copy.md §5의 잠금 블록이고,
// 생존 판정은 서버의 lease 판정과 같은 함수다(packages/core/runner.mjs).
// 서버 타입(@/server/runners/contracts)은 여기서 읽지 않는다 — api adapter가 이 타입으로 옮긴다.

export type TurnRunner = {
  mode: "session" | "resident";
  host: string;
  branch: string | null;
  permission: "auto" | "allowlist" | null;
  autostart: boolean;
  state: "idle" | "working" | "waiting" | "stopped";
  waitReason: "dirty" | "branch" | null;
  stopReason: "stuck" | "error" | "plan" | null;
  seenAt: string;
  lastActivity: string | null;
};

// 서버가 읽은 사실 한 묶음. renderedAt은 같은 조회의 DB 시각이고, 첫 렌더는 이 값을 "지금"으로 쓴다.
export type RunnerFacts = { runner: TurnRunner | null; paused: boolean; renderedAt: string };

// 큰 배너 줄. 한 값은 잠금 블록의 한 단위다(` · `로 이어 붙인다). {host}·{branch}는 식별자라 monospace로 그린다.
export const RUNNER_LINES = {
  sessionIdle: "Runner: watching in Claude Code on {host}",
  residentIdle: "Runner: running in the background on {host} ({branch})",
  sessionWorking: "Runner: working in Claude Code on {host}",
  residentWorking: "Runner: working in the background on {host} ({branch})",
  checked: "checked {n} min ago",
  lastActivity: "last activity {n} min ago",
  waitingDirty: "Runner on {host} is waiting: commit or stash the changes on {branch}, and it continues.",
  waitingBranch: "Runner on {host} is waiting: switch back to {branch}, and it continues.",
  paused: "Runner paused — it starts nothing new.",
  pausedWorking: "Work already running finishes first.",
  silent: "No signal from the runner on {host} for {n} min.",
  stopped: "Runner on {host} stopped: {reason}. Start it again in Claude Code.",
  autostart: "starts at sign-in",
  allowlist: "allow-list only",
} as const;

// 정지 이유는 코드별 고정 문장이다. 서버나 CLI가 보낸 자유 문장은 화면에 싣지 않는다.
export const RUNNER_STOP_REASONS = {
  stuck: "the same steps came back three times without progress",
  error: "it hit an error — check the session or its log",
  plan: "the background runner needs Pro",
} as const;

// 스트립 꼬리와 프로젝트 목록 카드 줄.
export const RUNNER_SHORT = {
  sessionIdle: "Runner: watching on {host}",
  residentIdle: "Runner: running on {host}",
  working: "Runner: working on {host}",
  waiting: "Runner: waiting on {host}",
  paused: "Runner: paused",
  silent: "Runner: no signal from {host}",
  stopped: "Runner: stopped on {host}",
} as const;

// 실행기가 없을 때 WATCH_LINE 아래에 붙는 한 줄(결정 9: 옛 플러그인의 watch는 서버가 구별하지 못한다).
export const RUNNER_VERSION_LINE = "Runners on plugin 0.5.13 or later show their status here.";

export type RunnerSegment = { text: string; code?: boolean };
export type RunnerLine = RunnerSegment[];

const MINUTE = 60_000;
const minutesSince = (from: string, now: number) => Math.max(0, now - Date.parse(from)) / MINUTE;
// "checked N min ago"는 1분 아래를 1로 올린다 — "0 min ago"는 쓰지 않는다.
const ago = (from: string, now: number) => String(Math.max(1, Math.ceil(minutesSince(from, now))));

// 틀의 {이름}을 값으로 채운다. host·branch는 code 조각이 된다.
export function fillLine(template: string, values: Record<string, string>): RunnerLine {
  const out: RunnerLine = [];
  for (const part of template.split(/(\{[a-z]+\})/)) {
    if (part === "") continue;
    const name = /^\{([a-z]+)\}$/.exec(part)?.[1];
    if (name === undefined || values[name] === undefined) out.push({ text: part });
    else out.push(name === "host" || name === "branch" ? { text: values[name], code: true } : { text: values[name] });
  }
  return out;
}

const join = (...lines: RunnerLine[]): RunnerLine => lines.flatMap((line, index) => index === 0 ? line : [{ text: " · " }, ...line]);
export const lineText = (line: RunnerLine): string => line.map((segment) => segment.text).join("");

const toDates = (runner: TurnRunner) => ({
  mode: runner.mode, state: runner.state, seenAt: new Date(runner.seenAt),
});
const activity = (runner: TurnRunner) => runner.lastActivity === null ? null : new Date(runner.lastActivity);

export type RunnerLiveness = "live" | "silent" | "stopped";
export function runnerLiveness(runner: TurnRunner, now: number): RunnerLiveness {
  return runnerStatus(toDates(runner), activity(runner), new Date(now));
}

// WATCH_LINE은 살아 있는 실행기가 없을 때만 보인다 — 행이 없거나, 응답 없음이거나, 정지인 경우.
export function hasLiveRunner(facts: RunnerFacts | undefined, now: number): boolean {
  return facts?.runner != null && runnerLiveness(facts.runner, now) === "live";
}

// Pause/Resume은 실행기 행이 있거나 일시 정지 중일 때만 보인다.
export const showsPauseControl = (facts: RunnerFacts | undefined): boolean => facts !== undefined && (facts.runner !== null || facts.paused);

// 큰 배너의 실행기 줄. 실행기도 일시 정지도 없으면 null.
export function runnerLine(facts: RunnerFacts, now: number): RunnerLine | null {
  const { runner, paused } = facts;
  if (runner === null) return paused ? fillLine(RUNNER_LINES.paused, {}) : null;
  const values = { host: runner.host, branch: runner.branch ?? "" };
  const liveness = runnerLiveness(runner, now);
  if (liveness === "stopped") {
    return fillLine(RUNNER_LINES.stopped, { ...values, reason: RUNNER_STOP_REASONS[runner.stopReason ?? "error"] });
  }
  if (liveness === "silent") {
    const since = runnerSignalAt(toDates(runner), activity(runner)).toISOString();
    return fillLine(RUNNER_LINES.silent, { ...values, n: String(Math.floor(minutesSince(since, now))) });
  }
  const suffixes: RunnerLine[] = [];
  if (runner.mode === "resident" && runner.autostart) suffixes.push(fillLine(RUNNER_LINES.autostart, {}));
  if (runner.mode === "resident" && runner.permission === "allowlist") suffixes.push(fillLine(RUNNER_LINES.allowlist, {}));
  if (paused) {
    const line = runner.state === "working"
      ? [...fillLine(RUNNER_LINES.paused, {}), { text: " " }, ...fillLine(RUNNER_LINES.pausedWorking, {})]
      : fillLine(RUNNER_LINES.paused, {});
    return join(line, ...suffixes);
  }
  if (runner.state === "waiting") {
    return join(fillLine(runner.waitReason === "branch" ? RUNNER_LINES.waitingBranch : RUNNER_LINES.waitingDirty, values), ...suffixes);
  }
  const resident = runner.mode === "resident";
  if (runner.state === "working" && !resident) {
    const since = runnerSignalAt(toDates(runner), activity(runner)).toISOString();
    return join(fillLine(RUNNER_LINES.sessionWorking, values), fillLine(RUNNER_LINES.lastActivity, { n: ago(since, now) }), ...suffixes);
  }
  const main = runner.state === "working" ? RUNNER_LINES.residentWorking : resident ? RUNNER_LINES.residentIdle : RUNNER_LINES.sessionIdle;
  return join(fillLine(main, values), fillLine(RUNNER_LINES.checked, { n: ago(runner.seenAt, now) }), ...suffixes);
}

// 스트립 꼬리와 목록 카드의 짧은 형태. 붙일 것이 없으면 null.
export function runnerShortLine(facts: RunnerFacts, now: number): RunnerLine | null {
  const { runner, paused } = facts;
  if (runner === null) return paused ? fillLine(RUNNER_SHORT.paused, {}) : null;
  const values = { host: runner.host };
  const liveness = runnerLiveness(runner, now);
  if (liveness === "stopped") return fillLine(RUNNER_SHORT.stopped, values);
  if (liveness === "silent") return fillLine(RUNNER_SHORT.silent, values);
  if (paused) return fillLine(RUNNER_SHORT.paused, {});
  if (runner.state === "waiting") return fillLine(RUNNER_SHORT.waiting, values);
  if (runner.state === "working") return fillLine(RUNNER_SHORT.working, values);
  return fillLine(runner.mode === "resident" ? RUNNER_SHORT.residentIdle : RUNNER_SHORT.sessionIdle, values);
}
