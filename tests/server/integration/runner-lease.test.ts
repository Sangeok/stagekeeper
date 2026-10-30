import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { newToken } from "../../../packages/core/tokens/token.mjs";
import { readRunnerState, runRunnerOp, setRunnerPaused } from "../../../src/server/runners/api";
import type { RunnerOp } from "../../../src/server/runners/contracts";
import { POST as runnerRoute } from "../../../src/app/api/runner/route";
import { checkpoint, cleanup, connections, fixture, waitForDatabaseLock, type Fixture } from "./support";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const start = (session: string, patch: Partial<Extract<RunnerOp, { op: "start" }>> = {}): RunnerOp =>
  ({ op: "start", session, mode: "session", host: `host-${session.slice(0, 1)}`, branch: null, permission: null, autostart: false, takeover: false, ...patch });
const op = (db: PrismaClient, f: Fixture, request: RunnerOp) => runRunnerOp(db, { projectId: f.projectId, tokenId: "token", request });
const age = (db: PrismaClient, f: Fixture, minutes: number) =>
  db.$executeRaw`UPDATE "Runner" SET "seenAt" = (clock_timestamp() AT TIME ZONE 'UTC') - make_interval(mins => ${minutes}::int) WHERE "projectId" = ${f.projectId}`;

it("lets exactly one of two racing runners take a free lease under the real row lock", async () => {
  const pool = connections(2); const [a, b] = pool.all; let f: Fixture | undefined;
  const gate = checkpoint(); let first: Promise<unknown> | undefined; let second: Promise<unknown> | undefined;
  try {
    f = await fixture(a);
    const held = a.$extends({ query: { runner: { async findUnique({ args, query }) { const row = await query(args); await gate.hook(); return row; } } } }) as unknown as PrismaClient;
    first = op(held, f, start(A)); await gate.entered();
    second = op(b, f, start(B));
    await waitForDatabaseLock(a);
    gate.release();
    const results = await Promise.all([first, second]) as Awaited<ReturnType<typeof runRunnerOp>>[];
    assert.deepEqual(results.map((result) => result.ok), [true, false]);
    const busy = results[1];
    assert.ok(!busy.ok && busy.code === "RUNNER_BUSY");
    assert.equal((busy as { holder: { host: string } }).holder.host, "host-a");
    assert.equal((await a.runner.findUniqueOrThrow({ where: { projectId: f.projectId } })).session, A);
  } finally { try { gate.release(); await Promise.allSettled([first, second]); await cleanup(a, f?.userId); } finally { await pool.disconnect(); } }
});

it("expires a lease by the database clock and never lets a stopped row hold it", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    assert.equal((await op(db, f, start(A))).ok, true);
    await age(db, f, 2);
    assert.equal((await op(db, f, start(B))).ok, false, "two minutes is still live");
    await age(db, f, 4);
    assert.equal((await op(db, f, start(B))).ok, true, "four minutes is silent");
    assert.equal((await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } })).session, B);
    assert.deepEqual(await op(db, f, { op: "stop", session: B, reason: "stuck" }), { ok: true, body: { ok: true } });
    assert.equal((await op(db, f, start(A))).ok, true, "a stopped row does not hold the lease");
    assert.equal((await op(db, f, { op: "beat", session: A, state: "working", waitReason: null, lastResult: null, lastLog: null })).ok, true);
    await age(db, f, 90);
    await db.agentRun.create({ data: { projectId: f.projectId, agent: "dev", tokenId: "t", stepId: "plan" } });
    assert.equal((await op(db, f, start(B))).ok, false, "recent agent activity keeps a working session");
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});

it("treats a resent start as success, keeps the stored state on a stateless beat and replaces a stale session", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    await op(db, f, start(A));
    const startedAt = (await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } })).startedAt;
    assert.deepEqual(await op(db, f, start(A)), { ok: true, body: { ok: true, paused: false } });
    assert.deepEqual((await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } })).startedAt, startedAt);
    await op(db, f, { op: "beat", session: A, state: "waiting", waitReason: "dirty", lastResult: null, lastLog: null });
    await op(db, f, { op: "beat", session: A, state: null, waitReason: null, lastResult: null, lastLog: null });
    const row = await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } });
    assert.deepEqual([row.state, row.waitReason], ["waiting", "dirty"]);
    await op(db, f, start(B, { takeover: true }));
    const stale = await op(db, f, { op: "beat", session: A, state: null, waitReason: null, lastResult: null, lastLog: null });
    assert.ok(!stale.ok && stale.code === "RUNNER_REPLACED");
    await op(db, f, { op: "stop", session: B, reason: "owner" });
    assert.equal(await db.runner.count({ where: { projectId: f.projectId } }), 0);
    assert.deepEqual(await op(db, f, { op: "stop", session: B, reason: "owner" }), { ok: true, body: { ok: true } });
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});

it("pauses idempotently, reports it to the runner and reads it back for the banner", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    const pause = (paused: boolean) => setRunnerPaused(db, { projectId: f!.projectId, userId: f!.userId, paused });
    assert.deepEqual(await pause(true), { ok: true, item: true });
    const first = (await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).runnerPausedAt;
    assert.ok(first);
    await pause(true);
    assert.deepEqual((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).runnerPausedAt, first);
    assert.deepEqual(await op(db, f, start(A)), { ok: true, body: { ok: true, paused: true } });
    const view = await readRunnerState(db, f.projectId);
    assert.deepEqual([view.runner?.session, view.pausedAt, view.lastActivity], [A, first, null]);
    assert.ok(view.renderedAt instanceof Date);
    assert.deepEqual(await pause(false), { ok: true, item: false });
    await pause(false);
    assert.equal((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).runnerPausedAt, null);
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});

