import assert from "node:assert/strict";
import { it } from "node:test";
import { refStep } from "@harness/core/pipeline/pipeline.mjs";
import { savePipelineDefinition } from "../../../src/server/pipeline/api";
import { ensureRun } from "../../../src/server/pipeline/run-service";
import { cleanup, connections, fixture, pipelineState } from "./support";

it("a used pipeline's save writes new runnable versions for its users and refuses a breaking change", async () => {
  const pool = connections(1); const [db] = pool.all;
  let userId: string | undefined;
  try {
    const f = await fixture(db, { plan: "pro" }); userId = f.userId;
    const base = { projectId: f.projectId, userId: f.userId };
    const checkSteps = ["impl-verify", "qa"];
    const check = await savePipelineDefinition(db, { ...base, pipelineId: null, name: "Check", definition: { steps: checkSteps, gates: [] }, expectedVersion: 0 });
    assert.equal(check.status, "success");
    const checkId = check.status === "success" ? check.pipelineId : "";
    assert.equal(await db.pipelineVersion.count({ where: { pipelineId: checkId } }), 0);
    const feature = await savePipelineDefinition(db, { ...base, pipelineId: null, name: "Feature", definition: { steps: ["plan", "implement", refStep(checkId), "accept"], gates: [] }, expectedVersion: 0 });
    const featureId = feature.status === "success" ? feature.pipelineId : "";
    const first = await db.pipelineVersion.findFirstOrThrow({ where: { pipelineId: featureId }, orderBy: { version: "desc" } });
    assert.deepEqual(first.nodes, ["plan", "implement", ...checkSteps, "accept"]);

    assert.equal((await savePipelineDefinition(db, { ...base, pipelineId: checkId, definition: { steps: checkSteps, gates: ["before-qa"] }, expectedVersion: 1 })).status, "success");
    const second = await db.pipelineVersion.findFirstOrThrow({ where: { pipelineId: featureId }, orderBy: { version: "desc" } });
    assert.ok(second.version > first.version);
    assert.ok(second.gates.includes("before-qa"));

    const definitionsBefore = await db.pipelineDefinition.count({ where: { pipeline: { projectId: f.projectId } } });
    const broken = await savePipelineDefinition(db, { ...base, pipelineId: checkId, definition: { steps: ["verify", "qa"], gates: [] }, expectedVersion: 2 });
    assert.ok(broken.status === "error" && broken.reason.includes("Feature"));
    assert.equal(await db.pipelineDefinition.count({ where: { pipeline: { projectId: f.projectId } } }), definitionsBefore);
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});

it("nested users recompose transitively, legacy graphs get slots versions, unchanged graphs reuse, and old runs stay pinned", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro" });
  const identity = { projectId: f.projectId, userId: f.userId };
  try {
    const add = async (name: string, steps: string[]) => {
      const result = await savePipelineDefinition(db, { ...identity, pipelineId: null, name, definition: { steps, gates: [] }, expectedVersion: 0 });
      assert.ok(result.status === "success"); if (result.status !== "success") throw new Error("fixture failed"); return result.pipelineId;
    };
    const leaf = await add("Audit", ["doc-auditor"]), middle = await add("Preparation", [refStep(leaf)]);
    const parent = await add("Delivery", [refStep(middle), "plan", "implement", "accept"]);
    const run = await ensureRun(db, f.projectId, f.boardItemId, "in_review", false, parent);
    await db.pipelineVersion.update({ where: { id: run.version.id }, data: { format: null } });
    const pinned = await db.pipelineRun.findUniqueOrThrow({ where: { id: run.id }, include: { version: true } });
    const result = await savePipelineDefinition(db, { ...identity, pipelineId: leaf, expectedVersion: 1, definition: { steps: ["doc-auditor"], gates: ["before-doc-auditor"] } });
    assert.equal(result.status, "success");
    const latest = await db.pipelineVersion.findFirstOrThrow({ where: { pipelineId: parent }, orderBy: { version: "desc" } });
    assert.equal(latest.format, "slots-v1"); assert.ok(latest.gates.includes("before-doc-auditor"));
    assert.deepEqual(await db.pipelineRun.findUniqueOrThrow({ where: { id: run.id }, include: { version: true } }), pinned);
    assert.equal(await db.pipelineDefinition.count({ where: { pipelineId: { in: [middle, parent] } } }), 2, "users' own definitions do not change");
    const versions = await db.pipelineVersion.findMany({ where: { projectId: f.projectId }, orderBy: { version: "asc" } });
    assert.equal((await savePipelineDefinition(db, { ...identity, pipelineId: leaf, expectedVersion: 2, definition: { steps: ["doc-auditor"], gates: ["before-doc-auditor"] } })).status, "success");
    assert.deepEqual(await db.pipelineVersion.findMany({ where: { projectId: f.projectId }, orderBy: { version: "asc" } }), versions);
    const before = await pipelineState(db, f.projectId);
    const broken = await savePipelineDefinition(db, { ...identity, pipelineId: leaf, expectedVersion: 3, definition: { steps: ["accept"], gates: [] } });
    assert.equal(broken.status, "error"); assert.deepEqual(await pipelineState(db, f.projectId), before);
    const duplicate = await savePipelineDefinition(db, { ...identity, pipelineId: null, name: "Delivery", expectedVersion: 0, definition: { steps: ["qa"], gates: [] } });
    assert.equal(duplicate.status, "error"); assert.deepEqual(await pipelineState(db, f.projectId), before);
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});
