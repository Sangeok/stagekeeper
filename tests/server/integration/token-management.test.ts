import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { renameProjectToken, renameUserToken } from "../../../src/server/token-management-query";
import { issueProjectToken, issueProjectOwnerToken } from "../../../src/server/project-token-service";
import { makeRecordTokenUsage } from "../../../src/server/token-usage-query";
import { disconnectProject } from "../../../src/server/project-connection-service";
import { cleanup, connections, fixture, checkpoint } from "./support";

it("rename changes only labels, preserves ended credentials and cannot cross a user or project scope", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined; let otherUserId: string | undefined;
  try {
    const f = await fixture(db, { plan: "pro" }); userId = f.userId;
    const other = await fixture(db); otherUserId = other.userId;
    const metadata = { label: "old", expiresAt: new Date(0), revokedAt: new Date(1), usageTrackingStartedAt: new Date(2), lastUsedAt: new Date(3) };
    const agent = await db.projectToken.create({ data: { ...metadata, projectId: f.projectId, hash: `a-${f.id}` } });
    const owner = await db.ownerToken.create({ data: { ...metadata, projectId: f.projectId, userId, hash: `o-${f.id}` } });
    const user = await db.userToken.create({ data: { ...metadata, userId, hash: `u-${f.id}` } });
    for (const kind of ["agent", "owner"] as const) {
      const before = kind === "agent" ? agent : owner;
      const input: Parameters<typeof renameProjectToken>[1] = { userId: f.userId, projectId: f.projectId, tokenId: before.id, label: " new ", kind };
      assert.deepEqual(await renameProjectToken(db, { ...input, userId: other.userId }), { ok: false, reason: "Project not found." });
      assert.equal((await renameProjectToken(db, { ...input, projectId: other.projectId, userId: other.userId })).ok, false);
      assert.deepEqual(await renameProjectToken(db, input), { ok: true, item: null });
      const after = kind === "agent" ? await db.projectToken.findUniqueOrThrow({ where: { id: before.id } }) : await db.ownerToken.findUniqueOrThrow({ where: { id: before.id } });
      assert.deepEqual(after, { ...before, label: "new" });
    }
    assert.equal((await renameUserToken(db, { userId: other.userId, tokenId: user.id, label: "foreign" })).ok, false);
    assert.equal((await renameUserToken(db, { userId, tokenId: user.id, label: " " })).ok, false);
    assert.deepEqual(await renameUserToken(db, { userId, tokenId: user.id, label: "renamed" }), { ok: true, item: null });
    assert.deepEqual(await db.userToken.findUniqueOrThrow({ where: { id: user.id } }), { ...user, label: "renamed" });
    await db.subscription.update({ where: { userId }, data: { plan: "free" } });
    assert.equal((await renameProjectToken(db, { userId, projectId: f.projectId, tokenId: owner.id, label: "Free rename", kind: "owner" })).ok, true);
    await db.project.update({ where: { id: f.projectId }, data: { available: false } });
    assert.equal((await renameProjectToken(db, { userId, projectId: f.projectId, tokenId: agent.id, label: "unavailable", kind: "agent" })).ok, false);
    assert.equal((await db.projectToken.findUniqueOrThrow({ where: { id: agent.id } })).label, "new");
  } finally { await cleanup(db, userId); await cleanup(db, otherUserId); await pool.disconnect(); }
});

it("project issuance validates canonical future expiry and retains unlimited multi-token issuance", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined;
  try {
    const f = await fixture(db, { plan: "pro" }); userId = f.userId;
    const input = { userId, projectId: f.projectId, label: "same label" };
    for (const issue of [issueProjectToken, issueProjectOwnerToken]) {
      for (const expiresAt of ["2020-01-01T00:00:00.000Z", "invalid", "2999-01-01T00:00:00+00:00", "2999-02-30T00:00:00.000Z"]) {
        assert.equal((await issue(db, { ...input, expiresAt })).ok, false);
      }
      assert.ok((await issue(db, input)).ok);
      assert.ok((await issue(db, { ...input, expiresAt: "2999-01-01T00:00:00.000Z" })).ok);
    }
    for (const rows of [await db.projectToken.findMany({ where: { projectId: f.projectId } }), await db.ownerToken.findMany({ where: { projectId: f.projectId } })]) {
      assert.equal(rows.length, 2); assert.equal(rows.filter((row) => row.expiresAt === null).length, 1);
      assert.ok(rows.every((row) => row.lastUsedAt === null && row.usageTrackingStartedAt instanceof Date));
    }
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});