it("opens the background runner on Pro only and stops it after a downgrade without refusing its signal", async () => {
  const pool = connections(1); const [db] = pool.all; let free: Fixture | undefined; let pro: Fixture | undefined;
  try {
    free = await fixture(db);
    const refused = await op(db, free, start(A, { mode: "resident", branch: "main", permission: "auto" }));
    assert.ok(!refused.ok && refused.code === "PLAN_REQUIRED");
    assert.equal((await op(db, free, start(A))).ok, true, "the session watch stays open on Free");
    pro = await fixture(db, { plan: "pro" });
    assert.equal((await op(db, pro, start(A, { mode: "resident", branch: "main", permission: "auto" }))).ok, true);
    await db.subscription.update({ where: { userId: pro.userId }, data: { plan: "free" } });
    assert.deepEqual(await op(db, pro, { op: "beat", session: A, state: "working", waitReason: null, lastResult: null, lastLog: null }),
      { ok: true, body: { ok: true, paused: false, stop: "plan" } });
  } finally { try { await cleanup(db, free?.userId); await cleanup(db, pro?.userId); } finally { await pool.disconnect(); } }
});

it("keeps impossible rows out with the migration's checks", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    const base = { projectId: f.projectId, session: A, tokenId: "t", mode: "session", host: "h", state: "idle", startedAt: new Date(), seenAt: new Date() };
    for (const data of [
      { ...base, mode: "cloud" }, { ...base, state: "busy" }, { ...base, state: "waiting" }, { ...base, waitReason: "dirty" },
      { ...base, state: "stopped" }, { ...base, stopReason: "owner", state: "stopped" }, { ...base, mode: "resident" },
      { ...base, mode: "resident", branch: "main", permission: "ask" },
      { ...base, stopReason: "signin", state: "stopped", autostart: true }, { ...base, stopReason: "replaced", state: "stopped" },
      { ...base, mode: "resident", branch: "main", stopReason: "owner", state: "stopped" },
      { ...base, mode: "resident", branch: "main", stopReason: "signin", state: "stopped", lastResult: "dirty" },
    ]) await assert.rejects(db.runner.create({ data }), JSON.stringify(data));
    assert.ok(await db.runner.create({ data: { ...base, mode: "resident", branch: "main", permission: "allowlist" } }));
    for (const stopReason of ["owner", "signin"]) {
      await db.runner.delete({ where: { projectId: f.projectId } });
      assert.ok(await db.runner.create({ data: { ...base, mode: "resident", branch: "main", autostart: true, stopReason, state: "stopped" } }), stopReason);
    }
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});

it("answers through the real REST route with the codes and holder the CLI branches on", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    const token = newToken();
    await db.projectToken.create({ data: { projectId: f.projectId, hash: token.hash, label: "runner" } });
    const call = (body: unknown, authorization = `Bearer ${token.plain}`) => runnerRoute(new Request("http://localhost/api/runner", {
      method: "POST", headers: { authorization, "content-type": "application/json" }, body: JSON.stringify(body) }));
    const started = await call({ op: "start", session: A, mode: "session", host: "desk" });
    assert.deepEqual([started.status, await started.json()], [200, { ok: true, paused: false }]);
    assert.equal((await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } })).tokenId,
      (await db.projectToken.findUniqueOrThrow({ where: { hash: token.hash } })).id);
    const busy = await call({ op: "start", session: B, mode: "session", host: "laptop" });
    const body = await busy.json() as { code: string; holder: { mode: string; host: string; seenAt: string } };
    assert.equal(busy.status, 409); assert.equal(body.code, "RUNNER_BUSY"); assert.deepEqual([body.holder.mode, body.holder.host], ["session", "desk"]);
    const invalid = await call({ op: "start", session: B, mode: "session" });
    assert.deepEqual([invalid.status, await invalid.json()], [400, { error: "Invalid runner request." }]);
    assert.equal((await call({ op: "beat", session: A }, "Bearer nope")).status, 401);
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});

it("keeps sign-in start rows through the migration's checks: on, a refused start, an owner stop and off", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  const report = (state: "on" | "off" | "refused", code: "dirty" | null = null): RunnerOp =>
    ({ op: "autostart", session: B, state, host: "pc", branch: state === "off" ? null : "main", code });
  const row = async () => db.runner.findUnique({ where: { projectId: f!.projectId }, select: { session: true, state: true, stopReason: true, lastResult: true, autostart: true, permission: true } });
  try {
    f = await fixture(db, { plan: "pro" });
    assert.deepEqual(await op(db, f, report("on")), { ok: true, body: { ok: true, paused: false } });
    assert.deepEqual(await row(), { session: B, state: "stopped", stopReason: "owner", lastResult: null, autostart: true, permission: null });
    assert.deepEqual(await op(db, f, report("refused", "dirty")), { ok: true, body: { ok: true, paused: false } });
    assert.deepEqual(await row(), { session: B, state: "stopped", stopReason: "signin", lastResult: "dirty", autostart: true, permission: null });
    assert.deepEqual(await op(db, f, report("off")), { ok: true, body: { ok: true, paused: false } });
    assert.equal(await row(), null);

    assert.equal((await op(db, f, start(A, { mode: "resident", host: "pc", branch: "main", permission: "auto", autostart: true }))).ok, true);
    assert.deepEqual(await op(db, f, { op: "stop", session: A, reason: "owner" }), { ok: true, body: { ok: true } });
    assert.deepEqual(await row(), { session: A, state: "stopped", stopReason: "owner", lastResult: null, autostart: true, permission: "auto" });
    assert.equal((await op(db, f, start(B, { mode: "resident", host: "pc", branch: "main", permission: "auto", autostart: true }))).ok, true, "the next start replaces it");
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});
