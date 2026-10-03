import assert from "node:assert/strict";
import { it } from "node:test";
import { clientRuntime } from "@harness/core/client-runtime.mjs";
import { formatNextStep } from "./next-step";
import type { NextStep } from "./turn";

it("preserves handoff prerequisites and raw prepared paths for both clients", () => {
  for (const note of [null, "", "docs/a b<&>.md"]) {
    const step: NextStep = { kind: "handoff", key: "K-1", line: `Commit ${note ?? "the prepared file"}, then continue the pipeline for K-1.`, note };
    assert.equal(formatNextStep(step, "claude"), step.line);
    assert.equal(formatNextStep(step, "codex"), `Commit ${note ?? "the prepared file"}, then ${clientRuntime("codex").resume_command} Continue the pipeline for K-1.`);
  }
  assert.equal(formatNextStep({ kind: "continue", key: "K-2", line: "original" }, "codex"), "$harness-resume Continue the pipeline for K-2.");
});
