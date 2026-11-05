import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { registerTools } from "../../../src/server/mcp/api";
import { createToolDeps } from "../../../src/server/mcp/deps";
import { createBoardService, nextFor } from "../../../src/server/pipeline/api";
import { cleanup, connections, fixture, seedPipelineVersion, type Fixture } from "./support";

type ToolResponse = { isError?: boolean; content: { type: string; text?: string }[] };
type Handler = (input: object, context: object) => Promise<ToolResponse>;

const STOP_RESULT = "Plan verification stopped: 3 consecutive independent passes reported defects.";

async function itemAtVerify(db: PrismaClient): Promise<Fixture> {
  const f = await fixture(db, { status: "in_review", plan: "pro", planPath: "docs/plans/K-1.md", planCommit: "abc1234" });
  const version = await seedPipelineVersion(db, {
    projectId: f.projectId, version: 1, format: "slots-v1", nodes: ["plan", "verify", "implement", "accept"], gates: ["before-implement"], createdBy: f.userId,
  });
  await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "verify", entryId: "verify-entry" } });
  return f;
}

function agentTool(db: PrismaClient, f: Fixture) {
  const handlers: Record<string, Handler> = {};
  const server = { registerTool: (name: string, metadata: unknown, handler: Handler) => { void metadata; handlers[name] = handler; } };
  registerTools(server as unknown as Parameters<typeof registerTools>[0], createToolDeps(db));
  const context = { http: { authInfo: { extra: { projectId: f.projectId, tokenId: "agent" } } } };
  return (name: string, input: object) => handlers[name](input, context);
}

async function readyKeys(db: PrismaClient, f: Fixture): Promise<string[]> {
  const overview = await createToolDeps(db).pipelineNext(f.projectId, undefined);
  assert.ok(overview.ok, JSON.stringify(overview));
  const items = (overview.item as { items: { key: string; action: string }[] }).items;
  return items.filter(item => item.action === "dispatch" || item.action === "accept").map(item => item.key);
}

const row = (db: PrismaClient, f: Fixture) => db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
const cursor = (db: PrismaClient, f: Fixture) => db.pipelineRun.findFirstOrThrow({ where: { boardItemId: f.boardItemId }, orderBy: { createdAt: "desc" } });
const human = (f: Fixture, at: Date) => ({ actor: "human" as const, actorRef: f.userId, channel: "web" as const, expectedUpdatedAt: at });

it("the main loop parks an item stuck at verify on hold, which leaves the ready set and waits for the owner", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await itemAtVerify(db);
    const call = agentTool(db, f);
    const stuck = await nextFor(db, f.projectId, f.key);
    assert.equal(stuck.action, "dispatch");
    assert.equal(stuck.action === "dispatch" ? stuck.agent : null, "plan-verifier");
    assert.deepEqual(await readyKeys(db, f), [f.key]);
    const events = await db.transitionEvent.count({ where: { boardItemId: f.boardItemId } });

    const missingResult = await call("board_transition", { key: f.key, to: "on_hold" });
    const leaveReview = await call("board_transition", { key: f.key, to: "planning", result: STOP_RESULT });
    assert.equal(missingResult.isError, true);
    assert.equal(leaveReview.isError, true);
    assert.equal((await row(db, f)).status, "in_review");
    assert.equal(await db.transitionEvent.count({ where: { boardItemId: f.boardItemId } }), events);

    const parked = await call("board_transition", { key: f.key, to: "on_hold", result: STOP_RESULT });
    assert.notEqual(parked.isError, true, parked.content[0]?.text);
    const held = await row(db, f);
    assert.equal(held.status, "on_hold");
    assert.equal(held.results.at(-1), STOP_RESULT);
    assert.equal(held.planCommit, "abc1234");
    const event = await db.transitionEvent.findFirstOrThrow({ where: { boardItemId: f.boardItemId }, orderBy: { at: "desc" } });
    assert.deepEqual([event.from, event.to, event.actor], ["in_review", "on_hold", "agent"]);
    assert.deepEqual(await readyKeys(db, f), []);

    const resumed = await createBoardService(db).transition(f.projectId, { key: f.key, to: "planning" }, human(f, held.updatedAt));
    assert.ok(resumed.ok, JSON.stringify(resumed));
    assert.equal((await row(db, f)).status, "planning");
    assert.equal((await cursor(db, f)).node, "plan");
    assert.deepEqual(await readyKeys(db, f), [f.key]);
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});

for (const action of ["hold", "send back", "discard"] as const) it(`the owner can ${action} an item stuck at verify from the web`, async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await itemAtVerify(db);
    const board = createBoardService(db);
    const before = await row(db, f);
    assert.deepEqual(await readyKeys(db, f), [f.key]);

    const outcome = action === "discard"
      ? await board.discard(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: before.updatedAt })
      : await board.transition(f.projectId, action === "hold" ? { key: f.key, to: "on_hold", result: "Parked by the owner" } : { key: f.key, to: "planning" }, human(f, before.updatedAt));

    assert.ok(outcome.ok, JSON.stringify(outcome));
    const after = await row(db, f);
    if (action === "hold") {
      assert.equal(after.status, "on_hold");
      assert.deepEqual(await readyKeys(db, f), []);
    } else if (action === "send back") {
      assert.equal(after.status, "planning");
      assert.equal((await cursor(db, f)).node, "plan");
      assert.deepEqual(await readyKeys(db, f), [f.key]);
    } else {
      assert.ok(after.discardedAt);
      assert.ok((await cursor(db, f)).closedAt);
      assert.deepEqual(await readyKeys(db, f), []);
    }
    const event = await db.transitionEvent.findFirstOrThrow({ where: { boardItemId: f.boardItemId }, orderBy: { at: "desc" } });
    assert.deepEqual([event.actor, event.channel], ["human", "web"]);
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});
