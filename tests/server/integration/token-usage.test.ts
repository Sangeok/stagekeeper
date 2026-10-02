import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { newToken } from "@harness/core/token.mjs";
import { makeVerifyOwnerToken, makeVerifyToken } from "../../../src/server/mcp/auth";
import { makeRecordTokenUsage } from "../../../src/server/token-usage-query";
import { cleanup, connections, checkpoint } from "./support";

it("all three real token tables preserve legacy nulls, throttle boundaries and concurrent monotonicity", async () => {
  const { all: [a, b], disconnect } = connections(); let userId: string | undefined;
  try {
    const key = randomUUID(); const user = await a.user.create({ data: { login: key, githubId: -Math.floor(Math.random() * 2_000_000_000) } }); userId = user.id;
    const project = await a.project.create({ data: { slug: key, name: key, repoOwner: key, repo: key, branch: "main", ownerUserId: user.id } });
    const legacy = await a.projectToken.create({ data: { projectId: project.id, hash: randomUUID(), label: "legacy" } });
    assert.equal(legacy.lastUsedAt, null); assert.equal(legacy.usageTrackingStartedAt, null);
    const initial = new Date("2026-10-02T03:00:00Z");
    const tokens = {
      agent: await a.projectToken.create({ data: { projectId: project.id, hash: randomUUID(), label: "agent", usageTrackingStartedAt: initial } }),
      owner: await a.ownerToken.create({ data: { projectId: project.id, userId: user.id, hash: randomUUID(), label: "owner", usageTrackingStartedAt: initial } }),
      user: await a.userToken.create({ data: { userId: user.id, hash: randomUUID(), label: "user", usageTrackingStartedAt: initial } }),
    };
    const recordA = makeRecordTokenUsage(a); const recordB = makeRecordTokenUsage(b);
    for (const kind of ["agent", "owner", "user"] as const) {
      const id = tokens[kind].id; const read = () => kind === "agent" ? a.projectToken.findUniqueOrThrow({ where: { id } }) : kind === "owner" ? a.ownerToken.findUniqueOrThrow({ where: { id } }) : a.userToken.findUniqueOrThrow({ where: { id } });
      assert.equal((await read()).lastUsedAt, null);
      await recordA(kind, id, initial); assert.equal((await read()).lastUsedAt?.getTime(), initial.getTime());
      await recordB(kind, id, new Date(initial.getTime() + 59_999)); assert.equal((await read()).lastUsedAt?.getTime(), initial.getTime());
      await recordB(kind, id, new Date(initial.getTime() + 60_000)); assert.equal((await read()).lastUsedAt?.getTime(), initial.getTime() + 60_000);
      await recordA(kind, id, initial); assert.equal((await read()).lastUsedAt?.getTime(), initial.getTime() + 60_000);
      await Promise.all([recordA(kind, id, new Date(initial.getTime() + 180_000)), recordB(kind, id, new Date(initial.getTime() + 120_000))]);
      assert.equal((await read()).lastUsedAt?.getTime(), initial.getTime() + 180_000);
      assert.equal((await read()).usageTrackingStartedAt?.getTime(), initial.getTime());
    }
    await recordA("agent", legacy.id, initial);
    assert.equal((await a.projectToken.findUniqueOrThrow({ where: { id: legacy.id } })).usageTrackingStartedAt, null, "legacy history is not backfilled");
  } finally { await cleanup(a, userId); await disconnect(); }
});

