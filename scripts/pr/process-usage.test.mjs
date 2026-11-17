import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it, mock } from "node:test";
import { inspectWorktreeUsage } from "./process-usage.mjs";

it("keeps unqualified runtime requests unknown without filesystem access or an observer", async () => {
  const refused = () => { throw new Error("unexpected I/O"); };
  const guards = [mock.method(childProcess, "spawn", refused), mock.method(fs, "lstat", refused), mock.method(fs, "realpath", refused), mock.method(fs, "stat", refused)];
  try {
    for (const worktreePath of [os.tmpdir(), path.join(os.tmpdir(), "unverified-missing-target")]) {
      const result = await inspectWorktreeUsage({ worktreePath });
      assert.equal(result.status, "unknown");
      assert.equal(result.capability.status, "unqualified");
      assert.equal(result.capability.profile, null);
      assert.equal(result.observationPerformed, false);
      assert.equal(result.observation.coverageComplete, false);
      assert.equal(result.observation.outputBytes, 0);
      assert.equal(result.target, null);
      assert.deepEqual(result.holders, []);
      assert.equal(result.observer.state, "not-started");
      assert.deepEqual(result.reasons, [["darwin", "win32"].includes(process.platform) ? "unqualified-profile" : "unsupported-platform"]);
    }
    for (const guard of guards) assert.equal(guard.mock.callCount(), 0);
  } finally { for (const guard of guards) guard.mock.restore(); }
});

it("rejects caller qualification, mode, and unknown-bypass options", async () => {
  for (const extra of [{ qualified: true }, { mode: "qualification" }, { profile: "darwin-lsof-4.91-current-uid-v1" }, { allowUnknown: true }]) {
    const result = await inspectWorktreeUsage({ worktreePath: os.tmpdir(), ...extra });
    assert.deepEqual(result.reasons, ["invalid-input"]);
    assert.equal(result.capability.status, "unqualified");
    assert.equal(result.observationPerformed, false);
  }
});

it("does not let test selection enable runtime observations", async () => {
  const previous = process.env.STAGEKEEPER_USAGE_QUALIFICATION;
  process.env.STAGEKEEPER_USAGE_QUALIFICATION = "all";
  try {
    const result = await inspectWorktreeUsage({ worktreePath: os.tmpdir() });
    assert.equal(result.status, "unknown");
    assert.equal(result.capability.status, "unqualified");
    assert.equal(result.observationPerformed, false);
  } finally {
    if (previous === undefined) delete process.env.STAGEKEEPER_USAGE_QUALIFICATION;
    else process.env.STAGEKEEPER_USAGE_QUALIFICATION = previous;
  }
});

it("validates inputs and cancellation before reporting an unqualified profile", async () => {
  for (const options of [null, {}, { worktreePath: "relative" }, { worktreePath: os.tmpdir(), observationTimeoutMs: 0 }, { worktreePath: os.tmpdir(), signal: {} }]) {
    assert.deepEqual((await inspectWorktreeUsage(options)).reasons, ["invalid-input"]);
  }
  const result = await inspectWorktreeUsage({ worktreePath: os.tmpdir(), signal: AbortSignal.abort() });
  assert.deepEqual(result.reasons, ["cancelled"]);
  assert.equal(result.observationPerformed, false);
});
