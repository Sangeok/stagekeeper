import assert from "node:assert/strict";
import { it } from "node:test";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { cleanupExpiredConnections } from "../../src/server/github/maintenance-cleanup.server";

function database(run: () => number, pending: boolean) {
  let queries = 0;
  const transaction = {
    $executeRaw: async () => 1,
    $queryRaw: async (query: Prisma.Sql) => {
      if (query.text.includes("AS pending")) return [{ pending }];
      queries++;
      return [{ count: run() }];
    },
  };
  const client = { $transaction: async (body: (tx: typeof transaction) => Promise<unknown>) => body(transaction) } as unknown as PrismaClient;
  return { client, queries: () => queries };
}

it("bounds a continuously full cleanup backlog and gives each category a turn", async () => {
  const db = database(() => 500, true);
  const result = await cleanupExpiredConnections(db.client, { now: new Date(), monotonicNow: () => 0 });
  assert.deepEqual(result, { attemptsDeleted: 20_000, deliveriesDeleted: 20_000, connectionsExpired: 40_000, cleanupComplete: false, cleanupBatches: 160 });
  assert.equal(db.queries(), 160);
});

it("stops starting batches at the time budget and reports remaining work", async () => {
  let elapsed = 0;
  const db = database(() => { elapsed = 60_000; return 500; }, true);
  const result = await cleanupExpiredConnections(db.client, { now: new Date(), monotonicNow: () => elapsed });
  assert.equal(db.queries(), 1);
  assert.equal(result.attemptsDeleted, 500);
  assert.equal(result.cleanupComplete, false);
});

it("does not repeat exhausted categories and confirms a drained backlog", async () => {
  const db = database(() => 2, false);
  const result = await cleanupExpiredConnections(db.client, { now: new Date() });
  assert.equal(result.cleanupComplete, true);
  assert.equal(result.cleanupBatches, 4);
  assert.equal(db.queries(), 4);
});

it("propagates database failures without retrying an uncertain batch", async () => {
  const db = database(() => { throw new Error("database failure"); }, true);
  await assert.rejects(cleanupExpiredConnections(db.client, { now: new Date() }), /database failure/);
  assert.equal(db.queries(), 1);
});
