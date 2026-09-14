import assert from "node:assert/strict";
import { it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { readProjectAccess, READ_OPTIONS, NOT_SELECTED_REASON, type TransactionHost } from "./project-access-query";

it("reads access in a read-only snapshot and fails closed for missing direct ownership", async () => {
  for (const row of [null, { ownerUserId: null }, { ownerUserId: "u", ownerUser: null }, { ownerUserId: "u", repoOwner: null, ownerUser: {} }]) {
    const order: string[] = [];
    const client = { $transaction: async (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
      assert.deepEqual(options, READ_OPTIONS);
      const tx = { $executeRaw: async () => { order.push("read-only"); }, project: { findUnique: async () => { order.push("query"); return row; } } };
      return run(tx as unknown as Prisma.TransactionClient);
    } } as TransactionHost;
    const result = await readProjectAccess(client, "p");
    assert.equal(result.available, false); if (!result.available) assert.equal(result.code, "integrity");
    assert.deepEqual(order, ["read-only", "query"]);
  }
});

it("uses the stored set regardless of plan and normalizes an invalid subscription", async () => {
  for (const available of [true, false]) {
    const client = { $transaction: async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => run({
      $executeRaw: async () => 0,
      project: { findUnique: async () => ({ ownerUserId: "u", repoOwner: "github", available, ownerUser: { subscription: { plan: "invalid" } } }) },
    } as unknown as Prisma.TransactionClient) } as TransactionHost;
    assert.deepEqual(await readProjectAccess(client, "p"), available ? { plan: "free", available: true } : { plan: "free", available: false, code: "not-selected", reason: NOT_SELECTED_REASON });
  }
});
