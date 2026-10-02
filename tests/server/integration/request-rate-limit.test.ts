import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { REQUEST_LIMITS } from "../../../packages/core/request-rate.mjs";
import { newToken } from "../../../packages/core/token.mjs";
import { consumeProjectRequestBudget, consumeRequestBudget } from "../../../src/server/request-rate-limit";
import { readDatabaseClockIn } from "../../../src/server/database-clock";
import { GET as identity } from "../../../src/app/api/project/route";
import { GET as templates } from "../../../src/app/api/templates/route";
import { POST as runbook } from "../../../src/app/api/runbook/route";
import { POST as register } from "../../../src/app/api/projects/route";
import { POST as mcp } from "../../../src/app/api/mcp/route";
import { POST as ownerMcp } from "../../../src/app/api/mcp/owner/route";
import { cleanup, connections, fixture, checkpoint } from "./support";

async function seed(db: PrismaClient, userId: string, projectId: string | null, count: number, startedAt = new Date()): Promise<void> {
  const scope = projectId === null ? "account" : "project"; const subjectId = projectId ?? userId;
  await db.requestRateWindow.upsert({ where: { scope_subjectId: { scope, subjectId } },
    create: { scope, subjectId, ownerUserId: userId, projectId, count, startedAt }, update: { count, startedAt } });
}

it("creates one pair of windows and atomically admits exactly one last slot under real row-lock contention", async () => {
  const pool = connections(2); const [a, b] = pool.all; let userId: string | undefined;
  const gate = checkpoint(); const attempt = checkpoint(); let first: Promise<unknown> | undefined; let second: Promise<unknown> | undefined;
  try {
    const f = await fixture(a); userId = f.userId;
    await Promise.all(Array.from({ length: 8 }, (_, i) => consumeRequestBudget(pool.all[i % 2], userId!, f.projectId)));
    const rows = await a.requestRateWindow.findMany({ where: { ownerUserId: userId } });
    assert.equal(rows.length, 2); assert.ok(rows.every((row) => row.count === 8));
    await seed(a, userId, null, REQUEST_LIMITS.account - 1); await seed(a, userId, f.projectId, REQUEST_LIMITS.project - 1);
    const held = a.$extends({ query: { async $queryRaw({ args, query }) { const result = await query(args); if (JSON.stringify(args).includes("FOR UPDATE")) await gate.hook(); return result; } } });
    const observed = b.$extends({ query: { async $queryRaw({ args, query }) { if (JSON.stringify(args).includes("FOR UPDATE")) { attempt.release(); await attempt.hook(); } return query(args); } } });
    first = consumeRequestBudget(held as unknown as PrismaClient, userId, f.projectId); await gate.entered();
    second = consumeRequestBudget(observed as unknown as PrismaClient, userId, f.projectId); await attempt.entered();
    gate.release(); const results = await Promise.all([first, second]);
    assert.equal(results[0], null); assert.ok(results[1] && (results[1] as { code: string }).code === "RATE_LIMITED");
    assert.equal((await a.requestRateWindow.findUniqueOrThrow({ where: { scope_subjectId: { scope: "account", subjectId: userId } } })).count, REQUEST_LIMITS.account);
    assert.equal((await a.requestRateWindow.findUniqueOrThrow({ where: { scope_subjectId: { scope: "project", subjectId: f.projectId } } })).count, REQUEST_LIMITS.project);
  } finally { gate.release(); attempt.release(); await Promise.allSettled([first, second]); await cleanup(a, userId); await pool.disconnect(); }
});

it("denial rolls back the other window's insert, reset and increment, and uses the longest recovery", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined;
  try {
    const f = await fixture(db); userId = f.userId;
    await seed(db, userId, f.projectId, REQUEST_LIMITS.project);
    assert.ok(await consumeRequestBudget(db, userId, f.projectId));
    assert.equal(await db.requestRateWindow.count({ where: { scope: "account", subjectId: userId } }), 0);
    const expired = new Date(Date.now() - 600_001);
    await seed(db, userId, null, 17, expired);
    assert.ok(await consumeRequestBudget(db, userId, f.projectId));
    const account = await db.requestRateWindow.findUniqueOrThrow({ where: { scope_subjectId: { scope: "account", subjectId: userId } } });
    assert.equal(account.count, 17); assert.equal(account.startedAt.getTime(), expired.getTime());
    await seed(db, userId, null, REQUEST_LIMITS.account, new Date(Date.now() - 400_000));
    const failure = await consumeRequestBudget(db, userId, f.projectId);
    assert.ok(failure && failure.retryAfterSec > 590 && failure.retryAfterSec <= 600);
    await db.requestRateWindow.deleteMany({ where: { scope: "project", ownerUserId: userId } });
    assert.ok(await consumeRequestBudget(db, userId, f.projectId));
    assert.equal(await db.requestRateWindow.count({ where: { scope: "project", subjectId: f.projectId } }), 0);
    await seed(db, userId, null, REQUEST_LIMITS.account, expired);
    assert.equal(await consumeRequestBudget(db, userId, f.projectId), null);
    assert.equal((await db.requestRateWindow.findUniqueOrThrow({ where: { scope_subjectId: { scope: "account", subjectId: userId } } })).count, 1);
    const failing = db.$extends({ query: { requestRateWindow: { async update({ args, query }) {
      if (args.where.scope_subjectId?.scope === "project") throw new Error("Injected budget storage failure"); return query(args);
    } } } }) as unknown as PrismaClient;
    await assert.rejects(consumeRequestBudget(failing, userId, f.projectId), /Injected budget/);
    assert.ok((await db.requestRateWindow.findMany({ where: { ownerUserId: userId } })).every((row) => row.count === 1));
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});

