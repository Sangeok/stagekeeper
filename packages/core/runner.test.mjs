import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  holdsRunnerLease, needsAgentActivity, runnerSignalAt, runnerSilenceLimit, runnerStatus,
  SIGNAL_TIMEOUT_MS, WORKING_TIMEOUT_MS,
} from "./runner.mjs";

const at = (minutes) => new Date(Date.UTC(2026, 9, 20, 12, 0) + minutes * 60_000);
const row = (mode, state, seenMinute = 0) => ({ mode, state, seenAt: at(seenMinute) });

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
    // 에이전트가 신호 뒤 40분에 움직였다 — 그 뒤 60분까지 산다.
    assert.equal(runnerStatus(working, at(40), at(100)), "live");
    assert.equal(runnerStatus(working, at(40), at(101)), "silent");
    assert.equal(runnerSignalAt(working, at(40)).getTime(), at(40).getTime());
    // 신호보다 이른 활동은 기준을 당기지 않는다.
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
  });
});
