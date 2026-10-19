import assert from "node:assert/strict";
import { it } from "node:test";
import { createBoardService as createBoardQueries } from "../../../src/server/pipeline/api";
import { PIPELINE_CHANGE_UNAVAILABLE } from "../../../src/server/pipeline/board-service";
import { savePipelineDefinition } from "../../../src/server/pipeline/api";
import { ensureRun } from "../../../src/server/pipeline/run-service";
import { loadItemPipelineView, loadPipelineChanges } from "../../../src/server/pipeline/api";
import { createNextDeps } from "../../../src/server/agents/api";
import type { NextDeps } from "../../../src/server/agents/next";
import { afterProjectRead, checkpoint, cleanup, connections, failingEvent, fixture, pipelineState } from "./support";

it("changing a Proposed item replaces its version and entry once, audits names, rejects stale duplicates, and works after downgrade", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro", status: "proposed" });
  try {
    const run = await ensureRun(db, f.projectId, f.boardItemId, "proposed", true);
    const saved = await savePipelineDefinition(db, { projectId: f.projectId, userId: f.userId, pipelineId: null, name: "Hotfix", definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, expectedVersion: 0 });
    assert.ok(saved.status === "success"); if (saved.status !== "success") throw new Error("fixture failed");
    assert.equal((await loadItemPipelineView(db, f.projectId, f.boardItemId)).canChange, true);
    await db.subscription.update({ where: { userId: f.userId }, data: { plan: "free" } });
    const board = createBoardQueries(db), input = { key: f.key, pipelineId: saved.pipelineId, userId: f.userId, expectedUpdatedAt: f.updatedAt };
    assert.deepEqual(await board.changePipeline(f.projectId, input), { ok: true, item: null });
    const changed = await db.pipelineRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.notEqual(changed.versionId, run.version.id); assert.notEqual(changed.entryId, run.entryId); assert.equal(changed.node, "before-plan");
    const row = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId }, include: { events: true } });
    assert.equal(row.updatedAt.getTime(), f.updatedAt.getTime() + 1); assert.equal(row.events.length, 1);
    const note = `pipeline-changed:${run.version.id}:${changed.versionId}`;
    assert.deepEqual([row.events[0].note, row.events[0].actor, row.events[0].channel, row.events[0].from, row.events[0].to], [note, "human", "web", "proposed", "proposed"]);
    const snapshot = await pipelineState(db, f.projectId);
    assert.deepEqual(await board.changePipeline(f.projectId, input), { ok: false, reason: "stale" });
    assert.deepEqual(await pipelineState(db, f.projectId), snapshot);
    assert.deepEqual(await board.changePipeline(f.projectId, { ...input, expectedUpdatedAt: row.updatedAt }), { ok: true, item: null });
    assert.deepEqual(await pipelineState(db, f.projectId), snapshot, "same-version no-op does not append audit");
    assert.equal((await board.gate(f.projectId, { key: f.key, gate: "before-plan", gateEntry: { runId: run.id, entryId: run.entryId! } }, { actor: "human", actorRef: f.userId, channel: "web", expectedUpdatedAt: row.updatedAt })).ok, false);
    await db.pipeline.update({ where: { id: saved.pipelineId }, data: { archivedAt: new Date() } });
    const changes = await loadPipelineChanges(db, f.projectId, [note, "pipeline-changed:bad:missing", "pipeline-changed:bad:too:many", null]);
    assert.deepEqual({ ...changes }, { [note]: { fromName: "Default", toName: "Hotfix" } });
    assert.equal((await loadItemPipelineView(db, f.projectId, f.boardItemId)).name, "Hotfix");
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});

it("changing a pipeline and opening its pre-plan slot serialize in both orders; only one commits", async () => {
  const pool = connections(); const [a, b] = pool.all;
  try {
    for (const openerFirst of [true, false]) {
      const f = await fixture(a, { plan: "pro", status: "proposed" }), held = checkpoint(); let pending: Promise<unknown> | undefined;
      try {
        const identity = { projectId: f.projectId, userId: f.userId };
        for (const [pipelineId, name, steps] of [[`default_${f.projectId}`, undefined, ["doc-auditor", "plan", "implement", "accept"]], [null, "Next", ["plan", "implement", "accept"]]] as const) {
          assert.equal((await savePipelineDefinition(a, { ...identity, pipelineId, name, expectedVersion: 0, definition: { steps: [...steps], gates: ["before-plan"] } })).status, "success");
        }
        const target = await a.pipeline.findFirstOrThrow({ where: { projectId: f.projectId, name: "Next" } });
        const run = await ensureRun(a, f.projectId, f.boardItemId, "proposed", true);
        const scope = { projectId: f.projectId, tokenId: "test" };
        const input = { agent: "doc-auditor", entry: { runId: run.id, entryId: run.entryId!, slotId: "doc-auditor" } };
        const work = async (deps: NextDeps) => { const result = await deps.createRun(scope, "doc-auditor", null, "audit"); assert.ok(result.ok); return { ok: true as const, item: { done: true as const } }; };
        const change = { key: f.key, pipelineId: target.id, userId: f.userId, expectedUpdatedAt: f.updatedAt };
        const delayed = afterProjectRead(b, held.hook);
        pending = openerFirst ? createBoardQueries(delayed).changePipeline(f.projectId, change) : createNextDeps(delayed).withCursor!(scope, input, null, work);
        await held.entered();
        const winner = openerFirst ? await createNextDeps(a).withCursor!(scope, input, null, work) : await createBoardQueries(a).changePipeline(f.projectId, change);
        assert.equal(winner.ok, true); held.release();
        const loser = await pending as { ok: boolean; reason: string };
        assert.equal(loser.ok, false); assert.match(loser.reason, openerFirst ? /nothing has run on it yet/ : /^stale:/);
        assert.equal(await a.agentRun.count({ where: { pipelineRunId: run.id } }), openerFirst ? 1 : 0);
        assert.equal(await a.transitionEvent.count({ where: { boardItemId: f.boardItemId, note: { startsWith: "pipeline-changed:" } } }), openerFirst ? 0 : 1);
      } finally { held.release(); await pending; await cleanup(a, f.userId); }
    }
  } finally { await pool.disconnect(); }
});