it("real row locks order both revocation races for every kind and keep authentication after delayed recording", async () => {
  const { all: [a, b], disconnect } = connections(); let userId: string | undefined;
  try {
    const key = randomUUID(); const user = await a.user.create({ data: { login: key, githubId: -Math.floor(Math.random() * 2_000_000_000) } }); userId = user.id;
    const project = await a.project.create({ data: { slug: key, name: key, repoOwner: key, repo: key, branch: "main", ownerUserId: user.id } });
    for (const kind of ["agent", "owner", "user"] as const) {
      const credential = newToken(kind);
      const row = kind === "agent" ? await a.projectToken.create({ data: { projectId: project.id, hash: credential.hash, label: key } })
        : kind === "owner" ? await a.ownerToken.create({ data: { projectId: project.id, userId: user.id, hash: credential.hash, label: key } })
          : await a.userToken.create({ data: { userId: user.id, hash: credential.hash, label: key } });
      const read = () => kind === "agent" ? a.projectToken.findUniqueOrThrow({ where: { id: row.id } }) : kind === "owner" ? a.ownerToken.findUniqueOrThrow({ where: { id: row.id } }) : a.userToken.findUniqueOrThrow({ where: { id: row.id } });
      const at = new Date("2026-10-02T03:00:00Z");
      for (const revokeFirst of [false, true]) {
        const reset = { where: { id: row.id }, data: { lastUsedAt: null, revokedAt: null } };
        await (kind === "agent" ? a.projectToken.updateMany(reset) : kind === "owner" ? a.ownerToken.updateMany(reset) : a.userToken.updateMany(reset));
        const gate = checkpoint(); const arrived = checkpoint(); let pending: Promise<unknown> | undefined; let holding: Promise<unknown> | undefined;
        let resultCount: number | undefined; let attempts = 0;
        const observe = async (query: () => Promise<{ count: number }>) => { attempts++; arrived.release(); await arrived.hook(); const result = await query(); resultCount = result.count; return result; };
        const observed = b.$extends({ query: {
          projectToken: { updateMany: ({ query, args }) => observe(() => query(args)) },
          ownerToken: { updateMany: ({ query, args }) => observe(() => query(args)) },
          userToken: { updateMany: ({ query, args }) => observe(() => query(args)) },
        } });
        let settled = false;
        try {
          holding = a.$transaction(async (tx) => {
            if (revokeFirst) {
              const args = { where: { id: row.id }, data: { lastUsedAt: null, revokedAt: at } };
              await (kind === "agent" ? tx.projectToken.updateMany(args) : kind === "owner" ? tx.ownerToken.updateMany(args) : tx.userToken.updateMany(args));
            } else await makeRecordTokenUsage(tx)(kind, row.id, at);
            await gate.hook();
          }, { timeout: 10_000 });
          await gate.entered();
          if (revokeFirst) {
            pending = makeRecordTokenUsage(observed)(kind, row.id, new Date(at.getTime() + 120_000));
          } else {
            const args = { where: { id: row.id }, data: { revokedAt: at } };
            pending = kind === "agent" ? b.projectToken.updateMany(args) : kind === "owner" ? b.ownerToken.updateMany(args) : b.userToken.updateMany(args);
          }
          const done = pending.then(() => { settled = true; });
          if (revokeFirst) await arrived.entered();
          // The first transaction owns the row lock until the explicit barrier releases it.
          await new Promise((resolve) => setTimeout(resolve, 50)); assert.equal(settled, false);
          gate.release(); await holding; await done;
          const saved = await read(); assert.ok(saved.revokedAt);
          assert.equal(saved.lastUsedAt?.getTime() ?? null, revokeFirst ? null : at.getTime());
          if (revokeFirst) { assert.equal(attempts, 1); assert.equal(resultCount, 0); }
        } finally { gate.release(); arrived.release(); await Promise.allSettled([holding, pending].filter((value) => value !== undefined)); }
      }
    }

    const credential = newToken(); const token = await a.projectToken.create({ data: { projectId: project.id, hash: credential.hash, label: "latency" } });
    const gate = checkpoint(); let holding: Promise<unknown> | undefined; let pending: Promise<unknown> | undefined;
    let queries = 0; const counts: number[] = [];
    const observed = b.$extends({ query: { projectToken: { async updateMany({ args, query }) { queries++; const result = await query(args); counts.push(result.count); return result; } } } });
    const verify = makeVerifyToken((hash) => b.projectToken.findUnique({ where: { hash }, select: { id: true, projectId: true, revokedAt: true } }), undefined, makeRecordTokenUsage(observed));
    try {
      holding = a.$transaction(async (tx) => { await tx.projectToken.updateMany({ where: { id: token.id }, data: { lastUsedAt: null } }); await gate.hook(); }, { timeout: 10_000 });
      await gate.entered(); let settled = false; const started = performance.now();
      pending = verify(new Request("http://example.test/api/mcp"), credential.plain).then((info) => { settled = true; assert.equal(info?.extra?.tokenId, token.id); });
      await new Promise((resolve) => setTimeout(resolve, 80)); assert.equal(settled, false);
      gate.release(); await holding; await pending;
      assert.ok(performance.now() - started >= 75);
      await verify(new Request("http://example.test/api/mcp"), credential.plain);
      assert.equal(queries, 2); assert.deepEqual(counts, [1, 0]);
      console.log("token usage lock wait verified (>=75ms); 2 queries, 1 row change");
    } finally { gate.release(); await Promise.allSettled([holding, pending].filter((value) => value !== undefined)); }

    const original = console.warn;
    try {
      console.warn = () => {};
      const failed = makeRecordTokenUsage(b.$extends({ query: { ownerToken: { updateMany: () => { throw new Error("record write rejected"); } } } }));
      const owner = newToken("owner"); const stored = await b.ownerToken.create({ data: { projectId: project.id, userId: user.id, hash: owner.hash, label: "failure" } });
      const verifyOwner = makeVerifyOwnerToken((hash) => b.ownerToken.findUnique({ where: { hash } }), failed);
      assert.equal((await verifyOwner(new Request("http://example.test/api/mcp/owner"), owner.plain))?.extra?.ownerTokenId, stored.id);
    } finally { console.warn = original; }
  } finally { await cleanup(a, userId); await disconnect(); }
});
