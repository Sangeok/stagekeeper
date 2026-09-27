import assert from "node:assert/strict";
import { it } from "node:test";
import { Prisma, type PrismaClient } from "../../../src/generated/prisma/client";
import { createBoardService } from "../../../src/server/pipeline/board";
import { ensureRun } from "../../../src/server/pipeline/run-query";
import { createToolDeps } from "../../../src/server/mcp/deps";
import { agentNext, type NextDeps } from "../../../src/server/agents/next";
import { createNextDeps } from "../../../src/server/agents/runs";
import { cursorTransaction } from "../../../src/server/agents/run-query";
import { afterBacklogCount, afterBoardList, afterProjectRead, beforeRunClaim, checkpoint, cleanup, connections, failingEvent, fixture, type Fixture } from "./support";

const ownerInput = { title: "A concrete problem", area: "", source: "", type: null, addedBy: "owner" as const, addedByRunId: null };
const scoutInput = (runId: string) => ({ ...ownerInput, type: "fix", area: ".", source: "Evidence: our hole\nObserved: wrong output\nConfirmed: app.ts:1\nEffect: quality\nCost: app/dev", addedBy: "feature-scout" as const, addedByRunId: runId });
const scoutRun = (db: PrismaClient, projectId: string) => db.agentRun.create({ data: { projectId, agent: "feature-scout", tokenId: "test", stepId: "report" } });

