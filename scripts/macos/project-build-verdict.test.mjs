import assert from "node:assert/strict";
import { it } from "node:test";
import { projectBuildVerdict } from "./project-build-verdict.mjs";

const finished = { status: "exited", exitCode: 0, quiescent: true, outputTruncated: false, snapshotWrites: "discarded", originalRepositoryWrites: false, stdout: "Route (app)\n" };
const timedOut = { ...finished, status: "timeout", exitCode: -1, stdout: "Running TypeScript ...\n" };

it("passes a finished build whether or not a timeout is allowed", () => {
  assert.equal(projectBuildVerdict(finished), "pass");
  assert.equal(projectBuildVerdict(finished, { allowTimeout: true }), "pass");
});

it("refuses a timed-out build by default and reports it as inconclusive, never as a pass, when the caller allows it", () => {
  assert.throws(() => projectBuildVerdict(timedOut), assert.AssertionError);
  assert.equal(projectBuildVerdict(timedOut, { allowTimeout: true }), "inconclusive");
});

it("still refuses a failed build, another early end and a broken sandbox property when a timeout is allowed", () => {
  const refused = {
    "nonzero exit": { ...finished, exitCode: 1 },
    "no route table": { ...finished, stdout: "" },
    "stopped": { ...finished, status: "stopped" },
    "output limit": { ...finished, status: "output-limit" },
    "timeout with surviving processes": { ...timedOut, quiescent: false },
    "timeout with truncated output": { ...timedOut, outputTruncated: true },
    "timeout with kept snapshot writes": { ...timedOut, snapshotWrites: "kept" },
    "timeout with writes to the original": { ...timedOut, originalRepositoryWrites: true },
  };

  for (const [label, result] of Object.entries(refused)) {
    assert.throws(() => projectBuildVerdict(result, { allowTimeout: true }), assert.AssertionError, label);
  }
});
