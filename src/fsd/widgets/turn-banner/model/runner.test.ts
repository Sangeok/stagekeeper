import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RUNNER_SIGNIN_CODES } from "@harness/core/runner.mjs";
import { copyLock } from "@/fsd/shared/lib/copy-lock";
import {
  fillLine, hasLiveRunner, lineText, RUNNER_FREE_LINE, RUNNER_LINES, RUNNER_SHORT, RUNNER_SIGNIN_REASONS, RUNNER_STOP_REASONS, RUNNER_VERSION_LINE, runnerLine,
  runnerShortLine, showsPauseControl, signinCode, type RunnerFacts, type TurnRunner,
} from "./runner";

const RENDERED = Date.parse("2026-10-20T12:00:00.000Z");
const ago = (minutes: number) => new Date(RENDERED - minutes * 60_000).toISOString();
const runner = (patch: Partial<TurnRunner> = {}): TurnRunner => ({
  mode: "session", host: "desk", branch: null, permission: null, autostart: false, state: "idle",
  waitReason: null, stopReason: null, signinCode: null, seenAt: ago(1), lastActivity: null, ...patch,
});
const facts = (value: TurnRunner | null, paused = false): RunnerFacts => ({ runner: value, paused, renderedAt: new Date(RENDERED).toISOString() });
const text = (value: RunnerFacts, now = RENDERED) => { const line = runnerLine(value, now); return line === null ? null : lineText(line); };
const short = (value: RunnerFacts, now = RENDERED) => { const line = runnerShortLine(value, now); return line === null ? null : lineText(line); };

describe("runner copy", () => {
  it("locks every line, reason and short form to product-copy", () => {
    assert.deepEqual(Object.values(RUNNER_LINES), copyLock("turn-banner-runner"));
    assert.deepEqual(Object.values(RUNNER_STOP_REASONS), copyLock("turn-banner-runner-reasons"));
    assert.deepEqual(Object.values(RUNNER_SIGNIN_REASONS), copyLock("turn-banner-runner-signin"));
    assert.deepEqual(Object.values(RUNNER_SHORT), copyLock("turn-banner-runner-short"));
    assert.deepEqual([RUNNER_VERSION_LINE], copyLock("turn-banner-runner-none"));
    assert.deepEqual([RUNNER_FREE_LINE], copyLock("turn-banner-runner-free"));
  });

  it("renders host and branch as code and leaves other values as text", () => {
    assert.deepEqual(fillLine(RUNNER_LINES.residentIdle, { host: "desk", branch: "main" }), [
      { text: "Runner: running in the background on " }, { text: "desk", code: true }, { text: " (" }, { text: "main", code: true }, { text: ")" },
    ]);
    assert.deepEqual(fillLine(RUNNER_LINES.checked, { n: "2" }), [{ text: "checked " }, { text: "2" }, { text: " min ago" }]);
  });
});

