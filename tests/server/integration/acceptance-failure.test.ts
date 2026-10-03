import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { createBoardService } from "../../../src/server/pipeline/board";
import { nextFor } from "../../../src/server/pipeline/run";
import { createToolDeps } from "../../../src/server/mcp/deps";
import { registerTools } from "../../../src/server/mcp/tools";
import { checkpoint, cleanup, connections, failingEvent, fixture, type Fixture } from "./support";

async function acceptanceFixture(db: PrismaClient, format: string | null = "slots-v1") {
  const f = await fixture(db, { status: "done", plan: "pro", validation: "pass", planPath: "plan.md" });
  const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, format, nodes: ["plan", "implement", "accept"], gates: [], createdBy: f.userId } });
  await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "accept", entryId: format ? "entry" : null } });
  await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { removedAt: new Date(), removedReason: "done" } });
  return f;
}
const failInput = (f: Fixture) => ({ key: f.key, checks: [3, 5], note: "missing push" });
const reportInput = (f: Fixture) => ({ key: f.key, actor: "main-loop", path: "docs/agents/main-loop/K-1.md", commit: "abc" });
const current = (db: PrismaClient, f: Fixture) => db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
const human = (f: Fixture, at: Date) => ({ actor: "human" as const, actorRef: f.userId, channel: "web" as const, expectedUpdatedAt: at });

for (const format of [null, "slots-v1"] as const) it(`persists failure → owner retry → success without advancing until acceptance (${format})`, async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await acceptanceFixture(db, format); const board = createBoardService(db);
    const before = await current(db, f); const cursor = await db.pipelineRun.findUniqueOrThrow({ where: { boardItemId: f.boardItemId } });
    const saved = await board.failAcceptance(f.projectId, { ...failInput(f), path: "failure.md", commit: "def" }, "token:agent");
    assert.ok(saved.ok); assert.equal(saved.item.actorId, "token:agent");
    assert.equal((await current(db, f)).updatedAt.getTime(), before.updatedAt.getTime() + 1);
    assert.deepEqual(await db.pipelineRun.findUniqueOrThrow({ where: { boardItemId: f.boardItemId } }), cursor);
    const expected = { key: f.key, node: "accept", version: 1, action: "wait", on: "acceptance", checks: [3, 5], note: "missing push" };
    assert.deepEqual(await nextFor(db, f.projectId, f.key), expected);
    const deps = createToolDeps(db);
    const single = await deps.pipelineNext(f.projectId, f.key); assert.ok(single.ok); assert.deepEqual(single.item, expected);
    const overview = await deps.pipelineNext(f.projectId, undefined); assert.ok(overview.ok); assert.deepEqual((overview.item as { items: unknown[] }).items, [expected]);
    const h: Record<string, (input: object, context: object) => Promise<{ content: { type: string; text?: string }[] }>> = {};
    const server = { registerTool: (name: string, metadata: unknown, handler: typeof h[string]) => { void metadata; h[name] = handler; } };
    registerTools(server as unknown as Parameters<typeof registerTools>[0], deps);
    const response = await h.pipeline_next({ key: f.key }, { http: { authInfo: { extra: { projectId: f.projectId, tokenId: "agent" } } } });
    assert.deepEqual(JSON.parse(response.content[0].text!), expected);
    assert.equal((await board.failAcceptance(f.projectId, failInput(f), "token:other")).ok, false);
    assert.equal((await board.submitReport(f.projectId, reportInput(f), "token:agent")).ok, false);
    assert.ok((await board.submitReport(f.projectId, { ...reportInput(f), actor: "dev" }, "token:agent")).ok);
    const fresh = await current(db, f);
    assert.equal((await board.retryAcceptance(f.projectId, { key: f.key, userId: "foreign", expectedUpdatedAt: fresh.updatedAt })).ok, false);
    assert.deepEqual(await board.retryAcceptance(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: before.updatedAt }), { ok: false, reason: "stale" });
    assert.ok((await board.retryAcceptance(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: fresh.updatedAt })).ok);
    const retryEvent = await db.transitionEvent.findFirstOrThrow({ where: { boardItemId: f.boardItemId, note: "acceptance-retry" } });
    const failure = await db.acceptanceFailure.findUniqueOrThrow({ where: { id: saved.item.id } });
    assert.equal(failure.clearedAt?.getTime(), retryEvent.at.getTime()); assert.equal(retryEvent.actor, "human"); assert.equal(retryEvent.channel, "web");
    const ready = await current(db, f); assert.equal(ready.status, "done"); assert.equal(ready.acceptedAt, null);
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where: { id: f.backlogItemId } })).removedReason, "done");
    assert.equal((await nextFor(db, f.projectId, f.key)).action, "accept");
    assert.ok((await board.submitReport(f.projectId, reportInput(f), "token:agent")).ok);
    assert.ok((await current(db, f)).acceptedAt); assert.ok((await db.pipelineRun.findUniqueOrThrow({ where: { boardItemId: f.boardItemId } })).closedAt);
    assert.equal(await db.acceptanceFailure.count({ where: { boardItemId: f.boardItemId } }), 1);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