it("pipeline completion removes as done and reopening clears both removal fields", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { status: "implementing" }); const service = createBoardService(db);
    const pipeline = await ensureRun(db, f.projectId, f.boardItemId, "implementing", false);
    await db.agentRun.create({ data: { projectId: f.projectId, agent: "dev", key: f.key, tokenId: "test", stepId: "report", closedAt: new Date(),
      pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId,
      steps: { create: [{ stepId: "verify", outcome: "ok", accepted: true }, { stepId: "report", outcome: "ok", accepted: true }] },
      reports: { create: { boardItemId: f.boardItemId, actor: "dev", path: "report.md", commit: "abc", isAcceptance: false } },
    } });
    await service.advancePipeline(f.projectId, f.key);
    const completed = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } }); assert.equal(completed.status, "done");
    const removed = await db.backlogItem.findUniqueOrThrow({ where: { id: f.backlogItemId } });
    assert.ok(removed.removedAt); assert.equal(removed.removedReason, "done");
    const reopened = await service.transition(f.projectId, { key: f.key, to: "planning", result: "Acceptance needs another plan" },
      { actor: "human", actorRef: f.userId, channel: "web", expectedUpdatedAt: completed.updatedAt });
    assert.ok(reopened.ok);
    const live = await db.backlogItem.findUniqueOrThrow({ where: { id: f.backlogItemId } });
    assert.equal(live.removedAt, null); assert.equal(live.removedReason, null);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("owner and scout additions assign immutable numeric keys, provenance and public views", async () => {
  const pool = connections(1); const [db] = pool.all;
  let f: Fixture | undefined;
  try {
    f = await fixture(db);
    const service = createBoardService(db);
    const run = await scoutRun(db, f.projectId);
    assert.deepEqual(await service.addBacklog(f.projectId, { ...ownerInput, title: " " }), { ok: false, reason: "Title is required." });
    assert.deepEqual(await service.addBacklog(f.projectId, ownerInput), { ok: true, item: { key: "ITEM-01" } });
    assert.deepEqual(await service.addBacklog(f.projectId, scoutInput(run.id)), { ok: true, item: { key: "ITEM-02" } });
    assert.deepEqual(await service.removeBacklog(f.projectId, "ITEM-02"), { ok: true, item: null });
    assert.deepEqual(await service.addBacklog(f.projectId, ownerInput), { ok: true, item: { key: "ITEM-03" } });
    const scout = await db.backlogItem.findUniqueOrThrow({ where: { projectId_key: { projectId: f.projectId, key: "ITEM-02" } } });
    assert.equal(scout.typeSetBy, "feature-scout"); assert.equal(scout.addedByRunId, run.id); assert.equal(scout.removedReason, "owner");
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { type: "docs", typeSetBy: "owner", addedByRunId: "internal" } });
    await db.transitionEvent.create({ data: { boardItemId: f.boardItemId, from: "planning", to: "in_review", actor: "agent" } });
    await db.report.create({ data: { boardItemId: f.boardItemId, actor: "dev", path: "report.md", commit: "abc" } });
    const tools = createToolDeps(db);
    const detail = await tools.boardGet(f.projectId, f.key);
    assert.ok(detail); assert.equal(detail.events.length, 1); assert.equal(detail.reports[0].path, "report.md");
    const responses = [await tools.backlogList(f.projectId, true), await tools.backlogGet(f.projectId, f.key),
      await tools.boardList(f.projectId, false), detail,
      await tools.transition(f.projectId, { key: f.key, to: "in_review" }, "test")];
    for (const response of responses) assert.doesNotMatch(JSON.stringify(response), /typeSetBy|addedByRunId|internal/);
    assert.match(JSON.stringify(detail), /"source":"test"/);
    assert.match(JSON.stringify(responses[0]), /"addedBy":"feature-scout"/);
    assert.match(JSON.stringify(responses[2]), /"type":"docs"/);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("scout allowance counts removed writes and refuses foreign, closed, missing and non-scout runs", async () => {
  const pool = connections(1); const [db] = pool.all;
  let f: Fixture | undefined; let other: Fixture | undefined;
  try {
    f = await fixture(db); other = await fixture(db);
    const service = createBoardService(db); const run = await scoutRun(db, f.projectId);
    for (let i = 0; i < 3; i++) {
      const result = await service.addBacklog(f.projectId, scoutInput(run.id)); assert.ok(result.ok);
      assert.equal((await service.removeBacklog(f.projectId, result.item.key)).ok, true);
    }
    assert.deepEqual(await service.addBacklog(f.projectId, scoutInput(run.id)), { ok: false, reason: "this run already added 3 items" });
    const foreign = await scoutRun(db, other.projectId);
    const wrongAgent = await db.agentRun.create({ data: { projectId: f.projectId, agent: "pm", stepId: "report", tokenId: "test" } });
    const closed = await scoutRun(db, f.projectId); await db.agentRun.update({ where: { id: closed.id }, data: { closedAt: new Date() } });
    for (const id of ["missing", foreign.id, wrongAgent.id, closed.id]) {
      assert.deepEqual(await service.addBacklog(f.projectId, scoutInput(id)), { ok: false, reason: "backlog_add needs an open feature-scout run" });
    }
    assert.equal(await db.backlogItem.count({ where: { projectId: f.projectId } }), 4);
  } finally { await cleanup(db, f?.userId); await cleanup(db, other?.userId); await pool.disconnect(); }
});

it("type edits preserve ownership, reject stale drafts atomically and clear to null", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db); const service = createBoardService(db);
    const where = { id: f.backlogItemId };
    const edit = { title: "Edited title", area: ".", source: "source", type: "fix", typeBefore: "fix" };
    await db.backlogItem.update({ where, data: { type: "fix", typeSetBy: "feature-scout" } });
    assert.equal((await service.updateBacklog(f.projectId, f.key, edit)).ok, true);
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where })).typeSetBy, "feature-scout");
    assert.equal((await service.submitPlan(f.projectId, { key: f.key, path: "plan.md", commit: "c", type: "docs" }, "dev")).ok, true);
    const before = await db.backlogItem.findUniqueOrThrow({ where }); assert.equal(before.typeSetBy, "dev");
    assert.deepEqual(await service.updateBacklog(f.projectId, f.key, { ...edit, title: "Must not save", type: "feat" }),
      { ok: false, reason: "The item changed. Refresh and try again." });
    assert.deepEqual(await db.backlogItem.findUniqueOrThrow({ where }), before);
    assert.equal((await service.updateBacklog(f.projectId, f.key, { ...edit, type: "feat", typeBefore: "docs" })).ok, true);
    const kept = await service.submitPlan(f.projectId, { key: f.key, path: "plan.md", commit: "c2", type: "fix" }, "dev");
    assert.ok(kept.ok); assert.equal(kept.item.typeKept, "owner");
    const same = await service.submitPlan(f.projectId, { key: f.key, path: "plan.md", commit: "c3", type: "feat" }, "dev");
    assert.ok(same.ok); assert.equal(same.item.typeKept, undefined);
    assert.equal((await service.updateBacklog(f.projectId, f.key, { ...edit, type: "", typeBefore: "feat" })).ok, true);
    const cleared = await db.backlogItem.findUniqueOrThrow({ where }); assert.equal(cleared.type, null); assert.equal(cleared.typeSetBy, null);
    await service.submitPlan(f.projectId, { key: f.key, path: "plan.md", commit: "c4", type: "refactor" }, "dev");
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where })).typeSetBy, "dev");
    await assert.rejects(createBoardService(failingEvent(db, "rollback")).submitPlan(f.projectId,
      { key: f.key, path: "bad", commit: "bad", type: "fix" }, "dev"), /rollback/);
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where })).type, "refactor");
    const noType = await service.submitPlan(f.projectId, { key: f.key, path: "p", commit: "c5" }, "dev"); assert.ok(noType.ok);
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where })).type, "refactor");
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("planning submission also keeps owner type, and proposed discard removes only after a valid CAS", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { status: "planning" }); const service = createBoardService(db);
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { type: "feat", typeSetBy: "owner" } });
    const plan = await service.submitPlan(f.projectId, { key: f.key, path: "p", commit: "c", type: "fix" }, "dev");
    assert.ok(plan.ok); assert.equal(plan.item.typeKept, "owner"); assert.equal(plan.item.status, "in_review");
    const removeOpen = await service.removeBacklog(f.projectId, f.key); assert.equal(removeOpen.ok, false);
    assert.equal((await service.discard(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: plan.item.updatedAt })).ok, true);
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where: { id: f.backlogItemId } })).removedAt, null);
    const proposed = await service.propose(f.projectId, { key: f.key, agent: "dev", reason: "again" }, { actor: "agent", actorRef: "pm" }); assert.ok(proposed.ok);
    assert.equal((await service.discard(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: new Date(0) })).ok, false);
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where: { id: f.backlogItemId } })).removedAt, null);
    assert.equal((await service.discard(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: proposed.item.updatedAt })).ok, true);
    const removed = await db.backlogItem.findUniqueOrThrow({ where: { id: f.backlogItemId } });
    assert.ok(removed.removedAt); assert.equal(removed.removedReason, "discarded");
    assert.equal((await service.propose(f.projectId, { key: f.key, agent: "dev", reason: "again" }, { actor: "agent", actorRef: "pm" })).ok, false);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