it("change refuses non-owners, unavailable projects, advanced or consumed runs, and rolls back on audit failure", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro", status: "proposed" });
  try {
    const run = await ensureRun(db, f.projectId, f.boardItemId, "proposed", true);
    const saved = await savePipelineDefinition(db, { projectId: f.projectId, userId: f.userId, pipelineId: null, name: "Next", definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, expectedVersion: 0 });
    assert.ok(saved.status === "success"); if (saved.status !== "success") throw new Error("fixture failed");
    const board = createBoardQueries(db), input = { key: f.key, pipelineId: saved.pipelineId, userId: f.userId, expectedUpdatedAt: f.updatedAt };
    const refusal = async (patch: Partial<typeof input> = {}, reason?: string) => {
      const row = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
      const before = await pipelineState(db, f.projectId);
      const result = await board.changePipeline(f.projectId, { ...input, expectedUpdatedAt: row.updatedAt, ...patch });
      assert.equal(result.ok, false); if (reason && !result.ok) assert.equal(result.reason, reason);
      assert.deepEqual(await pipelineState(db, f.projectId), before);
    };
    await refusal({ userId: "other" }, "pipeline change access denied");
    await refusal({ pipelineId: "missing" }, "Pipeline not found.");
    await db.project.update({ where: { id: f.projectId }, data: { available: false } }); await refusal();
    await db.project.update({ where: { id: f.projectId }, data: { disconnectedAt: new Date() } }); await refusal();
    await db.project.update({ where: { id: f.projectId }, data: { available: true, disconnectedAt: null } });
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { status: "planning" } }); await refusal({}, PIPELINE_CHANGE_UNAVAILABLE);
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { status: "proposed" } });
    await db.pipelineRun.update({ where: { id: run.id }, data: { closedAt: new Date() } }); await refusal({}, PIPELINE_CHANGE_UNAVAILABLE);
    await db.pipelineRun.update({ where: { id: run.id }, data: { closedAt: null } });
    await db.pipelineVersion.update({ where: { id: run.version.id }, data: { format: null } }); await refusal({}, PIPELINE_CHANGE_UNAVAILABLE);
    await db.pipelineVersion.update({ where: { id: run.version.id }, data: { format: "slots-v1" } });
    const agent = await db.agentRun.create({ data: { projectId: f.projectId, agent: "dev", tokenId: "test", stepId: "start", pipelineRunId: run.id, pipelineEntryId: run.entryId, closedAt: new Date() } });
    await refusal({}, PIPELINE_CHANGE_UNAVAILABLE); await db.agentRun.delete({ where: { id: agent.id } });
    const row = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } }), before = await pipelineState(db, f.projectId);
    await assert.rejects(createBoardQueries(failingEvent(db, "audit failure")).changePipeline(f.projectId, { ...input, expectedUpdatedAt: row.updatedAt }), /audit failure/);
    assert.deepEqual(await pipelineState(db, f.projectId), before);
    await db.pipelineRun.delete({ where: { id: run.id } }); await refusal({}, PIPELINE_CHANGE_UNAVAILABLE);
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { discardedAt: new Date() } }); await refusal();
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});

it("concurrent duplicate pipeline changes have one CAS winner and one audit event", async () => {
  const pool = connections(); const [a, b] = pool.all; const f = await fixture(a, { plan: "pro", status: "proposed" });
  try {
    await ensureRun(a, f.projectId, f.boardItemId, "proposed", true);
    const saved = await savePipelineDefinition(a, { projectId: f.projectId, userId: f.userId, pipelineId: null, name: "Target", definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, expectedVersion: 0 });
    assert.ok(saved.status === "success"); if (saved.status !== "success") throw new Error("fixture failed");
    const input = { key: f.key, pipelineId: saved.pipelineId, userId: f.userId, expectedUpdatedAt: f.updatedAt };
    const results = await Promise.all([createBoardQueries(a).changePipeline(f.projectId, input), createBoardQueries(b).changePipeline(f.projectId, input)]);
    assert.equal(results.filter(row => row.ok).length, 1); assert.deepEqual(results.find(row => !row.ok), { ok: false, reason: "stale" });
    assert.equal(await a.transitionEvent.count({ where: { boardItemId: f.boardItemId, note: { startsWith: "pipeline-changed:" } } }), 1);
  } finally { await cleanup(a, f.userId); await pool.disconnect(); }
});