for (const to of ["planning", "implementing"]) it(`Reopen ${to} clears failures at its event time and restores backlog`, async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await acceptanceFixture(db); const board = createBoardService(db);
    assert.ok((await board.failAcceptance(f.projectId, failInput(f), "agent")).ok);
    const before = await current(db, f);
    assert.ok((await board.transition(f.projectId, { key: f.key, to, result: "Reopened: code wrong" }, human(f, before.updatedAt))).ok);
    const row = await current(db, f); assert.equal(row.status, to); assert.equal(row.acceptedAt, null); assert.equal(row.validation, to === "planning" ? null : "pass");
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where: { id: f.backlogItemId } })).removedAt, null);
    const event = await db.transitionEvent.findFirstOrThrow({ where: { boardItemId: f.boardItemId, to, from: "done" } });
    const failure = await db.acceptanceFailure.findFirstOrThrow({ where: { boardItemId: f.boardItemId } });
    assert.equal(failure.clearedAt?.getTime(), event.at.getTime());
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("rolls back event faults for both writers and retains old failures outside the History window", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await acceptanceFixture(db); const before = await current(db, f);
    await assert.rejects(createBoardService(failingEvent(db, "fault")).failAcceptance(f.projectId, failInput(f), "agent"), /fault/);
    assert.deepEqual(await current(db, f), before); assert.equal(await db.acceptanceFailure.count({ where: { boardItemId: f.boardItemId } }), 0);
    const saved = await createBoardService(db).failAcceptance(f.projectId, failInput(f), "agent"); assert.ok(saved.ok);
    const active = await current(db, f);
    await assert.rejects(createBoardService(failingEvent(db, "fault")).retryAcceptance(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: active.updatedAt }), /fault/);
    assert.deepEqual(await current(db, f), active); assert.equal((await db.acceptanceFailure.findUniqueOrThrow({ where: { id: saved.item.id } })).clearedAt, null);
    await db.acceptanceFailure.update({ where: { id: saved.item.id }, data: { at: new Date("2020-01-01") } });
    const detail = await createBoardService(db).getWithHistory(f.projectId, f.key, new Date());
    assert.equal(detail?.acceptanceFailures[0]?.id, saved.item.id);
    await db.boardItem.create({ data: { projectId: f.projectId, backlogItemId: f.backlogItemId, status: "done", agent: "dev", reason: "new", proposedOn: new Date(Date.now() + 120000) } });
    assert.equal((await createBoardService(db).retryAcceptance(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: active.updatedAt })).ok, false);
    assert.equal((await db.acceptanceFailure.findUniqueOrThrow({ where: { id: saved.item.id } })).clearedAt, null);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

type Operation = "fail" | "retry" | "report" | "reopen";

