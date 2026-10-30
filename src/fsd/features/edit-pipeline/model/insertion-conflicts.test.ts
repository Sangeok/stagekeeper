import assert from "node:assert/strict";
import { it } from "node:test";
import { refStep, type Definitions } from "@harness/core/pipeline/pipeline.mjs";
import { findInsertionConflicts } from "./insertion-conflicts";
import { insertRef } from "./rail-state";

it("identifies all three existing steps when an implementation fragment is rejected without changing the draft", () => {
  const definitions = {
    main: { steps: ["plan", "verify", "implement", "impl-verify", "qa", "accept"], gates: ["before-implement"] },
    checks: { steps: ["implement", "impl-verify", "qa"], gates: [] },
  } satisfies Definitions;
  const before = structuredClone(definitions);

  const insertion = insertRef(definitions.main, "checks", "impl-verify", "pro", {
    pipelineId: "main", definitions, mustRun: ["main"],
  });
  const conflicts = findInsertionConflicts(definitions.main, "checks", definitions);

  assert.deepEqual(insertion, { ok: false, reason: "a node appears twice" });
  assert.deepEqual(conflicts, {
    nodes: ["implement", "impl-verify", "qa"],
    stepIds: ["implement", "impl-verify", "qa"],
  });
  assert.deepEqual(definitions, before);
});

it("locates overlapping nodes inside existing and incoming references", () => {
  const definitions = {
    main: { steps: ["plan", "implement", refStep("existing"), "accept"], gates: [] },
    existing: { steps: ["impl-verify", refStep("qa")], gates: [] },
    incoming: { steps: [refStep("qa"), "doc-auditor"], gates: [] },
    qa: { steps: ["qa"], gates: [] },
  } satisfies Definitions;

  assert.deepEqual(findInsertionConflicts(definitions.main, "incoming", definitions), {
    nodes: ["qa"], stepIds: [refStep("existing")],
  });
});

it("keeps distinct occurrences of the same project agent insertable", () => {
  const definitions = {
    main: { steps: ["plan", "implement", "doc-auditor", "accept"], gates: [] },
    incoming: { steps: ["doc-auditor#2"], gates: [] },
  } satisfies Definitions;

  assert.equal(findInsertionConflicts(definitions.main, "incoming", definitions), null);
  assert.equal(insertRef(definitions.main, "incoming", "accept", "pro", {
    pipelineId: "main", definitions, mustRun: ["main"],
  }).ok, true);
});

it("does not invent duplicate locations for missing or cyclic incoming pipelines", () => {
  const definitions = {
    main: { steps: ["plan", "implement", "accept"], gates: [] },
    loop: { steps: [refStep("loop")], gates: [] },
  } satisfies Definitions;

  assert.equal(findInsertionConflicts(definitions.main, "missing", definitions), null);
  assert.equal(findInsertionConflicts(definitions.main, "loop", definitions), null);
});
