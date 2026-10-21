import { runnerSignalAt, runnerStatus } from "@harness/core/runner.mjs";

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

export type RunnerFacts = { runner: TurnRunner | null; paused: boolean; renderedAt: string };

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
  editGuard: "pause before you edit {branch}",
} as const;

export const RUNNER_STOP_REASONS = {
  stuck: "the same steps came back three times without progress",
  error: "it hit an error — check the session or its log",
  plan: "the background runner needs Pro",
} as const;

export const RUNNER_SHORT = {
  sessionIdle: "Runner: watching on {host}",
  residentIdle: "Runner: running on {host}",
  working: "Runner: working on {host}",
  waiting: "Runner: waiting on {host}",
  paused: "Runner: paused",
  silent: "Runner: no signal from {host}",
  stopped: "Runner: stopped on {host}",
} as const;

export const RUNNER_VERSION_LINE = "Runners on plugin 0.5.13 or later show their status here.";
export const RUNNER_FREE_LINE = "The background runner opens on Pro.";

export type RunnerSegment = { text: string; code?: boolean };
export type RunnerLine = RunnerSegment[];

const MINUTE = 60_000;
const minutesSince = (from: string, now: number) => Math.max(0, now - Date.parse(from)) / MINUTE;
const ago = (from: string, now: number) => String(Math.max(1, Math.ceil(minutesSince(from, now))));

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

export function hasLiveRunner(facts: RunnerFacts | undefined, now: number): boolean {
  return facts?.runner != null && runnerLiveness(facts.runner, now) === "live";
}

export const showsPauseControl = (facts: RunnerFacts | undefined): boolean => facts !== undefined && (facts.runner !== null || facts.paused);

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
  const guard = runner.state === "working" ? [fillLine(RUNNER_LINES.editGuard, values)] : [];
  return join(fillLine(main, values), fillLine(RUNNER_LINES.checked, { n: ago(runner.seenAt, now) }), ...guard, ...suffixes);
}

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
