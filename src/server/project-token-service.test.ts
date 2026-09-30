import assert from "node:assert/strict";
import { it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import type { TransactionHost } from "./project-access-query";
import { DISCONNECTED_REASON, NOT_SELECTED_REASON } from "./project-access-query";
import { issueProjectOwnerToken, issueProjectToken } from "./project-token-service";

function tokenFixture({ available = true, disconnectedAt = null as Date | null, plan = "pro", owned = true } = {}) {
  const order: string[] = [];
  const tokens: unknown[] = [];
  let fail = false;
  const client = { $transaction: async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
    const previous = [...tokens];
    const create = async ({ data }: { data: unknown }) => { tokens.push(data); if (fail) throw new Error("storage failure"); };
    const tx = {
      $queryRaw: async () => { order.push("lock"); return []; },
      project: {
        findFirst: async ({ where }: { where: { id: string; ownerUserId: string } }) => { order.push("ownership"); assert.deepEqual(where, { id: "p", ownerUserId: "u" }); return owned ? { id: "p" } : null; },
        findUnique: async () => { order.push("access"); return { ownerUserId: "u", repoOwner: "r", available, disconnectedAt, ownerUser: { subscription: { plan } } }; },
      }, projectToken: { create }, ownerToken: { create },
    };
    try { return await run(tx as unknown as Prisma.TransactionClient); } catch (error) { tokens.splice(0, tokens.length, ...previous); throw error; }
  } } as TransactionHost;
  return { client, tokens, order, fail: () => { fail = true; } };
}
const input = { userId: "u", projectId: "p", label: " terminal " };

it("locks before fresh ownership/access checks and exposes only successfully stored credentials", async () => {
  for (const issue of [issueProjectToken, issueProjectOwnerToken]) {
    const f = tokenFixture(); const result = await issue(f.client, input);
    assert.deepEqual(f.order, ["lock", "ownership", "access"]); assert.equal(f.tokens.length, 1);
    assert.ok(result.ok && /^(hs|ho)_/.test(result.item.token));
    assert.ok(!JSON.stringify(f.tokens).includes(result.ok ? result.item.token : "impossible"));
    const broken = tokenFixture(); broken.fail(); await assert.rejects(issue(broken.client, input), /storage failure/);
    assert.equal(broken.tokens.length, 0);
  }
});

it("denies disconnected, not selected, foreign, and owner-token plan failures without minting rows", async () => {
  for (const issue of [issueProjectToken, issueProjectOwnerToken]) {
    for (const [options, reason] of [[{ available: false, disconnectedAt: new Date() }, DISCONNECTED_REASON], [{ available: false }, NOT_SELECTED_REASON], [{ owned: false }, "Project not found."]] as const) {
      const f = tokenFixture(options); assert.deepEqual(await issue(f.client, input), { ok: false, reason }); assert.equal(f.tokens.length, 0);
    }
  }
  const free = tokenFixture({ plan: "free" });
  assert.equal((await issueProjectOwnerToken(free.client, input)).ok, false); assert.equal(free.tokens.length, 0);
});
