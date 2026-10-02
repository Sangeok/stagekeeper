import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { readAccountUsage } from "./account-usage-query";

it("reads plan and percentage in one read-only snapshot and sends no raw quota to the client", async () => {
  const calls: string[] = [];
  const tx = {
    $executeRaw: async () => { calls.push("read-only"); },
    $queryRaw: async () => [{ now: new Date("2026-10-02T01:00:00Z") }],
    user: { findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      calls.push(where.id);
      return { usageWindowStartedAt: new Date("2026-10-02T00:00:00Z"), usageRunCount: 40, subscription: { plan: "pro" } };
    } },
  };
  const client = { $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => { calls.push("transaction"); return work(tx); } } as unknown as PrismaClient;
  const result = await readAccountUsage(client, "session-user");
  assert.deepEqual(result, { plan: "pro", usage: { kind: "limited", percent: 40, resetAt: "2026-10-02T05:00:00.000Z" } });
  assert.deepEqual(calls, ["transaction", "read-only", "session-user"]);
  assert.doesNotMatch(JSON.stringify(result), /usageRunCount|"used":|"limit":|Infinity/);
});

it("propagates a failed account snapshot rather than producing a zero-percent Free result", async () => {
  const client = { $transaction: async () => { throw new Error("Snapshot unavailable"); } } as unknown as PrismaClient;
  await assert.rejects(readAccountUsage(client, "session-user"), /Snapshot unavailable/);
});
