import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { Prisma, type PrismaClient } from "../../../src/generated/prisma/client";
import { cleanupExpiredConnections } from "../../../src/server/github/maintenance-cleanup.server";
import { maintainConnections } from "../../../src/server/github/maintenance.server";
import { checkpoint, connections } from "./support";

const now = new Date("2000-01-01T00:00:00Z");
const past = new Date("1999-12-31T23:00:00Z");
const future = new Date("2099-01-01T00:00:00Z");

async function createUsers(db: PrismaClient, count: number) {
  const firstGitHubId = -Math.floor(Math.random() * 1_000_000_000) - count;
  const users = Array.from({ length: count }, (_, index) => ({ id: randomUUID(), login: randomUUID(), githubId: firstGitHubId - index }));
  await db.user.createMany({ data: users });
  return users;
}

function connection(user: { id: string; githubId: number }, refreshExpiresAt = future) {
  return { userId: user.id, githubId: String(user.githubId), revision: 3, tokenVersion: 2,
    accessToken: "sealed-access", refreshToken: "sealed-refresh", accessExpiresAt: future, refreshExpiresAt };
}

function attempt(userId: string, expiresAt: Date) {
  const id = randomUUID();
  return { id, flowId: id, userId, browserHash: "browser", stateHash: randomUUID(), kind: "authorization",
    expectedRevision: 3, verifier: "sealed-verifier", draft: "sealed-draft", expiresAt };
}

function observe(db: PrismaClient, after: (sql: Prisma.Sql, result: unknown) => Promise<void>): PrismaClient {
  return db.$extends({ query: { async $queryRaw({ args, query }) {
    const result = await query(args);
    await after(args, result);
    return result;
  } } }) as unknown as PrismaClient;
}

it("uses expiry indexes among 10000 live connections and preserves live rows while batching cleanup", { timeout: 60_000 }, async () => {
  const pool = connections(1), db = pool.all[0];
  const users = await createUsers(db, 10_003);
  const active = users.slice(0, 10_000), expired = users[10_000], leased = users[10_001], empty = users[10_002];
  const drafts = [attempt(expired.id, future), attempt(leased.id, future), attempt(active[0].id, future)];
  const deliveries = Array.from({ length: 501 }, () => ({ id: randomUUID(), expiresAt: past }));
  const liveDelivery = { id: randomUUID(), expiresAt: future };
  const sql: Prisma.Sql[] = [];
  try {
    await db.gitHubConnection.createMany({ data: [...active.map(user => connection(user)), connection(expired, past),
      { ...connection(leased), refreshLeaseId: "expired-lease", refreshLeaseExpiresAt: past },
      { ...connection(empty, past), accessToken: null }] });
    await db.gitHubInstallation.createMany({ data: [expired, leased, active[0]].map(user => ({ userId: user.id, installationId: "installation" })) });
    await db.gitHubConnectAttempt.createMany({ data: [...Array.from({ length: 501 }, () => attempt(active[0].id, past)), ...drafts] });
    await db.gitHubWebhookDelivery.createMany({ data: [...deliveries, liveDelivery] });
    await db.$executeRaw`ANALYZE "GitHubConnection"`;

    const observed = observe(db, async query => { sql.push(query); });
    const result = await maintainConnections(observed, { now, vault: null, rotate: false });
    assert.deepEqual(result, { attemptsDeleted: 501, deliveriesDeleted: 501, connectionsExpired: 2,
      credentialsRotated: 0, cleanupComplete: true, cleanupBatches: 6 });
    assert.equal(await db.gitHubConnection.count({ where: { userId: { in: active.map(user => user.id) }, accessToken: "sealed-access", revision: 3, tokenVersion: 2 } }), 10_000);
    for (const user of [expired, leased]) {
      const stopped = await db.gitHubConnection.findUniqueOrThrow({ where: { userId: user.id } });
      assert.equal(stopped.accessToken, null); assert.equal(stopped.refreshToken, null);
      assert.equal(stopped.revision, 4); assert.equal(stopped.tokenVersion, 3);
      assert.equal(stopped.refreshLeaseId, null); assert.equal(stopped.refreshExpiresAt, null);
      assert.equal(stopped.revokedAt?.getTime(), now.getTime());
      assert.equal(await db.gitHubInstallation.count({ where: { userId: user.id } }), 0);
      const draft = await db.gitHubConnectAttempt.findFirstOrThrow({ where: { userId: user.id } });
      assert.equal(draft.status, "cancelled"); assert.equal(draft.draft, null); assert.equal(draft.verifier, null);
    }
    assert.equal((await db.gitHubConnection.findUniqueOrThrow({ where: { userId: empty.id } })).revision, 3);
    assert.equal(await db.gitHubConnectAttempt.count({ where: { userId: active[0].id } }), 1);
    assert.equal((await db.gitHubConnectAttempt.findUniqueOrThrow({ where: { id: drafts[2].id } })).draft, "sealed-draft");
    assert.ok(await db.gitHubWebhookDelivery.findUnique({ where: { id: liveDelivery.id } }));
    const stopQueries = sql.filter(query => query.text.includes("stopped AS"));
    assert.equal(stopQueries.length, 2);
    for (const [index, name] of ["GitHubConnection_refreshExpiresAt_idx", "GitHubConnection_refreshLeaseExpiresAt_idx"].entries()) {
      const plan = await db.$queryRaw(Prisma.sql`EXPLAIN (FORMAT JSON) ${stopQueries[index]}`);
      assert.ok(JSON.stringify(plan).includes(name), `expiry query did not use ${name}`);
    }
  } finally {
    await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await db.gitHubWebhookDelivery.deleteMany({ where: { id: { in: [...deliveries, liveDelivery].map(row => row.id) } } });
    await pool.disconnect();
  }
});

