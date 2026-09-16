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
      workspace: { findMany: async () => [], upsert: async (args: unknown) => { writes.push(args); } },
    } as unknown as Prisma.TransactionClient) } as TransactionHost;
    const valid = { id: "a", agent: "a", path: ".", knowledge: null, verify: ["npm test"], readOnly: [] };
    const result = await syncProject(client, { projectId: "p", workspaces: [valid], clock: () => at });
    assert.equal(result.ok, available);
    assert.equal(writes.length, available ? 2 : 0);
    if (available) assert.deepEqual(writes[0], { where: { id: "p" }, data: { lastSyncedAt: at } });
    writes.length = 0;
    const w = { id: "a", agent: "a", path: ".", knowledge: null, verify: ["npm test"], readOnly: [] };
    assert.equal((await syncProject(client, { projectId: "p", workspaces: [w, { ...w, agent: "b" }] })).ok, false);
    assert.deepEqual(writes, []);
  }
});

it("caps the stored union, permits updates at the cap, and reports serialization conflicts", async () => {
  const writes: unknown[] = [];
  let conflict = false;
  const client = { $transaction: async (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel?: string }) => {
    if (conflict && options.isolationLevel === "Serializable") throw { code: "P2034" };
    return run({
      $executeRaw: async () => 0,
      project: { findUnique: async () => ({ ownerUserId: "u", repoOwner: "repo", available: true, ownerUser: { subscription: { plan: "free" } } }), update: async (args: unknown) => { writes.push(args); } },
      workspace: { findMany: async () => [{ agent: "dev" }], upsert: async (args: unknown) => { writes.push(args); } },
    } as unknown as Prisma.TransactionClient);
  } } as TransactionHost;
  const valid = { id: "web", path: ".", agent: "dev", verify: ["npm test"], knowledge: null, readOnly: [] };
  const run = (agent: string) => syncProject(client, { projectId: "p", workspaces: [{ ...valid, agent }] });
  assert.equal((await run("other")).ok, false);
  assert.equal(writes.length, 0);
  assert.equal((await run("dev")).ok, true);
  assert.equal(writes.length, 2);
  conflict = true;
  assert.deepEqual(await run("dev"), { ok: false, reason: "workspace sync conflicted; retry project_sync" });
});
