import assert from "node:assert/strict";
import { it } from "node:test";
import { ITEM_TYPES } from "@harness/core/backlog.mjs";
import { createBoardQueries } from "../../../src/server/pipeline/board-query";
import { savePipelineDefinition } from "../../../src/server/pipeline/definition-save-query";
import { setPipelineRule, archivePipeline } from "../../../src/server/pipeline/pipeline-settings-query";
import { PIPELINE_CANNOT_RUN_ITEMS, PIPELINE_NOT_FOUND } from "../../../src/server/pipeline/run-query";
import { cleanup, connections, fixture, pipelineState } from "./support";
import { createToolDeps } from "../../../src/server/mcp/deps";

it("all type rules route agent proposals, null falls back to default, and web choice survives downgrade", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro", status: "done" });
  try {
    const identity = { projectId: f.projectId, userId: f.userId }, board = createBoardQueries(db);
    const saved = await savePipelineDefinition(db, { ...identity, pipelineId: null, name: "Fast", definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, expectedVersion: 0 });
    assert.equal(saved.status, "success"); if (saved.status !== "success") throw new Error("fixture failed");
    for (const type of ITEM_TYPES) assert.equal((await setPipelineRule(db, { ...identity, type, pipelineId: saved.pipelineId })).ok, true);
    for (const [index, type] of [...ITEM_TYPES, null].entries()) {
      const key = `ROUTE-${index}`;
      await db.backlogItem.create({ data: { projectId: f.projectId, key, title: key, area: "web", source: "test", type } });
      const proposed = await board.propose(f.projectId, { key, agent: "dev", reason: "test" }, { actor: "agent", actorRef: "pm" });
      assert.ok(proposed.ok);
      const run = await db.pipelineRun.findUniqueOrThrow({ where: { boardItemId: proposed.item.id }, include: { version: true } });
      assert.equal(run.version.pipelineId, type === null ? `default_${f.projectId}` : saved.pipelineId);
      await db.boardItem.update({ where: { id: proposed.item.id }, data: { status: "done" } });
    }
    await db.subscription.update({ where: { userId: f.userId }, data: { plan: "free" } });
    const key = "WEB";
    await db.backlogItem.create({ data: { projectId: f.projectId, key, title: key, area: "web", source: "test" } });
    const proposed = await board.propose(f.projectId, { key, pipelineId: saved.pipelineId, agent: "dev", reason: "owner" }, { actor: "human", actorRef: f.userId, channel: "web" });
    assert.ok(proposed.ok);
    assert.equal((await db.pipelineRun.findUniqueOrThrow({ where: { boardItemId: proposed.item.id }, include: { version: true } })).version.pipelineId, saved.pipelineId);
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});

it("two pipelines share the project-wide open cap and keep the exact public board response keys", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro", status: "done" });
  try {
    const saved = await savePipelineDefinition(db, { projectId: f.projectId, userId: f.userId, pipelineId: null, name: "Other", definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, expectedVersion: 0 });
    assert.ok(saved.status === "success"); if (saved.status !== "success") throw new Error("fixture failed");
    const board = createBoardQueries(db), tools = createToolDeps(db);
    const ids = [`default_${f.projectId}`, saved.pipelineId, saved.pipelineId];
    for (const [index, pipelineId] of ids.entries()) {
      const key = `CAP-${index}`;
      await db.backlogItem.create({ data: { projectId: f.projectId, key, title: key, area: ".", source: "test" } });
      const before = await pipelineState(db, f.projectId);
      const result = await board.propose(f.projectId, { key, pipelineId, agent: "dev", reason: "owner" }, { actor: "human", actorRef: f.userId, channel: "web" });
      if (index < 2) assert.equal(result.ok, true);
      else { assert.deepEqual(result, { ok: false, reason: "open items: 2 (max 2)" }); assert.deepEqual(await pipelineState(db, f.projectId), before); }
    }
    const keys = ["id", "projectId", "backlogItemId", "agent", "status", "reason", "results", "validation", "acceptedAt", "planPath", "planCommit", "proposedOn", "updatedAt", "discardedAt", "backlogItem"];
    const listed = await tools.boardList(f.projectId, true); assert.equal(listed.length, 2);
    for (const row of listed) { assert.deepEqual(Object.keys(row).sort(), [...keys].sort()); assert.deepEqual(Object.keys(row.backlogItem).sort(), ["area", "key", "title", "type"]); }
    const detail = await tools.boardGet(f.projectId, "CAP-0"); assert.ok(detail);
    assert.deepEqual(Object.keys(detail).sort(), [...keys, "events", "reports", "acceptanceFailures"].sort());
    assert.deepEqual(Object.keys(detail.backlogItem).sort(), ["id", "projectId", "key", "title", "area", "source", "type", "addedBy", "removedReason", "createdAt", "removedAt"].sort());
  } finally { await cleanup(db, f.userId); await pool.disconnect(); }
});

it("virtual default selection succeeds; unavailable targets and held-key proposals have zero writes", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { plan: "pro", status: "on_hold" }), other = await fixture(db, { plan: "pro" });
  try {
    const board = createBoardQueries(db), identity = { projectId: f.projectId, userId: f.userId }, by = { actor: "human" as const, actorRef: f.userId, channel: "web" as const };
    const input = { key: f.key, pipelineId: `default_${f.projectId}`, agent: "dev", reason: "owner" };
    const before = await pipelineState(db, f.projectId);
    assert.deepEqual(await board.propose(f.projectId, input, by), { ok: false, reason: "on hold — only the owner resumes it, on the web" });
    assert.deepEqual(await pipelineState(db, f.projectId), before);
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { status: "done" } });
    const proposed = await board.propose(f.projectId, input, by); assert.ok(proposed.ok);
    if (proposed.ok) await db.boardItem.update({ where: { id: proposed.item.id }, data: { status: "done" } });
    const fragment = await savePipelineDefinition(db, { ...identity, pipelineId: null, name: "Fragment", definition: { steps: ["qa"], gates: [] }, expectedVersion: 0 });
    assert.ok(fragment.status === "success"); if (fragment.status !== "success") throw new Error("fixture failed");
    const foreign = await savePipelineDefinition(db, { projectId: other.projectId, userId: other.userId, pipelineId: null, name: "Other", definition: { steps: ["plan", "implement", "accept"], gates: [] }, expectedVersion: 0 });
    assert.ok(foreign.status === "success"); if (foreign.status !== "success") throw new Error("fixture failed");
    for (const [pipelineId, reason] of [[fragment.pipelineId, PIPELINE_CANNOT_RUN_ITEMS], [foreign.pipelineId, PIPELINE_NOT_FOUND], ["missing", PIPELINE_NOT_FOUND]]) {
      const snapshot = await pipelineState(db, f.projectId);
      assert.deepEqual(await board.propose(f.projectId, { ...input, pipelineId }, by), { ok: false, reason });
      assert.deepEqual(await pipelineState(db, f.projectId), snapshot);
    }
    assert.equal((await archivePipeline(db, { ...identity, pipelineId: fragment.pipelineId })).ok, true);
    const snapshot = await pipelineState(db, f.projectId);
    assert.deepEqual(await board.propose(f.projectId, { ...input, pipelineId: fragment.pipelineId }, by), { ok: false, reason: PIPELINE_NOT_FOUND });
    assert.deepEqual(await pipelineState(db, f.projectId), snapshot);
  } finally { await cleanup(db, f.userId); await cleanup(db, other.userId); await pool.disconnect(); }
});