it("all token recorders accept the captured pre-expiry time but never update on or after expiry", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined;
  try {
    const f = await fixture(db); userId = f.userId;
    const expiry = new Date("2026-10-02T00:00:00.001Z");
    const rows = {
      agent: await db.projectToken.create({ data: { projectId: f.projectId, hash: `a-${f.id}`, label: "agent", expiresAt: expiry } }),
      owner: await db.ownerToken.create({ data: { projectId: f.projectId, userId, hash: `o-${f.id}`, label: "owner", expiresAt: expiry } }),
      user: await db.userToken.create({ data: { userId, hash: `u-${f.id}`, label: "user", expiresAt: expiry } }),
    };
    const record = makeRecordTokenUsage(db);
    for (const kind of ["agent", "owner", "user"] as const) {
      const row = rows[kind]; const before = new Date(expiry.getTime() - 1);
      await record(kind, row.id, expiry); await record(kind, row.id, new Date(expiry.getTime() + 60_000));
      const read = () => kind === "agent" ? db.projectToken.findUniqueOrThrow({ where: { id: row.id } }) : kind === "owner" ? db.ownerToken.findUniqueOrThrow({ where: { id: row.id } }) : db.userToken.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal((await read()).lastUsedAt, null);
      await record(kind, row.id, before); assert.equal((await read()).lastUsedAt?.getTime(), before.getTime());
    }
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});

it("rename and disconnect serialize in either order without reviving a credential", async () => {
  for (const disconnectFirst of [true, false]) {
    const pool = connections(2); const [a, b] = pool.all; const gate = checkpoint(), arrived = checkpoint();
    let userId: string | undefined; let first: Promise<unknown> | undefined, second: Promise<unknown> | undefined;
    try {
      const f = await fixture(a); userId = f.userId;
      const token = await a.projectToken.create({ data: { projectId: f.projectId, hash: f.id, label: "old" } });
      const held = a.$extends({ query: { async $queryRaw({ args, query }) { const value = await query(args); if (JSON.stringify(args).includes("FOR UPDATE")) await gate.hook(); return value; } } }) as unknown as PrismaClient;
      const observed = b.$extends({ query: { async $queryRaw({ args, query }) { if (JSON.stringify(args).includes("FOR UPDATE")) { arrived.release(); await arrived.hook(); } return query(args); } } }) as unknown as PrismaClient;
      const rename = (client: PrismaClient) => renameProjectToken(client, { userId: f.userId, projectId: f.projectId, tokenId: token.id, label: "new", kind: "agent" });
      const disconnect = (client: PrismaClient) => disconnectProject(client, { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 0 });
      first = disconnectFirst ? disconnect(held) : rename(held); await gate.entered();
      second = disconnectFirst ? rename(observed) : disconnect(observed); await arrived.entered(); gate.release();
      const results = await Promise.all([first, second]);
      assert.equal((results[disconnectFirst ? 1 : 0] as { ok: boolean }).ok, !disconnectFirst);
      const after = await a.projectToken.findUniqueOrThrow({ where: { id: token.id } });
      assert.equal(after.label, disconnectFirst ? "old" : "new"); assert.ok(after.revokedAt); assert.equal(after.hash, token.hash);
    } finally { gate.release(); arrived.release(); await Promise.allSettled([first, second]); await cleanup(a, userId); await pool.disconnect(); }
  }
});
