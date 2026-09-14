import assert from "node:assert/strict";
import { it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import type { TransactionHost } from "../project-access-query";
import { syncProject } from "./project-sync-query";

it("updates sync time without a language and never writes after access or cap refusal", async () => {
  const at = new Date("2026-09-14T00:00:00Z");
  for (const available of [true, false]) {
    const writes: unknown[] = [];
    const client = { $transaction: async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => run({
      $executeRaw: async () => 0,
      project: {
        findUnique: async () => ({ ownerUserId: "u", repoOwner: "repo", available, ownerUser: { subscription: { plan: "free" } } }),
        update: async (args: unknown) => { writes.push(args); },
      },
      workspace: { upsert: async (args: unknown) => { writes.push(args); } },
    } as unknown as Prisma.TransactionClient) } as TransactionHost;
    const result = await syncProject(client, { projectId: "p", workspaces: [], clock: () => at });
    assert.equal(result.ok, available);
    assert.deepEqual(writes, available ? [{ where: { id: "p" }, data: { lastSyncedAt: at } }] : []);
    writes.length = 0;
    const w = { id: "a", agent: "a", path: ".", knowledge: null, verify: [], readOnly: [] };
    assert.equal((await syncProject(client, { projectId: "p", workspaces: [w, { ...w, agent: "b" }] })).ok, false);
    assert.deepEqual(writes, []);
  }
});