describe("runnerLine", () => {
  it("names a live runner, where it runs and when it last checked in", () => {
    assert.equal(text(facts(runner())), "Runner: watching in Claude Code on desk · checked 1 min ago");
    assert.equal(text(facts(runner({ seenAt: ago(0.2) }))), "Runner: watching in Claude Code on desk · checked 1 min ago", "never 0 min");
    assert.equal(text(facts(runner({ mode: "resident", branch: "main", permission: "auto", seenAt: ago(2) }))), "Runner: running in the background on desk (main) · checked 2 min ago");
    assert.equal(text(facts(runner({ mode: "resident", branch: "main", permission: "auto", state: "working" }))), "Runner: working in the background on desk (main) · checked 1 min ago · pause before you edit main");
  });

  it("adds the edit warning to a working background runner only", () => {
    const resident = { mode: "resident" as const, branch: "main", permission: "auto" as const };
    assert.deepEqual(fillLine(RUNNER_LINES.editGuard, { branch: "main" }), [{ text: "pause before you edit " }, { text: "main", code: true }]);
    assert.equal(text(facts(runner({ ...resident, state: "working", autostart: true }))),
      "Runner: working in the background on desk (main) · checked 1 min ago · pause before you edit main · starts at sign-in");
    assert.doesNotMatch(text(facts(runner({ ...resident, state: "idle" }))) ?? "", /pause before/);
    assert.doesNotMatch(text(facts(runner({ state: "working", lastActivity: ago(2) }))) ?? "", /pause before/);
    assert.doesNotMatch(text(facts(runner({ ...resident, state: "working" }), true)) ?? "", /pause before/);
  });

  it("measures a working session from its last agent activity", () => {
    assert.equal(text(facts(runner({ state: "working", seenAt: ago(40), lastActivity: ago(5) }))), "Runner: working in Claude Code on desk · last activity 5 min ago");
    assert.equal(text(facts(runner({ state: "working", seenAt: ago(40), lastActivity: null }))), "Runner: working in Claude Code on desk · last activity 40 min ago");
  });

  it("says what a waiting runner needs", () => {
    const base = { mode: "resident" as const, branch: "main", permission: "auto" as const, state: "waiting" as const };
    assert.equal(text(facts(runner({ ...base, waitReason: "dirty" }))), "Runner on desk is waiting: commit or stash the changes on main, and it continues.");
    assert.equal(text(facts(runner({ ...base, waitReason: "branch" }))), "Runner on desk is waiting: switch back to main, and it continues.");
  });

  it("adds the autostart and allow-list marks to a live resident runner", () => {
    assert.equal(text(facts(runner({ mode: "resident", branch: "main", permission: "allowlist", autostart: true }))),
      "Runner: running in the background on desk (main) · checked 1 min ago · starts at sign-in · allow-list only");
  });

  it("puts the pause first, and the second sentence only while work is running", () => {
    assert.equal(text(facts(runner(), true)), "Runner paused — it starts nothing new.");
    assert.equal(text(facts(runner({ state: "working" }), true)), "Runner paused — it starts nothing new. Work already running finishes first.");
    assert.equal(text(facts(null, true)), "Runner paused — it starts nothing new.");
    assert.equal(text(facts(null)), null);
  });

  it("reports silence past the limit and a stop with its fixed reason", () => {
    assert.equal(text(facts(runner({ seenAt: ago(5) }))), "No signal from the runner on desk for 5 min.");
    assert.equal(text(facts(runner({ state: "working", seenAt: ago(90), lastActivity: ago(61) }))), "No signal from the runner on desk for 61 min.");
    assert.equal(text(facts(runner({ state: "stopped", stopReason: "stuck" }), true)), "Runner on desk stopped: the same steps came back three times without progress. Start it again in Claude Code.");
    assert.equal(text(facts(runner({ state: "stopped", stopReason: "plan" }))), "Runner on desk stopped: the background runner needs Pro. Start it again in Claude Code.");
  });

  it("keeps a background runner the owner stopped with sign-in start on, and names a refused sign-in start", () => {
    const resident = { mode: "resident" as const, branch: "main", autostart: true, state: "stopped" as const };
    assert.equal(text(facts(runner({ ...resident, stopReason: "owner" }))), "Runner on desk stopped. It starts again when you sign in.");
    assert.equal(text(facts(runner({ ...resident, stopReason: "signin", signinCode: "dirty" }))),
      "Runner on desk did not start at sign-in: main had uncommitted changes. It tries again at the next sign-in, or start it in Claude Code.");
    assert.equal(text(facts(runner({ ...resident, stopReason: "signin", signinCode: "autostart-branch" }))),
      "Runner on desk did not start at sign-in: the checkout was not on main. It tries again at the next sign-in, or start it in Claude Code.");
    assert.deepEqual(runnerLine(facts(runner({ ...resident, stopReason: "signin", signinCode: "dirty" })), RENDERED)?.filter(segment => segment.code),
      [{ text: "desk", code: true }, { text: "main", code: true }]);
    assert.equal(text(facts(runner({ ...resident, stopReason: "signin", signinCode: null }))),
      "Runner on desk did not start at sign-in: see the runner log. It tries again at the next sign-in, or start it in Claude Code.");
    assert.equal(short(facts(runner({ ...resident, stopReason: "signin", signinCode: "locked" }))), "Runner: stopped on desk");
    assert.equal(showsPauseControl(facts(runner({ ...resident, stopReason: "owner" }))), true);
  });

  it("names every code the server accepts, and any other value as the log", () => {
    assert.deepEqual(Object.keys(RUNNER_SIGNIN_REASONS), [...RUNNER_SIGNIN_CODES]);
    assert.equal(signinCode("push-url"), "push-url");
    assert.equal(signinCode("no-claude"), "other");
    assert.equal(signinCode("constructor"), "other");
    assert.equal(signinCode(null), "other");
  });

  it("moves to no signal while the page stays open", () => {
    const value = facts(runner({ seenAt: ago(2) }));
    assert.equal(text(value, RENDERED), "Runner: watching in Claude Code on desk · checked 2 min ago");
    assert.equal(text(value, RENDERED + 90_000), "No signal from the runner on desk for 3 min.");
  });
});

describe("runnerShortLine", () => {
  it("gives every state its short form", () => {
    assert.equal(short(facts(runner())), "Runner: watching on desk");
    assert.equal(short(facts(runner({ mode: "resident", branch: "main", permission: "auto" }))), "Runner: running on desk");
    assert.equal(short(facts(runner({ state: "working" }))), "Runner: working on desk");
    assert.equal(short(facts(runner({ mode: "resident", branch: "main", permission: "auto", state: "waiting", waitReason: "dirty" }))), "Runner: waiting on desk");
    assert.equal(short(facts(runner(), true)), "Runner: paused");
    assert.equal(short(facts(null, true)), "Runner: paused");
    assert.equal(short(facts(runner({ seenAt: ago(4) }))), "Runner: no signal from desk");
    assert.equal(short(facts(runner({ state: "stopped", stopReason: "error" }))), "Runner: stopped on desk");
    assert.equal(short(facts(null)), null);
  });
});

describe("watch line and pause control", () => {
  it("hides the watch line only for a live runner", () => {
    assert.equal(hasLiveRunner(undefined, RENDERED), false);
    assert.equal(hasLiveRunner(facts(null), RENDERED), false);
    assert.equal(hasLiveRunner(facts(runner()), RENDERED), true);
    assert.equal(hasLiveRunner(facts(runner({ seenAt: ago(4) })), RENDERED), false);
    assert.equal(hasLiveRunner(facts(runner({ state: "stopped", stopReason: "error" })), RENDERED), false);
  });

  it("offers Pause or Resume only with a runner row or an active pause", () => {
    assert.equal(showsPauseControl(undefined), false);
    assert.equal(showsPauseControl(facts(null)), false);
    assert.equal(showsPauseControl(facts(null, true)), true);
    assert.equal(showsPauseControl(facts(runner({ state: "stopped", stopReason: "stuck" }))), true);
  });
});
