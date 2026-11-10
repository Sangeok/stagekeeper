import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  holdsRunnerLease, idleInterval, limitedResult, limitedUntil, needsAgentActivity, RUNNER_RESULT_MAX, runnerNextSignalAt, runnerSignalAt, runnerSilenceLimit,
  runnerStatus, SIGNAL_TIMEOUT_MS, WORKING_TIMEOUT_MS,
} from "./runner.mjs";

const at = (minutes) => new Date(Date.UTC(2026, 9, 20, 12, 0) + minutes * 60_000);
const row = (mode, state, seenMinute = 0) => ({ mode, state, seenAt: at(seenMinute) });
const idleRow = (mode, state, idleMinute, seenMinute = 0) => ({ ...row(mode, state, seenMinute), idleSince: at(idleMinute) });
const MINUTE = 60_000;

describe("runner liveness", () => {
  it("gives every resident state and an idle or waiting session three minutes", () => {
    for (const [mode, state] of [["resident", "idle"], ["resident", "working"], ["resident", "waiting"], ["session", "idle"], ["session", "waiting"]]) {
      assert.equal(runnerSilenceLimit({ mode, state }), SIGNAL_TIMEOUT_MS, `${mode}/${state}`);
      assert.equal(runnerStatus(row(mode, state), null, at(3)), "live", `${mode}/${state} at the edge`);
      assert.equal(runnerStatus(row(mode, state), null, new Date(at(3).getTime() + 1)), "silent", `${mode}/${state} past the edge`);
    }
  });

  it("gives a working session sixty minutes after the later of its signal and the last agent activity", () => {
    const working = row("session", "working");
    assert.equal(runnerSilenceLimit(working), WORKING_TIMEOUT_MS);
    assert.equal(runnerStatus(working, null, at(60)), "live");
    assert.equal(runnerStatus(working, null, at(61)), "silent");
    assert.equal(runnerStatus(working, at(40), at(100)), "live");
    assert.equal(runnerStatus(working, at(40), at(101)), "silent");
    assert.equal(runnerSignalAt(working, at(40)).getTime(), at(40).getTime());
    const late = row("session", "working", 30);
    assert.equal(runnerSignalAt(late, at(10)).getTime(), at(30).getTime());
  });

  it("ignores agent activity outside a working session", () => {
    for (const [mode, state] of [["session", "idle"], ["resident", "working"]]) {
      assert.equal(needsAgentActivity({ mode, state }), false);
      assert.equal(runnerSignalAt(row(mode, state), at(50)).getTime(), at(0).getTime());
      assert.equal(runnerStatus(row(mode, state), at(50), at(10)), "silent");
    }
  });

  it("never lets a stopped row hold the lease, however recent", () => {
    assert.equal(runnerStatus(row("resident", "stopped"), null, at(0)), "stopped");
    assert.equal(holdsRunnerLease(row("session", "stopped"), at(0), at(0)), false);
  });

  it("holds the lease only while live, so an expired lease can be taken over", () => {
    assert.equal(holdsRunnerLease(row("session", "idle"), null, at(2)), true);
    assert.equal(holdsRunnerLease(row("session", "idle"), null, at(4)), false);
  });

  it("rejects invalid times instead of reading them as live", () => {
    assert.throws(() => runnerStatus({ mode: "session", state: "idle", seenAt: new Date(NaN) }, null, at(0)), /seenAt/);
    assert.throws(() => runnerStatus(row("session", "working"), new Date(NaN), at(0)), /lastActivity/);
    assert.throws(() => runnerStatus(row("session", "idle"), null, new Date(NaN)), /now/);
    assert.throws(() => runnerStatus({ ...row("resident", "idle"), idleSince: new Date(NaN) }, null, at(0)), /idleSince/);
  });
});