it("admits the agreed four-project, four-session 10-minute burst without false limits", async () => {
  const pool = connections(4); const db = pool.all[0]; let userId: string | undefined;
  try {
    const f = await fixture(db, { plan: "pro" }); userId = f.userId;
    const projects = [f.projectId];
    for (let i = 1; i < 4; i++) projects.push((await db.project.create({ data: {
      slug: `${f.id}-${i}`, name: "load fixture", repoOwner: f.id, repo: `fixture-${i}`, branch: "main", ownerUserId: userId,
    } })).id);
    const start = performance.now();
    await Promise.all(projects.flatMap((projectId) => pool.all.map(async (client) => {
      // Measured callback burst 59 + registration/init 3; fixture count agreed before implementation.
      for (let call = 0; call < 62; call++) assert.equal(await consumeProjectRequestBudget(client, projectId), null);
    })));
    const elapsedMs = performance.now() - start;
    assert.ok(elapsedMs < 600_000);
    const windows = await db.requestRateWindow.findMany({ where: { ownerUserId: userId } });
    assert.equal(windows.find((row) => row.scope === "account")?.count, 992);
    assert.ok(windows.filter((row) => row.scope === "project").every((row) => row.count === 248));
    console.log(`Request budget load rehearsal: 992 allowed, ${Math.round(elapsedMs)}ms total, ${Math.round(elapsedMs / 992 * 100) / 100}ms amortized/request (local DB).`);
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});

it("uses UTC after locks, rejects SQL subject corruption and cascades only the deleted subject", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined;
  try {
    const f = await fixture(db); userId = f.userId;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Seoul'`;
      const at = await readDatabaseClockIn(tx); assert.ok(Math.abs(Date.now() - at.getTime()) < 1000);
    });
    for (const data of [
      { scope: "project", subjectId: f.projectId, ownerUserId: userId, projectId: null },
      { scope: "account", subjectId: "wrong", ownerUserId: userId, projectId: null },
      { scope: "unknown", subjectId: userId, ownerUserId: userId, projectId: null },
    ]) await assert.rejects(db.requestRateWindow.create({ data: { ...data, count: 0, startedAt: new Date() } }));
    await assert.rejects(db.requestRateWindow.create({ data: { scope: "account", subjectId: userId, ownerUserId: userId, count: -1, startedAt: new Date() } }));
    assert.equal(await consumeRequestBudget(db, userId, f.projectId), null);
    await db.project.delete({ where: { id: f.projectId } });
    assert.deepEqual((await db.requestRateWindow.findMany({ where: { ownerUserId: userId } })).map((row) => row.scope), ["account"]);
    await cleanup(db, userId); assert.equal(await db.requestRateWindow.count({ where: { ownerUserId: userId } }), 0); userId = undefined;
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});

it("all six actual transports return rate metadata and denied calls cannot create domain or usage state", async () => {
  const pool = connections(1); const [db] = pool.all; let userId: string | undefined;
  try {
    const f = await fixture(db, { plan: "pro" }); userId = f.userId;
    const hs = newToken(), hu = newToken("user"), ho = newToken("owner");
    await db.projectToken.create({ data: { projectId: f.projectId, hash: hs.hash, label: "agent" } });
    await db.userToken.create({ data: { userId, hash: hu.hash, label: "user" } });
    await db.ownerToken.create({ data: { projectId: f.projectId, userId, hash: ho.hash, label: "owner" } });
    await seed(db, userId, null, REQUEST_LIMITS.account);
    const before = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    for (const [handler, path, body] of [[identity, "/api/project", undefined], [templates, "/api/templates", undefined],
      [runbook, "/api/runbook", { project: f.id, version: "a".repeat(12) }], [register, "/api/projects", { owner: f.id, repo: "new" }]] as const) {
      const response = await handler(new Request(`https://example.test${path}?project=${f.id}`, { method: body ? "POST" : "GET",
        headers: { authorization: `Bearer ${hu.plain}` }, ...(body ? { body: JSON.stringify(body) } : {}) }));
      assert.equal(response.status, 429); const json = await response.json();
      assert.equal(json.code, "RATE_LIMITED"); assert.ok(json.retryAfterSec > 0); assert.equal(response.headers.get("Retry-After"), String(json.retryAfterSec));
      assert.deepEqual(Object.keys(json).sort(), ["code", "error", "retryAfterSec"]);
    }
    for (const [handler, token, name, args] of [[mcp, hs.plain, "agent_next", { agent: "pm" }], [mcp, hu.plain, "project_get", { project: f.id }],
      [ownerMcp, ho.plain, "gate_approve", { key: f.key, gate: "before-implement" }]] as const) {
      const response = await handler(new Request("https://example.test/api/mcp", { method: "POST", headers: {
        authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream",
      }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
      assert.equal(response.status, 200); const text = await response.text();
      const json = response.headers.get("content-type")?.includes("text/event-stream")
        ? JSON.parse(text.split(/\r?\n/).find((line) => line.startsWith("data: "))!.slice(6)) : JSON.parse(text);
      assert.equal(json.result.isError, true); assert.equal(JSON.parse(json.result.content[0].text).code, "RATE_LIMITED");
    }
    assert.deepEqual(await db.project.findUniqueOrThrow({ where: { id: f.projectId } }), before);
    assert.equal(await db.project.count({ where: { ownerUserId: userId } }), 1);
    assert.equal(await db.agentRun.count({ where: { projectId: f.projectId } }), 0);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } }); assert.equal(user.usageRunCount, 0); assert.equal(user.usageWindowStartedAt, null);
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});
