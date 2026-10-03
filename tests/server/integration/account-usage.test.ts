import assert from "node:assert/strict";
import { it } from "node:test";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { agentNext } from "../../../src/server/agents/next";
import { createNextDeps } from "../../../src/server/agents/runs";
import { readAccountUsage } from "../../../src/server/account-usage-query";
import { cleanup, connections, fixture, checkpoint } from "./support";
import { setTimeout as delay } from "node:timers/promises";

async function templates(db: PrismaClient, projectIds: string[]): Promise<string> {
  const lang = `usage-${randomUUID()}`;
  for (const path of ["agents/pm.md", "agents/feature-scout.md"]) {
    await db.template.create({ data: { lang, path, body: "## step:start\nFixture instruction.\nnext: done\n" } });
  }
  await db.project.updateMany({ where: { id: { in: projectIds } }, data: { language: lang } });
  return lang;
}

for (const plan of ["free", "pro"] as const) {
  it(`serializes ${plan}'s last account slot across tokens and preserves an open run at cap`, async () => {
    const pool = connections(); const [a, b] = pool.all;
    let userId: string | undefined; let lang: string | undefined;
    const locked = checkpoint(), waiting = checkpoint();
    let first: Promise<unknown> | undefined, secondRequest: Promise<unknown> | undefined;
    try {
      const f = await fixture(a, plan === "pro" ? { plan } : {}); userId = f.userId;
      const second = plan === "pro" ? await a.project.create({ data: { slug: randomUUID(), name: "second", repoOwner: f.id, repo: "second", branch: "main", ownerUserId: userId } }) : { id: f.projectId };
      lang = await templates(a, [f.projectId, second.id]);
      const count = plan === "free" ? 19 : 99;
      const anchor = new Date();
      await a.user.update({ where: { id: userId }, data: { usageWindowStartedAt: anchor, usageRunCount: count } });
      const requests = [
        { scope: { projectId: f.projectId, tokenId: "one" }, input: { agent: "pm" } },
        { scope: { projectId: second.id, tokenId: "two" }, input: { agent: plan === "free" ? "feature-scout" : "pm" } },
      ];
      const holder = a.$extends({ query: { async $queryRaw({ args, query }) {
        const result = await query(args);
        if (JSON.stringify(args).includes("User") && JSON.stringify(args).includes("FOR UPDATE")) await locked.hook();
        return result;
      } } }) as unknown as PrismaClient;
      const contender = b.$extends({ query: { async $queryRaw({ args, query }) {
        if (JSON.stringify(args).includes("User") && JSON.stringify(args).includes("FOR UPDATE")) { waiting.release(); await waiting.hook(); }
        return query(args);
      } } }) as unknown as PrismaClient;
      const r1 = agentNext(createNextDeps(holder), requests[0].scope, requests[0].input); first = r1;
      await locked.entered();
      const r2 = agentNext(createNextDeps(contender), requests[1].scope, requests[1].input); secondRequest = r2;
      await waiting.entered(); locked.release();
      const results = await Promise.all([r1, r2]);
      assert.equal(results.filter((r) => r.ok).length, 1);
      const denied = results.find((r) => !r.ok);
      assert.ok(denied && !denied.ok && denied.code === "USAGE_LIMIT_REACHED");
      assert.equal(denied.resetAt, new Date(anchor.getTime() + 5 * 60 * 60_000).toISOString());
      assert.equal((await a.user.findUniqueOrThrow({ where: { id: userId } })).usageRunCount, count + 1);
      assert.equal(await a.agentRun.count({ where: { project: { ownerUserId: userId } } }), 1);
      const winner = requests[results.findIndex((r) => r.ok)];
      assert.ok((await agentNext(createNextDeps(b), winner.scope, winner.input)).ok);
      assert.equal((await a.user.findUniqueOrThrow({ where: { id: userId } })).usageRunCount, count + 1);
    } finally {
      locked.release(); waiting.release(); await Promise.allSettled([first, secondRequest].filter(Boolean));
      await cleanup(a, userId); if (lang) await a.template.deleteMany({ where: { lang } }); await pool.disconnect();
    }
  });
}

