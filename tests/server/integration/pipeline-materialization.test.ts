import assert from "node:assert/strict";
import { it } from "node:test";
import { defaultGraph } from "@harness/core/pipeline/pipeline.mjs";
import { ensureRun } from "../../../src/server/pipeline/run-service";
import { headFor, loadPipelinesView, nextFor } from "../../../src/server/pipeline/api";
import { savePipelineDefinition } from "../../../src/server/pipeline/api";
import { createBoardService as createBoardQueries } from "../../../src/server/pipeline/api";
import { Prisma } from "../../../src/generated/prisma/client";
import { afterProjectRead, checkpoint, cleanup, connections, fixture, pipelineState } from "./support";

it("GET and head are read-only; the first root ensureRun creates one definition and version and later reads preserve it", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro" });
  try {
    const before = await pipelineState(db, f.projectId);
    const view = await loadPipelinesView(db, f.projectId);
    assert.equal(view.pipelines.length, 1); assert.equal(view.pipelines[0].saved, null);
    assert.deepEqual(view.pipelines[0].definition.steps, defaultGraph("pro").nodes);
    assert.ok(view.pipelines[0].runnable);
    await headFor(db, f.projectId, 0, 1, false);
    assert.deepEqual(await pipelineState(db, f.projectId), before);
    const first = await ensureRun(db, f.projectId, f.boardItemId, "in_review", false);
    assert.equal(first.version.version, 1); assert.ok(first.entryId);
    await nextFor(db, f.projectId, f.key);
    assert.deepEqual(await ensureRun(db, f.projectId, f.boardItemId, "in_review", false), first);
    const saved = await loadPipelinesView(db, f.projectId);
    assert.equal(saved.pipelines[0].saved?.version, 1);
    assert.equal(await db.pipelineVersion.count({ where: { projectId: f.projectId } }), 1);
    await db.subscription.update({ where: { userId: f.userId }, data: { plan: "free" } });
    assert.deepEqual(await ensureRun(db, f.projectId, f.boardItemId, "in_review", false), first, "downgrades do not rewrite stored defaults");
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});

it("a Serializable proposal waiting before first definition creation fails as P2034, never P2002, and retries against the committed default", async () => {
  const pool = connections(); const [a, b] = pool.all; const f = await fixture(a, { plan: "pro" });
  const waiting = checkpoint(); let pending: Promise<unknown> | undefined;
  try {
    await a.boardItem.delete({ where: { id: f.boardItemId } });
    const pipelineId = `default_${f.projectId}`;
    await a.pipeline.create({ data: { id: pipelineId, projectId: f.projectId, name: "Default", createdBy: "pipeline" } });
    await a.project.update({ where: { id: f.projectId }, data: { defaultPipelineId: pipelineId } });
    const delayed = createBoardQueries(afterProjectRead(b, waiting.hook)).propose(f.projectId, { key: f.key, agent: "dev", reason: "race" }, { actor: "agent", actorRef: "pm" });
    pending = delayed.catch(error => error);
    await waiting.entered();
    assert.equal((await savePipelineDefinition(a, { projectId: f.projectId, userId: f.userId, pipelineId, expectedVersion: 0, definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] } })).status, "success");
    const before = await pipelineState(a, f.projectId); waiting.release();
    const conflict = await pending;
    assert.ok(conflict instanceof Prisma.PrismaClientKnownRequestError); assert.equal(conflict.code, "P2034");
    assert.deepEqual(await pipelineState(a, f.projectId), before);
    assert.equal((await createBoardQueries(b).propose(f.projectId, { key: f.key, agent: "dev", reason: "retry" }, { actor: "agent", actorRef: "pm" })).ok, true);
    assert.equal(await a.pipelineVersion.count({ where: { projectId: f.projectId } }), 1);
  } finally { waiting.release(); await pending; await cleanup(a, f.userId); await pool.disconnect(); }
});

it("default integrity errors, id collisions and version overflow roll materialization back completely", async () => {
  const pool = connections(1); const [db] = pool.all;
  try {
    for (const mode of ["definition-only", "overflow", "id-collision"] as const) {
      const f = await fixture(db, { plan: "pro" }), other = await fixture(db, { plan: "pro" });
      try {
        const pipelineId = `default_${f.projectId}`;
        if (mode === "definition-only") {
          await db.pipeline.create({ data: { id: pipelineId, projectId: f.projectId, name: "Default", createdBy: f.userId, definitions: { create: { version: 1, steps: ["plan"], gates: [], createdBy: f.userId } } } });
          await db.project.update({ where: { id: f.projectId }, data: { defaultPipelineId: pipelineId } });
        } else if (mode === "overflow") {
          const otherPipeline = await db.pipeline.create({ data: { projectId: f.projectId, name: "Other", createdBy: f.userId } });
          await db.pipelineVersion.create({ data: { projectId: f.projectId, pipelineId: otherPipeline.id, version: 2_147_483_647, nodes: ["plan", "implement", "accept"], gates: [], createdBy: f.userId } });
        } else await db.pipeline.create({ data: { id: pipelineId, projectId: other.projectId, name: "Collision", createdBy: other.userId } });
        const before = await pipelineState(db, f.projectId);
        await assert.rejects(ensureRun(db, f.projectId, f.boardItemId, "in_review", false));
        assert.deepEqual(await pipelineState(db, f.projectId), before);
      } finally { await cleanup(db, f.userId); await cleanup(db, other.userId); }
    }
  } finally { await pool.disconnect(); }
});

it("new pipeline and definition/version writes all roll back if a later version append fails", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro" });
  try {
    const before = await pipelineState(db, f.projectId), error = new Error("append failed");
    const broken = db.$extends({ query: { pipelineVersion: { create() { throw error; } } } }) as unknown as typeof db;
    await assert.rejects(savePipelineDefinition(broken, { projectId: f.projectId, userId: f.userId, pipelineId: null, name: "Feature", definition: { steps: ["plan", "implement", "accept"], gates: [] }, expectedVersion: 0 }), value => value === error);
    assert.deepEqual(await pipelineState(db, f.projectId), before);
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});

it("an expired transaction rolls a complete definition save back without automatic resubmission", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro" });
  try {
    let attempts = 0;
    const timed = new Proxy(db, { get(target, property) {
      if (property === "$transaction") return (work: Parameters<typeof db.$transaction>[0], options: { timeout: number }) => {
        attempts++; assert.equal(options.timeout, 15_000);
        if (typeof work !== "function") throw new Error("Expected interactive transaction");
        return target.$transaction(async tx => { const result = await work(tx); await new Promise(resolve => setTimeout(resolve, 800)); return result; }, { ...options, timeout: 500 });
      };
      return Reflect.get(target, property);
    } });
    const before = await pipelineState(db, f.projectId);
    await assert.rejects(savePipelineDefinition(timed, { projectId: f.projectId, userId: f.userId, pipelineId: null, name: "Timed out", expectedVersion: 0, definition: { steps: ["plan", "implement", "accept"], gates: [] } }), /expired|closed|timed out/i);
    assert.equal(attempts, 1); assert.deepEqual(await pipelineState(db, f.projectId), before);
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});
