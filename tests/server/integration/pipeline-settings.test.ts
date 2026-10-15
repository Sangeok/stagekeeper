import assert from "node:assert/strict";
import { it } from "node:test";
import { refStep, PIPELINE_EDIT_PLAN_GATE } from "@harness/core/pipeline.mjs";
import { savePipelineDefinition } from "../../../src/server/pipeline/definition-save-query";
import { archivePipeline, renamePipeline, setAutomaticPick, setDefaultPipeline, setPipelineRule } from "../../../src/server/pipeline/pipeline-settings-query";
import { ensureRun, loadPipelinesView, PIPELINE_CANNOT_RUN_ITEMS, PIPELINE_NOT_FOUND } from "../../../src/server/pipeline/run-query";
import { checkpoint, cleanup, connections, fixture, pipelineState } from "./support";

it("settings validate names, targets, defaults, direct references and rules without partial writes; archived runs retain their versions", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro" });
  const identity = { projectId: f.projectId, userId: f.userId };
  try {
    const before = await pipelineState(db, f.projectId);
    for (const operation of [
      () => renamePipeline(db, { ...identity, pipelineId: `default_${f.projectId}`, name: " " }),
      () => renamePipeline(db, { ...identity, pipelineId: "missing", name: "Other" }),
      () => archivePipeline(db, { ...identity, pipelineId: `default_${f.projectId}` }),
      () => setPipelineRule(db, { ...identity, type: "bad", pipelineId: null }),
      () => setAutomaticPick(db, { ...identity, enabled: "false" as unknown as boolean }),
    ]) { assert.equal((await operation()).ok, false); assert.deepEqual(await pipelineState(db, f.projectId), before); }
    const add = async (name: string, steps: string[]) => {
      const saved = await savePipelineDefinition(db, { ...identity, pipelineId: null, name, definition: { steps, gates: [] }, expectedVersion: 0 });
      assert.equal(saved.status, "success"); if (saved.status !== "success") throw new Error(JSON.stringify(saved)); return saved.pipelineId;
    };
    const fragment = await add("Check", ["qa"]);
    const runnable = await add("Feature", ["plan", "implement", refStep(fragment), "accept"]);
    for (const pipelineId of [fragment, "missing"]) {
      const reason = pipelineId === fragment ? PIPELINE_CANNOT_RUN_ITEMS : PIPELINE_NOT_FOUND;
      assert.deepEqual(await setDefaultPipeline(db, { ...identity, pipelineId }), { ok: false, reason });
      assert.deepEqual(await setPipelineRule(db, { ...identity, type: "fix", pipelineId }), { ok: false, reason });
    }
    assert.deepEqual(await archivePipeline(db, { ...identity, pipelineId: fragment }), { ok: false, reason: "Can't archive Check: Feature use it." });
    assert.equal((await renamePipeline(db, { ...identity, pipelineId: fragment, name: " Check " })).ok, true);
    assert.equal((await renamePipeline(db, { ...identity, pipelineId: fragment, name: "Feature" })).ok, false);
    assert.equal((await renamePipeline(db, { ...identity, pipelineId: fragment, name: "x".repeat(40) })).ok, true);
    assert.equal((await renamePipeline(db, { ...identity, pipelineId: fragment, name: "x".repeat(41) })).ok, false);
    assert.equal((await renamePipeline(db, { ...identity, pipelineId: fragment, name: "X" })).ok, true);
    const run = await ensureRun(db, f.projectId, f.boardItemId, "in_review", false, runnable);
    assert.equal((await setPipelineRule(db, { ...identity, type: "fix", pipelineId: runnable })).ok, true);
    assert.deepEqual(await archivePipeline(db, { ...identity, pipelineId: runnable }), { ok: false, reason: "Can't archive Feature: the fix rule points to it." });
    assert.equal((await setPipelineRule(db, { ...identity, type: "fix", pipelineId: null })).ok, true);
    assert.equal((await setDefaultPipeline(db, { ...identity, pipelineId: runnable })).ok, true);
    const view = await loadPipelinesView(db, f.projectId);
    assert.equal(view.pipelines[0].id, runnable);
    assert.ok(view.pipelines.find(row => row.id === `default_${f.projectId}`)?.saved, "original virtual default was preserved");
    assert.equal((await setDefaultPipeline(db, { ...identity, pipelineId: `default_${f.projectId}` })).ok, true);
    assert.equal((await archivePipeline(db, { ...identity, pipelineId: runnable })).ok, true);
    assert.deepEqual(await db.pipelineRun.findUniqueOrThrow({ where: { id: run.id }, include: { version: true } }), run);
    assert.equal((await archivePipeline(db, { ...identity, pipelineId: fragment })).ok, true, "archived users no longer block archiving");
    assert.equal((await renamePipeline(db, { ...identity, pipelineId: runnable, name: "Again" })).ok, false);
    await add("Feature", ["qa"]);
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});

