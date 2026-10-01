import assert from "node:assert/strict";
import { it } from "node:test";
import { AUTO_SCOUT_DISABLED_REASON } from "@harness/core/pipeline.mjs";
import { setAutomaticScout } from "../../../src/server/automatic-scout";
import { headFor } from "../../../src/server/pipeline/run-query";
import { createNextDeps } from "../../../src/server/agents/runs";
import { createBoardQueries } from "../../../src/server/pipeline/board-query";
import { afterProjectRead, checkpoint, cleanup, connections, fixture, type Fixture } from "./support";
import type { PrismaClient } from "../../../src/generated/prisma/client";

it("Free owners can disable and re-enable automatic scouting without changing the saved item graph", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    const initial = await headFor(db, f.projectId, 0, 0, false);
    assert.equal(initial.action, "dispatch");
    const graph = await db.pipelineVersion.findFirstOrThrow({ where: { projectId: f.projectId } });
    const write = (enabled: boolean) => setAutomaticScout(db, { projectId: f!.projectId, userId: f!.userId, enabled });
    assert.deepEqual(await write(false), { ok: true, item: false });
    assert.deepEqual(await headFor(db, f.projectId, 0, 0, false), { action: "none", reason: AUTO_SCOUT_DISABLED_REASON });
    const pm = await headFor(db, f.projectId, 0, 1, false);
    assert.equal(pm.action, "dispatch"); if (pm.action === "dispatch") assert.equal(pm.agent, "pm");
    assert.deepEqual(await db.pipelineVersion.findFirstOrThrow({ where: { projectId: f.projectId } }), graph);
    assert.deepEqual(await write(true), { ok: true, item: true });
    assert.equal((await headFor(db, f.projectId, 0, 0, false)).action, "dispatch");
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("disabling closes only unbound scout runs, blocks their additions and new instructions, and preserves bound slots", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { plan: "pro" });
    const head = await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "write" } });
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, format: "slots-v1", createdBy: f.userId,
      nodes: ["propose", "plan", "feature-scout", "implement", "accept"], gates: [] } });
    const pipeline = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "feature-scout", entryId: "entry" } });
    const bound = await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "write", pipelineRunId: pipeline.id, pipelineEntryId: "entry" } });
    const pm = await db.agentRun.create({ data: { projectId: f.projectId, agent: "pm", tokenId: "t", stepId: "pick" } });
    assert.equal((await setAutomaticScout(db, { projectId: f.projectId, userId: f.userId, enabled: false })).ok, true);
    assert.ok((await db.agentRun.findUniqueOrThrow({ where: { id: head.id } })).closedAt);
    assert.equal((await db.agentRun.findUniqueOrThrow({ where: { id: bound.id } })).closedAt, null);
    assert.equal((await db.agentRun.findUniqueOrThrow({ where: { id: pm.id } })).closedAt, null);
    const add = (runId: string) => createBoardQueries(db).addBacklog(f!.projectId, { title: "Evidence", area: "web", source: "test", type: "fix", addedBy: "feature-scout", addedByRunId: runId });
    assert.equal((await add(head.id)).ok, false);
    assert.equal((await add(bound.id)).ok, true);
    const execute = createNextDeps(db).withCursor!;
    let served = 0;
    const work = async () => { served++; return { ok: true as const, item: { done: true as const } }; };
    assert.deepEqual(await execute({ projectId: f.projectId, tokenId: "t" }, { agent: "feature-scout" }, null, work), { ok: false, reason: AUTO_SCOUT_DISABLED_REASON });
    assert.equal(served, 0);
    assert.equal((await execute({ projectId: f.projectId, tokenId: "t" }, { agent: "feature-scout", entry: { runId: pipeline.id, entryId: "entry", slotId: "feature-scout" } }, null, work)).ok, true);
    assert.equal(served, 1);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("refuses non-owners and unavailable projects before changing the setting or closing runs", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    const run = await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "write" } });
    assert.equal((await setAutomaticScout(db, { projectId: f.projectId, userId: "not-owner", enabled: false })).ok, false);
    await db.project.update({ where: { id: f.projectId }, data: { available: false } });
    assert.equal((await setAutomaticScout(db, { projectId: f.projectId, userId: f.userId, enabled: false })).ok, false);
    assert.equal((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).autoScoutEnabled, true);
    assert.equal((await db.agentRun.findUniqueOrThrow({ where: { id: run.id } })).closedAt, null);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("preserves a legacy Scout slot's shared run while automatic head scouting is off", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { plan: "pro", status: "done" });
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, createdBy: f.userId,
      nodes: ["plan", "implement", "accept", "scout"], gates: [] } });
    await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "scout" } });
    const scout = await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "write" } });
    assert.equal((await setAutomaticScout(db, { projectId: f.projectId, userId: f.userId, enabled: false })).ok, true);
    assert.equal((await db.agentRun.findUniqueOrThrow({ where: { id: scout.id } })).closedAt, null);
    const execute = createNextDeps(db).withCursor!;
    const work = async () => ({ ok: true as const, item: { done: true as const } });
    assert.equal((await execute({ projectId: f.projectId, tokenId: "t" }, { agent: "feature-scout" }, null, work)).ok, true);
    await db.boardItem.create({ data: { projectId: f.projectId, backlogItemId: f.backlogItemId, agent: "dev", status: "proposed", reason: "New round" } });
    assert.deepEqual(await execute({ projectId: f.projectId, tokenId: "t" }, { agent: "feature-scout" }, null, work), { ok: false, reason: AUTO_SCOUT_DISABLED_REASON });
    const add = await createBoardQueries(db).addBacklog(f.projectId, { title: "Old result", area: "web", source: "test", type: "fix", addedBy: "feature-scout", addedByRunId: scout.id });
    assert.deepEqual(add, { ok: false, reason: AUTO_SCOUT_DISABLED_REASON });
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("a stale backlog_add queued behind disabling cannot add an item after the switch commits", async () => {
  const pool = connections(); const [a, b] = pool.all; let f: Fixture | undefined;
  const saveGate = checkpoint(); const addReached = checkpoint();
  let saving: ReturnType<typeof setAutomaticScout> | undefined;
  let adding: ReturnType<ReturnType<typeof createBoardQueries>["addBacklog"]> | undefined;
  try {
    f = await fixture(a);
    const run = await a.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "write" } });
    const gated = a.$extends({ query: { project: { async update({ args, query }) { await saveGate.hook(); return query(args); } } } }) as unknown as PrismaClient;
    saving = setAutomaticScout(gated, { projectId: f.projectId, userId: f.userId, enabled: false });
    await saveGate.entered();
    adding = createBoardQueries(afterProjectRead(b, addReached.hook)).addBacklog(f.projectId,
      { title: "Late result", area: "web", source: "test", type: "fix", addedBy: "feature-scout", addedByRunId: run.id });
    await addReached.entered(); addReached.release(); saveGate.release();
    assert.equal((await saving).ok, true);
    const refused = await adding; assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.reason, "backlog_add needs an open feature-scout run");
    assert.equal(await a.backlogItem.count({ where: { projectId: f.projectId } }), 1);
  } finally {
    saveGate.release(); addReached.release();
    await Promise.allSettled([saving, adding]); await cleanup(a, f?.userId); await pool.disconnect();
  }
});