describe("idle backoff", () => {
  it("waits one minute for the first ten idle minutes, fifteen until two hours, then thirty", () => {
    const cases = [[-1, 1], [0, 1], [10 * MINUTE - 1, 1], [10 * MINUTE, 15], [120 * MINUTE - 1, 15], [120 * MINUTE, 30], [24 * 60 * MINUTE, 30]];
    for (const [idleMs, minutes] of cases) assert.equal(idleInterval(idleMs), minutes * MINUTE, `${idleMs} ms idle`);
  });

  it("announces the next signal from the idle time at the last signal", () => {
    assert.equal(runnerNextSignalAt(idleRow("resident", "idle", -5)).getTime(), at(1).getTime());
    assert.equal(runnerNextSignalAt(idleRow("session", "waiting", -30)).getTime(), at(15).getTime());
    assert.equal(runnerNextSignalAt(idleRow("resident", "idle", -150)).getTime(), at(30).getTime());
    for (const [mode, state] of [["resident", "working"], ["session", "working"], ["resident", "stopped"]]) {
      assert.equal(runnerNextSignalAt(idleRow(mode, state, -150)), null, `${mode}/${state}`);
    }
    assert.equal(runnerNextSignalAt(row("resident", "idle")), null);
    assert.equal(runnerNextSignalAt({ ...row("resident", "idle"), idleSince: null }), null);
  });

  it("keeps an idle runner live until two minutes past its announced signal, and never less than three minutes", () => {
    const quarter = idleRow("resident", "idle", -30);
    assert.equal(runnerSilenceLimit(quarter), 17 * MINUTE);
    assert.equal(runnerStatus(quarter, null, at(17)), "live");
    assert.equal(runnerStatus(quarter, null, new Date(at(17).getTime() + 1)), "silent");
    const half = idleRow("session", "idle", -150);
    assert.equal(runnerStatus(half, null, at(32)), "live");
    assert.equal(runnerStatus(half, null, new Date(at(32).getTime() + 1)), "silent");
    assert.equal(holdsRunnerLease(half, null, at(31)), true);
    assert.equal(holdsRunnerLease(half, null, at(33)), false);
    assert.equal(runnerSilenceLimit(idleRow("resident", "idle", -5)), SIGNAL_TIMEOUT_MS);
  });

  it("leaves working runners on their current limits whatever idleSince says", () => {
    assert.equal(runnerSilenceLimit(idleRow("resident", "working", -150)), SIGNAL_TIMEOUT_MS);
    assert.equal(runnerSilenceLimit(idleRow("session", "working", -150)), WORKING_TIMEOUT_MS);
    assert.equal(runnerStatus(idleRow("resident", "working", -150), null, at(4)), "silent");
  });
});

describe("usage-limit result line", () => {
  it("writes the resume time as a UTC minute and reads the same time back", () => {
    const resume = new Date(Date.UTC(2026, 10, 10, 9, 21));
    const line = limitedResult(resume);
    assert.equal(line, "limited: Claude usage limit until 2026-11-10T09:21Z");
    assert.ok(line.length <= RUNNER_RESULT_MAX);
    assert.equal(limitedUntil(line)?.getTime(), resume.getTime());
    assert.equal(limitedResult(new Date(Date.UTC(2026, 10, 10, 9, 21, 59))), line);
  });

  it("reads no time from other result lines or a malformed time, and refuses an invalid resume time", () => {
    for (const value of [null, undefined, "", "done: 3 turns, 0 denied", "error: success (api_error)", "dirty",
      "limited: Claude usage limit until 2026-13-01T09:21Z", "limited: Claude usage limit until 2026-02-30T09:21Z",
      "limited: Claude usage limit until 2026-11-10T24:00Z", "limited: Claude usage limit until 2026-11-10T09:21",
      " limited: Claude usage limit until 2026-11-10T09:21Z", "limited: Claude usage limit until 2026-11-10T09:21Z later"]) {
      assert.equal(limitedUntil(value), null, String(value));
    }
    assert.throws(() => limitedResult(new Date(NaN)), /resumeAt/);
  });
});