it("uses the clock after the owner lock and does not refund committed usage when its run is deleted", async () => {
  const pool = connections(1); const [db] = pool.all; const gate = checkpoint();
  let userId: string | undefined, lang: string | undefined, pending: Promise<unknown> | undefined;
  try {
    const f = await fixture(db); userId = f.userId; lang = await templates(db, [f.projectId]);
    const endsAt = Date.now() + 1200;
    await db.user.update({ where: { id: userId }, data: { usageWindowStartedAt: new Date(endsAt - 5 * 3600_000), usageRunCount: 20 } });
    const held = db.$extends({ query: { async $queryRaw({ args, query }) {
      const result = await query(args);
      if (JSON.stringify(args).includes("User") && JSON.stringify(args).includes("FOR UPDATE")) await gate.hook();
      return result;
    } } }) as unknown as PrismaClient;
    const request = agentNext(createNextDeps(held), { projectId: f.projectId, tokenId: "boundary" }, { agent: "pm" }); pending = request;
    await gate.entered(); await delay(Math.max(0, endsAt - Date.now()) + 30); gate.release();
    assert.ok((await request).ok);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(user.usageRunCount, 1); assert.ok(user.usageWindowStartedAt!.getTime() >= endsAt);
    await db.agentRun.deleteMany({ where: { projectId: f.projectId } });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).usageRunCount, 1);
  } finally {
    gate.release(); await Promise.allSettled([pending].filter(Boolean));
    await cleanup(db, userId); if (lang) await db.template.deleteMany({ where: { lang } }); await pool.disconnect();
  }
});

it("run storage failure rolls back usage; invalid instructions are refused before charging", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined; let lang: string | undefined;
  try {
    const f = await fixture(db); userId = f.userId; lang = await templates(db, [f.projectId]);
    const failing = db.$extends({ query: { agentRun: { async create() { throw new Error("Injected run storage failure"); } } } }) as unknown as PrismaClient;
    const scope = { projectId: f.projectId, tokenId: "one" };
    await assert.rejects(agentNext(createNextDeps(failing), scope, { agent: "pm" }), /Injected run storage failure/);
    let user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(user.usageRunCount, 0); assert.equal(user.usageWindowStartedAt, null);
    assert.equal(await db.agentRun.count({ where: { projectId: f.projectId } }), 0);
    const deps = createNextDeps(db);
    deps.template = async () => "## step:start\n{{missing.instruction}}\nnext: done\n";
    const refused = await agentNext(deps, scope, { agent: "pm" });
    assert.ok(!refused.ok && refused.reason.includes("template var missing"));
    user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    assert.equal(user.usageRunCount, 0); assert.equal(user.usageWindowStartedAt, null);
    assert.equal(await db.agentRun.count({ where: { projectId: f.projectId } }), 0);
  } finally {
    await cleanup(db, userId); if (lang) await db.template.deleteMany({ where: { lang } }); await pool.disconnect();
  }
});

it("reads expired state without writing and starts the next run with the database clock", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined; let lang: string | undefined;
  try {
    const f = await fixture(db); userId = f.userId; lang = await templates(db, [f.projectId]);
    const old = new Date(Date.now() - 5 * 60 * 60_000);
    await db.user.update({ where: { id: userId }, data: { usageWindowStartedAt: old, usageRunCount: 20 } });
    assert.deepEqual((await readAccountUsage(db, userId)).usage, { kind: "limited", percent: 0, resetAt: null });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).usageRunCount, 20);
    assert.ok((await agentNext(createNextDeps(db), { projectId: f.projectId, tokenId: "fresh" }, { agent: "pm" })).ok);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const run = await db.agentRun.findFirstOrThrow({ where: { projectId: f.projectId } });
    assert.equal(user.usageRunCount, 1); assert.equal(user.usageWindowStartedAt?.getTime(), run.openedAt.getTime());
    assert.ok(run.openedAt > old);
  } finally {
    await cleanup(db, userId); if (lang) await db.template.deleteMany({ where: { lang } }); await pool.disconnect();
  }
});

it("keeps Max's stored usage on downgrade and rejects malformed counters at the SQL boundary", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined;
  try {
    const f = await fixture(db, { plan: "max" }); userId = f.userId;
    await db.user.update({ where: { id: userId }, data: { usageWindowStartedAt: new Date(), usageRunCount: 150 } });
    assert.deepEqual((await readAccountUsage(db, userId)).usage, { kind: "unlimited" });
    await db.subscription.update({ where: { userId }, data: { plan: "pro" } });
    const usage = (await readAccountUsage(db, userId)).usage;
    assert.ok(usage.kind === "limited" && usage.percent === 100);
    await assert.rejects(db.user.update({ where: { id: userId }, data: { usageRunCount: -1 } }));
    await assert.rejects(db.user.update({ where: { id: userId }, data: { usageWindowStartedAt: null } }));
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).usageRunCount, 150);
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});
