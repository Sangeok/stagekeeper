import assert from "node:assert/strict";
import { it } from "node:test";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { readAccountUsage, readAccountUsageIn } from "./account-usage-query";

function accountWithUsage() {
  return {
    usageWindowStartedAt: new Date("2026-10-02T00:00:00Z"),
    usageRunCount: 40,
    subscription: { plan: "pro" },
  };
}

it("reads plan and percentage in one read-only snapshot and sends no raw quota to the client", async () => {
  const calls: string[] = [];
  let transactionOptions: unknown;
  let readOnlyStatement = "";
  const tx = {
    $executeRaw: async (statement: TemplateStringsArray) => {
      calls.push("read-only");
      readOnlyStatement = statement.join("").replace(/\s+/g, " ").trim();
    },
    $queryRaw: async () => {
      calls.push("database-clock");
      return [{ now: new Date("2026-10-02T01:00:00Z") }];
    },
    user: { findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      calls.push(where.id);
      return accountWithUsage();
    } },
  };
  const client = {
    $transaction: async (work: (transaction: typeof tx) => Promise<unknown>, options: unknown) => {
      calls.push("transaction");
      transactionOptions = options;
      return work(tx);
    },
  } as unknown as PrismaClient;

  const result = await readAccountUsage(client, "session-user");

  assert.deepEqual(transactionOptions, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30000 });
  assert.equal(readOnlyStatement, "SET TRANSACTION READ ONLY");
  assert.deepEqual(result, { plan: "pro", usage: { kind: "limited", percent: 40, resetAt: "2026-10-02T05:00:00.000Z" } });
  assert.deepEqual(calls, ["transaction", "read-only", "session-user", "database-clock"]);
  assert.doesNotMatch(JSON.stringify(result), /usageRunCount|"used":|"limit":|Infinity/);
});

it("uses the caller's time without reading the database clock again", async () => {
  const tx = {
    user: { findUniqueOrThrow: async () => accountWithUsage() },
    $queryRaw: async () => { assert.fail("The caller already supplied the database time"); },
  } as unknown as Prisma.TransactionClient;

  const snapshot = await readAccountUsageIn(tx, "session-user", new Date("2026-10-02T01:00:00Z"));

  assert.equal(snapshot.plan, "pro");
  assert.equal(snapshot.percent, 40);
  assert.equal(snapshot.used, 40);
  assert.equal(snapshot.resetAt?.toISOString(), "2026-10-02T05:00:00.000Z");
});

it("propagates a user lookup failure without reading the database clock", async () => {
  const failure = new Error("User unavailable");
  let clockCalls = 0;
  const tx = {
    user: { findUniqueOrThrow: async () => { throw failure; } },
    $queryRaw: async () => {
      clockCalls += 1;
      return [{ now: new Date("2026-10-02T01:00:00Z") }];
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(readAccountUsageIn(tx, "session-user"), (error) => error === failure);
  assert.equal(clockCalls, 0);
});

it("propagates the database clock failure after reading the user", async () => {
  const failure = new Error("Clock unavailable");
  const calls: string[] = [];
  const tx = {
    user: { findUniqueOrThrow: async () => {
      calls.push("user");
      return accountWithUsage();
    } },
    $queryRaw: async () => {
      calls.push("database-clock");
      throw failure;
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(readAccountUsageIn(tx, "session-user"), (error) => error === failure);
  assert.deepEqual(calls, ["user", "database-clock"]);
});

it("propagates a failed account snapshot rather than producing a zero-percent Free result", async () => {
  const client = { $transaction: async () => { throw new Error("Snapshot unavailable"); } } as unknown as PrismaClient;
  await assert.rejects(readAccountUsage(client, "session-user"), /Snapshot unavailable/);
});
