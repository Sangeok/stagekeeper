import assert from "node:assert/strict";
import { it } from "node:test";
import { createBoardService } from "../../../src/server/pipeline/api";
import { ensureRun } from "../../../src/server/pipeline/run-service";
import { cleanup, connections, failingEvent, fixture, type Fixture } from "./support";

const human = (f: Fixture, expectedUpdatedAt: Date) =>
  ({ actor: "human" as const, actorRef: f.userId, channel: "web" as const, expectedUpdatedAt });

it("competing plan submissions serialize owner writes and retain both audit events", async () => {
  const { all, disconnect } = connections();
  const [a] = all;
  let userId: string | undefined;
  try {
    const f = await fixture(a, { status: "in_review" });
    userId = f.userId;
    const results = await Promise.all(all.map((db, index) => createBoardService(db)
      .submitPlan(f.projectId, { key: f.key, path: `${index}.md`, commit: `${index}` }, `${index}`)));
    assert.ok(results.every((result) => result.ok));

    const row = await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    const events = await a.transitionEvent.findMany({ where: { boardItemId: f.boardItemId }, orderBy: { at: "asc" } });
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.actorId).sort(), ["0", "1"]);
    assert.equal(row.planPath, `${events[1].actorId}.md`);
    assert.equal(row.planCommit, events[1].actorId);
    assert.equal(row.updatedAt.getTime(), f.updatedAt.getTime() + 2);
  } finally {
    await cleanup(a, userId);
    await disconnect();
  }
});

it("the updatedAt a screen read before another write is stale for transition, discard, and gate alike", async () => {
  const { all: [a], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(a, { status: "in_review" });
    userId = f.userId;
    const board = createBoardService(a);
    await ensureRun(a, f.projectId, f.boardItemId, "in_review", false);
    const screenToken = f.updatedAt;
    assert.equal((await board.submitPlan(f.projectId, { key: f.key, path: "p.md", commit: "c" }, "dev")).ok, true);
    const moved = await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    const pipeline = await a.pipelineRun.findUniqueOrThrow({ where: { boardItemId: f.boardItemId } });
    const gateEntry = { runId: pipeline.id, entryId: pipeline.entryId! };

    assert.deepEqual(await board.transition(f.projectId, { key: f.key, to: "planning", result: "bounce" }, human(f, screenToken)), { ok: false, reason: "stale" });
    assert.deepEqual(await board.discard(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: screenToken }), { ok: false, reason: "stale" });
    assert.deepEqual(await board.gate(f.projectId, { key: f.key, gate: "before-implement", gateEntry }, human(f, screenToken)), { ok: false, reason: "stale" });

    assert.deepEqual(await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } }), moved);
    assert.equal(await a.transitionEvent.count({ where: { boardItemId: f.boardItemId } }), 1);

    assert.equal((await board.gate(f.projectId, { key: f.key, gate: "before-implement", gateEntry }, human(f, moved.updatedAt))).ok, true);
    assert.equal((await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).status, "implementing");
  } finally {
    await cleanup(a, userId);
    await disconnect();
  }
});

it("an event write failure rolls back the board claim in the same transaction", async () => {
  const { all: [a], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(a, { status: "in_review" });
    userId = f.userId;
    const before = await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    await assert.rejects(
      createBoardService(failingEvent(a, "event failure")).submitPlan(f.projectId, { key: f.key, path: "bad.md", commit: "bad" }, "dev"),
      /event failure/,
    );
    assert.deepEqual(await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } }), before);
    assert.equal(await a.transitionEvent.count({ where: { boardItemId: f.boardItemId } }), 0);
  } finally {
    await cleanup(a, userId);
    await disconnect();
  }
});
