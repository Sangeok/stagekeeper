import assert from "node:assert/strict";

export function projectBuildVerdict(result, { allowTimeout = false } = {}) {
  assert.equal(result.quiescent, true);
  assert.equal(result.outputTruncated, false);
  assert.equal(result.snapshotWrites, "discarded");
  assert.equal(result.originalRepositoryWrites, false);
  if (allowTimeout && result.status === "timeout") return "inconclusive";
  assert.equal(result.status, "exited");
  assert.equal(result.exitCode, 0, "Full project build must succeed without role network or DB credentials");
  assert.match(result.stdout, /Route \(app\)/);
  return "pass";
}