// Capture rejection immediately so the deliberately delayed loser cannot be unhandled.
const settled = <T>(promise: Promise<T>) => promise.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));

for (const quota of ["live", "run"] as const) it(`serialized additions enforce the ${quota} quota with two real connections`, async () => {
  const pool = connections(); const [a, b] = pool.all; let f: Fixture | undefined;
  const counted = checkpoint(); const rivalRead = checkpoint(); rivalRead.release();
  const pending: Promise<unknown>[] = [];
  try {
    f = await fixture(a); const run = await scoutRun(a, f.projectId); const service = createBoardService(a);
    if (quota === "live") for (let i = 0; i < 8; i++) assert.equal((await service.addBacklog(f.projectId, ownerInput)).ok, true);
    else for (let i = 0; i < 2; i++) assert.equal((await service.addBacklog(f.projectId, scoutInput(run.id))).ok, true);
    const firstDb = afterBacklogCount(a, async (where) => {
      if (quota === "run" ? where?.addedByRunId === run.id : where?.removedAt === null) await counted.hook();
    });
    const first = settled(createBoardService(firstDb).addBacklog(f.projectId, quota === "live" ? ownerInput : scoutInput(run.id))); pending.push(first);
    await counted.entered();
    const second = settled(createBoardService(afterProjectRead(b, rivalRead.hook)).addBacklog(f.projectId, scoutInput(run.id))); pending.push(second);
    await rivalRead.entered(); counted.release();
    const winner = await first; assert.ok(winner.ok && winner.value.ok);
    const loser = await second; assert.ok(loser.ok && !loser.value.ok);
    assert.match(loser.value.reason, quota === "run" ? /already added 3 items/ : /backlog cap/);
    assert.equal(await a.backlogItem.count({ where: quota === "run" ? { addedByRunId: run.id } : { projectId: f.projectId, removedAt: null } }), quota === "run" ? 3 : 10);
  } finally { counted.release(); rivalRead.release(); await Promise.allSettled(pending); await cleanup(a, f?.userId); await pool.disconnect(); }
});