it("refuses unsupported/missing entries, closed or wrong cursors, accepted, discarded and unavailable rows without writes", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await acceptanceFixture(db); const board = createBoardService(db);
    const original = await current(db, f);
    const run = await db.pipelineRun.findUniqueOrThrow({ where: { boardItemId: f.boardItemId } });
    const refuse = async () => {
      const before = await current(db, f!);
      assert.equal((await board.failAcceptance(f!.projectId, failInput(f!), "agent")).ok, false);
      assert.deepEqual(await current(db, f!), before);
      assert.equal(await db.acceptanceFailure.count({ where: { boardItemId: f!.boardItemId } }), 0);
      assert.equal(await db.transitionEvent.count({ where: { boardItemId: f!.boardItemId } }), 0);
    };
    await db.pipelineVersion.update({ where: { id: run.versionId }, data: { format: "future" } }); await refuse();
    await db.pipelineVersion.update({ where: { id: run.versionId }, data: { format: "slots-v1" } });
    await db.pipelineRun.update({ where: { id: run.id }, data: { entryId: null } }); await refuse();
    await db.pipelineRun.update({ where: { id: run.id }, data: { entryId: "entry", closedAt: new Date() } }); await refuse();
    await db.pipelineRun.update({ where: { id: run.id }, data: { closedAt: null, node: "before-accept" } }); await refuse();
    await db.pipelineRun.update({ where: { id: run.id }, data: { node: "accept" } });
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { acceptedAt: new Date() } }); await refuse();
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { acceptedAt: null, discardedAt: new Date() } }); await refuse();
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { discardedAt: null } });
    await db.project.update({ where: { id: f.projectId }, data: { available: false } }); await refuse();
    await db.project.update({ where: { id: f.projectId }, data: { available: true } });
    assert.equal((await board.failAcceptance(f.projectId, { ...failInput(f), key: "other-project-key" }, "agent")).ok, false);
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { updatedAt: original.updatedAt } });
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});
for (const [first, second, initiallyFailed, expected] of [
  ["fail", "fail", false, [true, false]], ["retry", "retry", true, [true, false]],
  ["fail", "report", false, [true, false]], ["report", "fail", false, [true, false]],
  ["retry", "reopen", true, [true, false]], ["reopen", "retry", true, [true, false]],
  ["retry", "fail", true, [true, true]], ["fail", "retry", true, [false, true]],
] as const) it(`serializes real connections: ${first} then ${second}`, async () => {
  const pool = connections(2); const [a, b] = pool.all; let f: Fixture | undefined;
  const locked = checkpoint(), attempted = checkpoint(); let one: Promise<unknown> | undefined, two: Promise<unknown> | undefined;
  try {
    f = await acceptanceFixture(a);
    if (initiallyFailed) assert.ok((await createBoardService(a).failAcceptance(f.projectId, failInput(f), "initial")).ok);
    const at = (await current(a, f)).updatedAt;
    const holder = a.$extends({ query: { async $queryRaw({ args, query }) {
      const result = await query(args);
      if (JSON.stringify(args).includes("User") && JSON.stringify(args).includes("FOR UPDATE")) await locked.hook();
      return result;
    } } }) as unknown as PrismaClient;
    const contender = b.$extends({ query: { async $queryRaw({ args, query }) {
      if (JSON.stringify(args).includes("User") && JSON.stringify(args).includes("FOR UPDATE")) { attempted.release(); await attempted.hook(); }
      return query(args);
    } } }) as unknown as PrismaClient;
    const operate = (db: PrismaClient, operation: Operation) => {
      const board = createBoardService(db); const item = f!;
      if (operation === "fail") return board.failAcceptance(item.projectId, failInput(item), operation);
      if (operation === "retry") return board.retryAcceptance(item.projectId, { key: item.key, userId: item.userId, expectedUpdatedAt: at });
      if (operation === "report") return board.submitReport(item.projectId, reportInput(item), operation);
      return board.transition(item.projectId, { key: item.key, to: "implementing", result: "code wrong" }, human(item, at));
    };
    const p1 = operate(holder, first); one = p1; await locked.entered();
    const p2 = operate(contender, second); two = p2; await attempted.entered(); locked.release();
    const result = await Promise.all([p1, p2]); assert.deepEqual(result.map(r => r.ok), expected);
    const events = await a.transitionEvent.findMany({ where: { boardItemId: f.boardItemId } });
    assert.equal(events.length, Number(initiallyFailed) + expected.filter(Boolean).length);
    assert.equal((await current(a, f)).updatedAt.getTime(), f.updatedAt.getTime() + Number(initiallyFailed) + expected.filter(Boolean).length + (first === "report" ? 1 : 0));
  } finally {
    locked.release(); attempted.release(); await Promise.allSettled([one, two].filter(Boolean));
    await cleanup(a, f?.userId); await pool.disconnect();
  }
});