it("definition and automatic-picking writes recheck a downgrade committed while they wait for owner locks", async () => {
  const pool = connections(); const [a, b] = pool.all;
  try {
    for (const kind of ["definition", "picking"] as const) {
      const f = await fixture(a, { plan: "pro" }), held = checkpoint(); let pending: Promise<unknown> | undefined;
      try {
        const client = b.$extends({ query: { project: { async findUnique({ args, query }) { const row = await query(args); await held.hook(); return row; } } } }) as unknown as typeof b;
        const identity = { projectId: f.projectId, userId: f.userId };
        pending = kind === "definition" ? savePipelineDefinition(client, { ...identity, pipelineId: null, name: "Late", definition: { steps: ["qa"], gates: [] }, expectedVersion: 0 }) : setAutomaticPick(client, { ...identity, enabled: false });
        await held.entered();
        await a.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${f.userId} FOR UPDATE`;
          await tx.subscription.update({ where: { userId: f.userId }, data: { plan: "free" } });
        });
        const before = await pipelineState(a, f.projectId); held.release();
        assert.deepEqual(await pending, kind === "definition" ? { status: "error", reason: PIPELINE_EDIT_PLAN_GATE } : { ok: false, reason: PIPELINE_EDIT_PLAN_GATE });
        assert.deepEqual(await pipelineState(a, f.projectId), before);
      } finally { held.release(); await pending; await cleanup(a, f.userId); }
    }
  } finally { await pool.disconnect(); }
});

it("all settings recheck owner, availability and Free plan and leave no materialized default on rejection", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro" });
  try {
    const input = { projectId: f.projectId, userId: f.userId, pipelineId: `default_${f.projectId}` };
    const operations = (identity = input) => [
      () => archivePipeline(db, identity), () => renamePipeline(db, { ...identity, name: "Renamed" }),
      () => setDefaultPipeline(db, identity), () => setPipelineRule(db, { ...identity, type: "fix" }),
      () => setAutomaticPick(db, { ...identity, enabled: false }),
    ];
    const unchanged = async (jobs: ReturnType<typeof operations>, reason?: string) => {
      const before = await pipelineState(db, f.projectId);
      for (const job of jobs) { const result = await job(); assert.equal(result.ok, false); if (reason && !result.ok) assert.equal(result.reason, reason); assert.deepEqual(await pipelineState(db, f.projectId), before); }
    };
    await unchanged(operations({ ...input, userId: "other" }));
    await db.project.update({ where: { id: f.projectId }, data: { available: false } }); await unchanged(operations());
    await db.project.update({ where: { id: f.projectId }, data: { disconnectedAt: new Date() } }); await unchanged(operations());
    await db.project.update({ where: { id: f.projectId }, data: { available: true, disconnectedAt: null } });
    await db.subscription.update({ where: { userId: f.userId }, data: { plan: "free" } }); await unchanged(operations(), PIPELINE_EDIT_PLAN_GATE);
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});
