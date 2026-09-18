import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBoardQueries } from "./board-query";

type Tx = Parameters<ReturnType<typeof createBoardQueries>["advanceRun"]>[0];
const asTx = (fake: object): Tx => fake as unknown as Tx;
// advanceRun/transitionIn take the transaction client, so these exercise the real
// seam without faking gate()'s post-commit nextFor read.
const client = {} as PrismaClient;

it("a matching gateEntry is the only thing that opens the cursor's gate", async () => {
  // readFacts returns approvedGates: [] for every slots-v1 run; advanceRun injects the
  // approval for the entry the owner actually read. Drop that injection and the cursor
  // stalls at the gate forever — this is the test that fails when it goes.
  const version = { id: "version", version: 1, format: "slots-v1", nodes: ["plan", "implement", "accept"], gates: ["before-accept"] };
  const run = { id: "pipeline", node: "before-accept", entryId: "entry", enteredAt: new Date(0), closedAt: null, version };
  const fixture = () => {
    const moves: { where: { node: string }; data: { node: string } }[] = [];
    return {
      moves,
      tx: asTx({
        $queryRaw: async () => [],
        boardItem: { findFirst: async () => ({ id: "item", status: "done", validation: null, acceptedAt: null, updatedAt: new Date(0), backlogItemId: "backlog", agent: "dev", backlogItem: { key: "KEY" }, _count: { reports: 1 } }) },
        pipelineRun: {
          findUnique: async () => run,
          updateMany: async (args: { where: { node: string }; data: { node: string } }) => { moves.push(args); return { count: 1 }; },
        },
      }),
    };
  };

  const current = fixture();
  await createBoardQueries(client).advanceRun(current.tx, "project", "KEY", { runId: "pipeline", entryId: "entry" });
  assert.equal(current.moves.length, 1, "the read entry opens its own gate");
  assert.equal(current.moves[0].where.node, "before-accept");
  assert.equal(current.moves[0].data.node, "accept");

  for (const stale of [{ runId: "pipeline", entryId: "old" }, { runId: "old", entryId: "entry" }, undefined]) {
    const other = fixture();
    await createBoardQueries(client).advanceRun(other.tx, "project", "KEY", stale);
    assert.deepEqual(other.moves, [], `${JSON.stringify(stale)} must not move the cursor`);
  }
});

// The implementation span ends when the last slot before accept is complete. The server
// writes done itself — no agent rule exists for it — and transitionIn guards that write.
function spanFixture({ slotClosed = true } = {}) {
  const version = { id: "version", version: 1, format: "slots-v1", nodes: ["plan", "implement", "doc-auditor#2", "accept"], gates: [] };
  const run = { id: "pipeline", node: "doc-auditor#2", entryId: "entry", enteredAt: new Date(0), closedAt: null, version };
  const events: { actor: string; actorId: string; from: string; to: string }[] = [];
  const writes: { status?: string }[] = [];
  const tx = asTx({
    $queryRaw: async () => [],
    boardItem: {
      findFirst: async () => ({ id: "item", status: "implementing", validation: null, acceptedAt: null, planPath: "docs/plans/KEY.md", results: [], updatedAt: new Date(0), backlogItemId: "backlog", agent: "dev", backlogItem: { key: "KEY" }, _count: { reports: 1 } }),
      findUniqueOrThrow: async () => ({ id: "item", status: "done" }),
      updateMany: async (args: { data: { status?: string } }) => { writes.push(args.data); return { count: 1 }; },
    },
    backlogItem: { update: async () => ({}) },
    agentRun: { findFirst: async () => (slotClosed ? { id: "closed-audit" } : null), updateMany: async () => ({ count: 0 }) },
    transitionEvent: { create: async (args: { data: { actor: string; actorId: string; from: string; to: string } }) => { events.push(args.data); return { at: new Date(1) }; } },
    pipelineRun: { findUnique: async () => run, updateMany: async () => ({ count: 1 }) },
  });
  return { tx, events, writes };
}

it("the server closes the implementation span with actor pipeline and its fixed result", async () => {
  const f = spanFixture();
  await createBoardQueries(client).advanceRun(f.tx, "project", "KEY");
  assert.deepEqual(f.writes.map((w) => w.status), ["done"], "exactly one status write, and it is done");
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].actor, "pipeline", "an agent rule for done no longer exists");
  assert.equal(f.events[0].actorId, "pipeline:version", "the audit row names the graph that closed the span");
  assert.equal(f.events[0].from, "implementing");
  assert.equal(f.events[0].to, "done");
});

it("an unfinished slot leaves the span open", async () => {
  const f = spanFixture({ slotClosed: false });
  await createBoardQueries(client).advanceRun(f.tx, "project", "KEY");
  assert.deepEqual(f.writes, [], "no status write");
  assert.deepEqual(f.events, [], "no audit row");
});

it("a pipeline done that the graph did not produce is refused before any write", async () => {
  for (const [actorRef, result] of [
    ["pipeline:version", "done"],
    ["pipeline:other", "Implementation span completed."],
  ] as const) {
    const f = spanFixture();
    const refused = await createBoardQueries(client).transitionIn(
      f.tx, "project", { key: "KEY", to: "done", result }, { actor: "pipeline", actorRef },
    );
    assert.equal(refused.ok, false);
    assert.equal(refused.ok === false ? refused.reason : "", "implementation span is not complete");
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.events, []);
  }
});

it("failed approval rolls back lazy PipelineRun materialization", async () => {
  let materialized: unknown = null;
  let creates = 0;
  const version = { id: "version", version: 1, nodes: ["plan", "implement", "accept"], gates: ["before-plan"], format: "slots-v1" };
  const tx = {
    $queryRaw: async () => [],
    $executeRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      creates++;
      materialized = { id: values[0], boardItemId: values[1], versionId: values[2], node: values[3], entryId: values[4], version, closedAt: null };
      return 1;
    },
    boardItem: { findFirst: async () => ({ id: "item", status: "proposed", validation: null, planCommit: null, updatedAt: new Date(0) }) },
    project: {
      findUnique: async () => ({ ownerUserId: "owner", repoOwner: "repo", available: true, ownerUser: { subscription: { plan: "pro" } } }),
      findUniqueOrThrow: async () => ({ ownerUserId: "owner" }),
    },
    pipelineVersion: { findFirst: async () => version },
    pipelineRun: {
      findUnique: async () => materialized,
      findUniqueOrThrow: async () => materialized,
    },
  };
  const rollbackClient = { $transaction: async (work: (db: typeof tx) => Promise<unknown>) => {
    const before = materialized;
    try { return await work(tx); } catch (error) { materialized = before; throw error; }
  } } as unknown as PrismaClient;
  const result = await createBoardQueries(rollbackClient).gate("project", { key: "KEY", gate: "before-plan", gateEntry: { runId: "old", entryId: "old" } }, { actor: "human", actorRef: "owner", channel: "web", expectedUpdatedAt: new Date(0) });
  assert.equal(result.ok, false);
  assert.equal(creates, 1, "exercise the actual materializing path");
  assert.equal(materialized, null, "rejection must escape the transaction before mapping to ServerResult");
});