it("commits a bounded batch and resumes remaining rows after the time budget", async () => {
  const pool = connections(1), db = pool.all[0];
  const deliveries = Array.from({ length: 501 }, () => ({ id: randomUUID(), expiresAt: past }));
  let elapsed = 0;
  try {
    await db.gitHubWebhookDelivery.createMany({ data: deliveries });
    const observed = observe(db, async sql => { if (sql.text.includes('DELETE FROM "GitHubWebhookDelivery"')) elapsed = 60_000; });
    const partial = await cleanupExpiredConnections(observed, { now, monotonicNow: () => elapsed });
    assert.equal(partial.deliveriesDeleted, 500);
    assert.equal(partial.cleanupComplete, false);
    assert.equal(await db.gitHubWebhookDelivery.count({ where: { id: { in: deliveries.map(row => row.id) } } }), 1);
    const resumed = await cleanupExpiredConnections(db, { now });
    assert.equal(resumed.deliveriesDeleted, 1);
    assert.equal(resumed.cleanupComplete, true);
  } finally {
    await db.gitHubWebhookDelivery.deleteMany({ where: { id: { in: deliveries.map(row => row.id) } } });
    await pool.disconnect();
  }
});

it("skips a renewing connection's lock and preserves its newer grant after commit", async () => {
  const pool = connections(2), [a, b] = pool.all;
  const users = await createUsers(a, 2), gate = checkpoint();
  let renewal: Promise<unknown> | undefined;
  try {
    await a.gitHubConnection.createMany({ data: users.map(user => connection(user, past)) });
    renewal = a.$transaction(async tx => {
      await tx.gitHubConnection.update({ where: { userId: users[0].id }, data: { refreshExpiresAt: future, accessToken: "new-grant", tokenVersion: { increment: 1 } } });
      await gate.hook();
    }, { timeout: 10_000 });
    await gate.entered();
    const result = await cleanupExpiredConnections(b, { now });
    assert.equal(result.connectionsExpired, 1);
    assert.equal(result.cleanupComplete, false);
    gate.release(); await renewal;
    const resumed = await cleanupExpiredConnections(b, { now });
    assert.equal(resumed.connectionsExpired, 0);
    assert.equal(resumed.cleanupComplete, true);
    const kept = await b.gitHubConnection.findUniqueOrThrow({ where: { userId: users[0].id } });
    assert.equal(kept.accessToken, "new-grant"); assert.equal(kept.revision, 3); assert.equal(kept.tokenVersion, 3);
  } finally {
    gate.release(); await Promise.allSettled(renewal ? [renewal] : []);
    await a.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); await pool.disconnect();
  }
});

it("overlapping cleanup workers stop each connection only once without waiting for each other's batch", async () => {
  const pool = connections(2), [a, b] = pool.all;
  const users = await createUsers(a, 501), gate = checkpoint();
  let first: ReturnType<typeof cleanupExpiredConnections> | undefined;
  try {
    await a.gitHubConnection.createMany({ data: users.map(user => connection(user, past)) });
    const observed = observe(a, async sql => { if (sql.text.includes("stopped AS")) await gate.hook(); });
    first = cleanupExpiredConnections(observed, { now });
    await gate.entered();
    const second = await cleanupExpiredConnections(b, { now });
    assert.equal(second.connectionsExpired, 1);
    gate.release();
    const result = await first;
    assert.equal(result.connectionsExpired, 500);
    assert.equal(await a.gitHubConnection.count({ where: { userId: { in: users.map(user => user.id) }, accessToken: null, revision: 4, tokenVersion: 3 } }), 501);
  } finally {
    gate.release(); await Promise.allSettled(first ? [first] : []);
    await a.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } }); await pool.disconnect();
  }
});

it("times out a blocked child update and rolls back the connection and its related cleanup", async () => {
  const pool = connections(2), [a, b] = pool.all;
  const [user] = await createUsers(a, 1), draft = attempt(user.id, future), gate = checkpoint();
  let holding: Promise<unknown> | undefined;
  try {
    await a.gitHubConnection.create({ data: connection(user, past) });
    await a.gitHubConnectAttempt.create({ data: draft });
    await a.gitHubInstallation.create({ data: { userId: user.id, installationId: "installation" } });
    holding = a.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "GitHubConnectAttempt" WHERE "id" = ${draft.id} FOR UPDATE`;
      await gate.hook();
    }, { timeout: 10_000 });
    await gate.entered();
    await assert.rejects(cleanupExpiredConnections(b, { now }), error => String(error).includes("lock timeout"));
    const kept = await b.gitHubConnection.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(kept.accessToken, "sealed-access"); assert.equal(kept.revision, 3); assert.equal(kept.tokenVersion, 2);
    assert.equal(await b.gitHubInstallation.count({ where: { userId: user.id } }), 1);
    gate.release(); await holding;
    assert.equal((await b.gitHubConnectAttempt.findUniqueOrThrow({ where: { id: draft.id } })).draft, "sealed-draft");
    assert.equal((await cleanupExpiredConnections(b, { now })).connectionsExpired, 1);
  } finally {
    gate.release(); await Promise.allSettled(holding ? [holding] : []);
    await a.user.deleteMany({ where: { id: user.id } }); await pool.disconnect();
  }
});