for (const winner of ["remove", "propose"] as const) it(`remove/propose race: ${winner} wins without a removed open item`, async () => {
  const pool = connections(); const [a, b] = pool.all; let f: Fixture | undefined;
  const removePaused = checkpoint(); const proposalRead = checkpoint(); proposalRead.release();
  const pending: Promise<unknown>[] = [];
  try {
    f = await fixture(a); await a.boardItem.delete({ where: { id: f.boardItemId } });
    const removeDb = winner === "remove" ? afterBoardList(a, removePaused.hook) : afterProjectRead(a, removePaused.hook);
    const remove = settled(createBoardService(removeDb).removeBacklog(f.projectId, f.key)); pending.push(remove);
    await removePaused.entered();
    const propose = settled(createBoardService(afterProjectRead(b, proposalRead.hook)).propose(f.projectId,
      { key: f.key, agent: "dev", reason: "test" }, { actor: "agent", actorRef: "pm" })); pending.push(propose);
    await proposalRead.entered();
    if (winner === "propose") { const result = await propose; assert.ok(result.ok && result.value.ok); }
    removePaused.release();
    const [removed, proposed] = await Promise.all([remove, propose]);
    const item = await a.backlogItem.findUniqueOrThrow({ where: { id: f.backlogItemId } });
    const open = await createBoardService(a).latestBoard(f.projectId, true);
    if (winner === "remove") {
      assert.ok(removed.ok && removed.value.ok); assert.equal(proposed.ok, false);
      if (!proposed.ok) { assert.ok(proposed.error instanceof Prisma.PrismaClientKnownRequestError); assert.equal(proposed.error.code, "P2034"); }
      assert.equal(item.removedReason, "owner"); assert.equal(open.length, 0);
    } else {
      assert.ok(removed.ok && !removed.value.ok); assert.match(removed.value.reason, /item changed|open on the board/);
      assert.equal(item.removedAt, null); assert.equal(open.length, 1);
    }
  } finally { removePaused.release(); proposalRead.release(); await Promise.allSettled(pending); await cleanup(a, f?.userId); await pool.disconnect(); }
});

function reportDeps(db: PrismaClient): NextDeps {
  const deps = createNextDeps(db);
  deps.template = async () => "# scout\n\n## step:report\nSend ok.\n\nnext: done\n";
  deps.vars = async () => ({});
  deps.withCursor = cursorTransaction(db, deps);
  return deps;
}

for (const winner of ["close", "add"] as const) it(`run close/add race: ${winner} commits first under the owner lock`, async () => {
  const pool = connections(); const [a, b] = pool.all; let f: Fixture | undefined;
  const paused = checkpoint(); const rivalRead = checkpoint(); rivalRead.release();
  const pending: Promise<unknown>[] = [];
  try {
    f = await fixture(a); const run = await scoutRun(a, f.projectId);
    const input = { agent: "feature-scout", outcome: "ok" as const, receipt: { runId: run.id, stepId: "report", revision: 0 } };
    const scope = { projectId: f.projectId, tokenId: "test" };
    const closeDb = winner === "close" ? beforeRunClaim(a, paused.hook) : afterProjectRead(b, rivalRead.hook);
    const addDb = winner === "add" ? afterBacklogCount(a, paused.hook) : afterProjectRead(b, rivalRead.hook);
    const close = () => settled(agentNext(reportDeps(closeDb), scope, input));
    const add = () => settled(createBoardService(addDb).addBacklog(scope.projectId, scoutInput(run.id)));
    const first = winner === "close" ? close() : add(); pending.push(first);
    await paused.entered();
    const second = winner === "close" ? add() : close(); pending.push(second);
    await rivalRead.entered(); paused.release();
    const won = await first; assert.ok(won.ok && won.value.ok);
    const later = await second; assert.ok(later.ok);
    if (winner === "close") { assert.equal(later.value.ok, false); if (!later.value.ok) assert.match(later.value.reason, /open feature-scout run/); }
    else assert.equal(later.value.ok, true);
    assert.equal(await a.backlogItem.count({ where: { addedByRunId: run.id } }), winner === "add" ? 1 : 0);
    const closed = await a.agentRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: true } });
    assert.ok(closed.closedAt); assert.equal(closed.steps[0]?.accepted, true); assert.equal(closed.steps[0]?.outcome, "ok");
  } finally { paused.release(); rivalRead.release(); await Promise.allSettled(pending); await cleanup(a, f?.userId); await pool.disconnect(); }
});
