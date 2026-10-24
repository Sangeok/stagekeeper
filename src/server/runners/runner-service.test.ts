import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESIDENT_RUNNER_PLAN_GATE } from "@harness/core/plans/entitlement.mjs";
import type { PrismaClient } from "@/generated/prisma/client";
import type { RunnerOp } from "./contracts";
import { readRunnerState, readRunnerSummaries, runRunnerOp, runnerBusyReason, RUNNER_REPLACED_REASON, setRunnerPaused } from "./runner-service";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const MINE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

type RunnerRow = {
  client: string;
  session: string; mode: string; host: string; branch: string | null; permission: string | null; autostart: boolean; state: string;
  waitReason: string | null; lastResult: string | null; lastLog: string | null; stopReason: string | null; startedAt: Date; seenAt: Date;
};
const runnerRow = (patch: Partial<RunnerRow> = {}): RunnerRow => ({
  client: "claude",
  session: OTHER, mode: "session", host: "desk", branch: null, permission: null, autostart: false, state: "idle",
  waitReason: null, lastResult: null, lastLog: null, stopReason: null, startedAt: ago(30), seenAt: ago(1), ...patch,
});

function fakeDb(options: { runner?: RunnerRow | null; plan?: string; available?: boolean; pausedAt?: Date | null; lastRun?: Date | null; lastStep?: Date | null } = {}) {
  const project = {
    id: "p1", ownerUserId: "u1", repoOwner: "octo", available: options.available ?? true, disconnectedAt: null,
    runnerPausedAt: options.pausedAt ?? null, ownerUser: { subscription: { plan: options.plan ?? "pro" } },
  };
  const state = { runner: options.runner === undefined ? null : options.runner, writes: [] as string[], locks: [] as string[], activityReads: 0, transactions: 0 };
  const pick = <T extends object>(row: T | null, select?: Record<string, unknown>) => row === null || select === undefined ? row
    : Object.fromEntries(Object.keys(select).map((key) => [key, (row as Record<string, unknown>)[key]]));
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("clock_timestamp")) return [{ now: NOW }];
      if (sql.includes('FROM "User"')) state.locks.push(`user:${values[0]}`);
      if (sql.includes('FROM "Project"')) state.locks.push(`project:${values[0]}`);
      return [];
    },
    $executeRaw: async () => 0,
    project: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === project.id ? project : null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        if (where.id !== project.id) throw new Error("missing");
        return { id: project.id, runnerPausedAt: project.runnerPausedAt, runner: state.runner };
      },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.includes(project.id) ? [{ id: project.id, runnerPausedAt: project.runnerPausedAt, runner: state.runner }] : [],
      update: async ({ data }: { data: { runnerPausedAt: Date | null } }) => { state.writes.push("project.update"); project.runnerPausedAt = data.runnerPausedAt; return project; },
    },
    runner: {
      findUnique: async ({ select }: { select?: Record<string, unknown> }) => pick(state.runner, select),
      update: async ({ data }: { data: Partial<RunnerRow> }) => { state.writes.push(`runner.update:${Object.keys(data).sort().join(",")}`); state.runner = { ...state.runner!, ...data }; return state.runner; },
      upsert: async ({ create }: { create: RunnerRow & { projectId: string } }) => {
        state.writes.push("runner.upsert");
        const row: RunnerRow & { projectId?: string } = { ...create };
        delete row.projectId;
        state.runner = row;
        return state.runner;
      },
      delete: async () => { state.writes.push("runner.delete"); state.runner = null; },
    },
    agentRun: { aggregate: async () => { state.activityReads++; return { _max: { openedAt: options.lastRun ?? null } }; } },
    agentRunStep: { aggregate: async () => ({ _max: { at: options.lastStep ?? null } }) },
  };
  const client = { $transaction: async (run: (value: typeof tx) => unknown) => { state.transactions++; return run(tx); } } as unknown as PrismaClient;
  return { client, state, project };
}

const op = (db: ReturnType<typeof fakeDb>, request: RunnerOp) => runRunnerOp(db.client, { projectId: "p1", tokenId: "token-1", request });
const startAs = (session: string, patch: Partial<Extract<RunnerOp, { op: "start" }>> = {}): RunnerOp =>
  ({ op: "start", session, mode: "session", host: "laptop", branch: null, permission: null, autostart: false, takeover: false, ...patch });
const beat = (patch: Partial<Extract<RunnerOp, { op: "beat" }>> = {}): RunnerOp =>
  ({ op: "beat", session: MINE, state: null, waitReason: null, lastResult: null, lastLog: null, ...patch });

describe("Codex resident ownership", () => {
  const startCodex = (patch: Partial<Extract<RunnerOp, { op: "start" }>> = {}) => startAs(MINE,
    { client: "codex", mode: "resident", branch: "dev", permission: "scoped", ...patch });
  const codexRow = (patch: Partial<RunnerRow> = {}) => runnerRow({ client: "codex", session: MINE,
    mode: "resident", host: "laptop", branch: "dev", permission: "scoped", ...patch });
  const binding = { session: MINE, client: "codex", mode: "resident", permission: "scoped" };

  it("echoes the stored client policy on start, pause and plan withdrawal", async () => {
    const db = fakeDb();
    assert.deepEqual(await op(db, startCodex()), { ok: true, body: { ok: true, paused: false, binding } });
    assert.equal(db.state.runner?.client, "codex");
    db.project.runnerPausedAt = NOW;
    db.project.ownerUser.subscription.plan = "free";
    assert.deepEqual(await op(db, beat({ client: "codex" })),
      { ok: true, body: { ok: true, paused: true, stop: "plan", binding } });
  });

  it("rejects a different client even when its session id matches", async () => {
    for (const client of ["claude", "codex"] as const) {
      const db = fakeDb({ runner: client === "claude" ? codexRow() : runnerRow({ session: MINE }) });
      for (const request of [startAs(MINE, { client }), beat({ client }), { op: "stop", client, session: MINE, reason: "owner" } as const]) {
        const result = await op(db, request);
        assert.ok(!result.ok && result.code === "RUNNER_REPLACED");
      }
      assert.deepEqual(db.state.writes, []);
    }
  });

  it("allows only an identical active Codex start to refresh its session", async () => {
    for (const patch of [{ host: "other" }, { branch: "other" }, { mode: "session" }, { permission: "auto" }, { state: "stopped", stopReason: "stuck" }]) {
      const db = fakeDb({ runner: codexRow(patch) });
      const result = await op(db, startCodex({ takeover: true }));
      assert.ok(!result.ok && result.code === "RUNNER_REPLACED");
      assert.deepEqual(db.state.writes, []);
    }
    const db = fakeDb({ runner: codexRow() });
    assert.deepEqual(await op(db, startCodex()), { ok: true, body: { ok: true, paused: false, binding } });
    assert.deepEqual(db.state.writes, ["runner.update:seenAt"]);
  });

  it("never changes a Codex row for any Claude sign-in operation", async () => {
    for (const state of ["idle", "stopped"] as const) for (const host of ["laptop", "other"]) for (const stale of [false, true]) {
      const db = fakeDb({ runner: codexRow({ state, host, seenAt: ago(stale ? 10 : 0), stopReason: state === "stopped" ? "stuck" : null }) });
      const before = structuredClone(db.state.runner);
      for (const operation of ["on", "off", "refused"] as const) {
        assert.deepEqual(await op(db, { op: "autostart", session: OTHER, state: operation, host: "laptop", branch: "dev", code: operation === "refused" ? "dirty" : null }),
          { ok: true, body: { ok: true, paused: false } });
      }
      assert.deepEqual(db.state.writes, []);
      assert.deepEqual(db.state.runner, before);
    }
  });

  it("keeps error records, deletes only its own owner stop and gives a Codex recovery command", async () => {
    const db = fakeDb({ runner: codexRow() });
    await op(db, { op: "stop", client: "codex", session: MINE, reason: "error" });
    assert.equal(db.state.runner?.state, "stopped");
    await op(db, { op: "stop", client: "codex", session: MINE, reason: "owner" });
    assert.equal(db.state.runner, null);
    const result = await op(fakeDb({ plan: "free" }), startCodex());
    assert.ok(!result.ok && result.code === "PLAN_REQUIRED");
    assert.match(result.reason, /\$harness-run.*\$harness-resume/);
    assert.doesNotMatch(result.reason, /Claude/);
  });
});

describe("runner start", () => {
  it("takes a free lease after locking the owner, then the project", async () => {
    const db = fakeDb();
    assert.deepEqual(await op(db, startAs(MINE)), { ok: true, body: { ok: true, paused: false } });
    assert.deepEqual(db.state.locks, ["user:u1", "project:p1"]);
    assert.deepEqual(db.state.runner, {
      client: "claude",
      session: MINE, tokenId: "token-1", mode: "session", host: "laptop", branch: null, permission: null, autostart: false,
      state: "idle", waitReason: null, lastResult: null, lastLog: null, stopReason: null, startedAt: NOW, seenAt: NOW,
    });
  });

  it("treats a resend from the same session as success and only refreshes the signal", async () => {
    const db = fakeDb({ runner: runnerRow({ session: MINE, seenAt: ago(2) }) });
    assert.deepEqual(await op(db, startAs(MINE)), { ok: true, body: { ok: true, paused: false } });
    assert.deepEqual(db.state.writes, ["runner.update:seenAt"]);
    assert.equal(db.state.runner?.host, "desk");
  });

  it("refuses a second runner while the first is live and names where it runs", async () => {
    const db = fakeDb({ runner: runnerRow({ seenAt: ago(2) }) });
    const result = await op(db, startAs(MINE));
    assert.deepEqual(result, {
      ok: false, status: 409, code: "RUNNER_BUSY", reason: runnerBusyReason({ host: "desk", seenAt: ago(2) }),
      holder: { client: "claude", mode: "session", host: "desk", seenAt: ago(2).toISOString() },
    });
    assert.equal(runnerBusyReason({ host: "desk", seenAt: ago(2) }), "A runner is already running for this project on desk (last signal 2026-10-20 11:58 UTC). Stop it there, or take it over.");
    assert.deepEqual(db.state.writes, []);
  });

  it("takes over an expired lease, a stopped row and, on request, a live lease", async () => {
    for (const [row, takeover] of [[runnerRow({ seenAt: ago(4) }), false], [runnerRow({ state: "stopped", stopReason: "stuck", seenAt: ago(0) }), false], [runnerRow({ seenAt: ago(0) }), true]] as const) {
      const db = fakeDb({ runner: row });
      assert.equal((await op(db, startAs(MINE, { takeover }))).ok, true);
      assert.equal(db.state.runner?.session, MINE);
      assert.equal(db.state.runner?.stopReason, null);
    }
  });

  it("keeps a working session alive for sixty minutes after the latest agent activity", async () => {
    const busy = fakeDb({ runner: runnerRow({ state: "working", seenAt: ago(50) }), lastStep: ago(5) });
    assert.equal((await op(busy, startAs(MINE))).ok, false);
    assert.equal(busy.state.activityReads, 1);
    const expired = fakeDb({ runner: runnerRow({ state: "working", seenAt: ago(70) }), lastRun: ago(65), lastStep: ago(61) });
    assert.equal((await op(expired, startAs(MINE))).ok, true);
    const idle = fakeDb({ runner: runnerRow({ seenAt: ago(4) }), lastStep: ago(0) });
    assert.equal((await op(idle, startAs(MINE))).ok, true);
    assert.equal(idle.state.activityReads, 0);
  });

  it("opens the background runner on Pro only and keeps resident fields only for it", async () => {
    const free = fakeDb({ plan: "free" });
    assert.deepEqual(await op(free, startAs(MINE, { mode: "resident", branch: "main", permission: "auto" })),
      { ok: false, status: 403, code: "PLAN_REQUIRED", reason: RESIDENT_RUNNER_PLAN_GATE });
    assert.deepEqual(free.state.writes, []);
    assert.equal((await op(fakeDb({ plan: "free" }), startAs(MINE))).ok, true, "the session watch stays open on Free");
    const pro = fakeDb({ plan: "pro" });
    assert.equal((await op(pro, startAs(MINE, { mode: "resident", branch: "main", permission: "allowlist", autostart: true }))).ok, true);
    assert.deepEqual([pro.state.runner?.branch, pro.state.runner?.permission, pro.state.runner?.autostart], ["main", "allowlist", true]);
    const session = fakeDb();
    await op(session, startAs(MINE, { branch: "main", permission: "auto", autostart: true }));
    assert.deepEqual([session.state.runner?.branch, session.state.runner?.permission, session.state.runner?.autostart], [null, null, false]);
  });

  it("reports the web pause and refuses an unavailable project", async () => {
    assert.deepEqual(await op(fakeDb({ pausedAt: ago(10) }), startAs(MINE)), { ok: true, body: { ok: true, paused: true } });
    const locked = fakeDb({ available: false });
    const result = await op(locked, startAs(MINE));
    assert.equal(result.ok === false && result.status, 403);
    assert.deepEqual(locked.state.writes, []);
  });
});

describe("runner beat", () => {
  it("tells a runner without the lease that it was replaced", async () => {
    for (const runner of [null, runnerRow({ session: OTHER }), runnerRow({ session: MINE, state: "stopped", stopReason: "error" })]) {
      const db = fakeDb({ runner });
      assert.deepEqual(await op(db, beat()), { ok: false, status: 409, code: "RUNNER_REPLACED", reason: RUNNER_REPLACED_REASON });
      assert.deepEqual(db.state.writes, []);
    }
  });

  it("keeps the stored state when none is sent and skips writes inside thirty seconds", async () => {
    const quiet = fakeDb({ runner: runnerRow({ session: MINE, state: "working", seenAt: new Date(NOW.getTime() - 29_000) }) });
    assert.deepEqual(await op(quiet, beat()), { ok: true, body: { ok: true, paused: false } });
    assert.deepEqual(quiet.state.writes, []);
    const due = fakeDb({ runner: runnerRow({ session: MINE, state: "working", seenAt: new Date(NOW.getTime() - 30_000) }) });
    await op(due, beat());
    assert.equal(due.state.runner?.state, "working");
    assert.deepEqual(due.state.runner?.seenAt, NOW);
  });

  it("writes a changed state at once and clears the wait reason when the wait ends", async () => {
    const db = fakeDb({ runner: runnerRow({ session: MINE, seenAt: ago(0) }) });
    await op(db, beat({ state: "waiting", waitReason: "dirty" }));
    assert.deepEqual([db.state.runner?.state, db.state.runner?.waitReason], ["waiting", "dirty"]);
    await op(db, beat());
    assert.deepEqual([db.state.runner?.state, db.state.runner?.waitReason], ["waiting", "dirty"]);
    await op(db, beat({ state: "idle", lastResult: "ITEM-01 accepted", lastLog: "a.jsonl" }));
    assert.deepEqual([db.state.runner?.state, db.state.runner?.waitReason, db.state.runner?.lastResult, db.state.runner?.lastLog], ["idle", null, "ITEM-01 accepted", "a.jsonl"]);
  });

  it("asks a resident runner to stop after its run when the plan no longer allows it", async () => {
    const db = fakeDb({ plan: "free", runner: runnerRow({ session: MINE, mode: "resident", branch: "main", permission: "auto", seenAt: ago(1) }) });
    assert.deepEqual(await op(db, beat({ state: "working" })), { ok: true, body: { ok: true, paused: false, stop: "plan" } });
    assert.equal(db.state.runner?.state, "working");
    const session = fakeDb({ plan: "free", runner: runnerRow({ session: MINE, seenAt: ago(1) }) });
    assert.deepEqual(await op(session, beat()), { ok: true, body: { ok: true, paused: false } });
  });
});

describe("runner stop", () => {
  it("succeeds without a row, deletes on an owner stop and keeps other reasons visible", async () => {
    assert.deepEqual(await op(fakeDb(), { op: "stop", session: MINE, reason: "owner" }), { ok: true, body: { ok: true } });
    const owner = fakeDb({ runner: runnerRow({ session: MINE }) });
    await op(owner, { op: "stop", session: MINE, reason: "owner" });
    assert.equal(owner.state.runner, null);
    const stuck = fakeDb({ runner: runnerRow({ session: MINE, state: "waiting", waitReason: "branch" }) });
    await op(stuck, { op: "stop", session: MINE, reason: "stuck" });
    assert.deepEqual([stuck.state.runner?.state, stuck.state.runner?.stopReason, stuck.state.runner?.waitReason], ["stopped", "stuck", null]);
    assert.deepEqual(await op(stuck, { op: "stop", session: MINE, reason: "stuck" }), { ok: true, body: { ok: true } }, "a resent stop succeeds");
  });

  it("keeps a background runner with sign-in start on as stopped by the owner, so the owner can pause it before the next sign-in", async () => {
    const db = fakeDb({ runner: runnerRow({ session: MINE, mode: "resident", branch: "main", permission: "auto", autostart: true, state: "working" }) });
    assert.deepEqual(await op(db, { op: "stop", session: MINE, reason: "owner" }), { ok: true, body: { ok: true } });
    assert.deepEqual([db.state.runner?.state, db.state.runner?.stopReason, db.state.runner?.autostart], ["stopped", "owner", true]);
    const manual = fakeDb({ runner: runnerRow({ session: MINE, mode: "resident", branch: "main", permission: "auto", autostart: false }) });
    await op(manual, { op: "stop", session: MINE, reason: "owner" });
    assert.equal(manual.state.runner, null);
  });

  it("does not stop another runner's lease", async () => {
    const db = fakeDb({ runner: runnerRow({ session: OTHER }) });
    assert.deepEqual(await op(db, { op: "stop", session: MINE, reason: "owner" }), { ok: false, status: 409, code: "RUNNER_REPLACED", reason: RUNNER_REPLACED_REASON });
    assert.equal(db.state.runner?.session, OTHER);
  });
});

describe("runner autostart report", () => {
  const report = (state: "on" | "off" | "refused", patch: Partial<Extract<RunnerOp, { op: "autostart" }>> = {}): RunnerOp =>
    ({ op: "autostart", session: MINE, state, host: "laptop", branch: state === "off" ? null : "main", code: state === "refused" ? "dirty" : null, ...patch });
  const resident = (patch: Partial<RunnerRow> = {}) => runnerRow({ session: OTHER, mode: "resident", host: "laptop", branch: "main", permission: "auto", ...patch });

  it("shows a sign-in start that has no runner yet as stopped until sign-in", async () => {
    const db = fakeDb();
    assert.deepEqual(await op(db, report("on")), { ok: true, body: { ok: true, paused: false } });
    assert.deepEqual(db.state.runner, {
      client: "claude", session: MINE, tokenId: "token-1", mode: "resident", host: "laptop", branch: "main", permission: null, autostart: true,
      state: "stopped", waitReason: null, lastResult: null, lastLog: null, stopReason: "owner", startedAt: NOW, seenAt: NOW,
    });
  });

  it("marks a runner on the same PC instead of replacing any row", async () => {
    const live = fakeDb({ runner: resident() });
    await op(live, report("on"));
    assert.deepEqual(live.state.writes, ["runner.update:autostart"]);
    assert.deepEqual([live.state.runner?.state, live.state.runner?.autostart], ["idle", true]);
    const stuck = fakeDb({ runner: resident({ state: "stopped", stopReason: "stuck" }) });
    await op(stuck, report("on"));
    assert.deepEqual([stuck.state.runner?.stopReason, stuck.state.runner?.autostart], ["stuck", true]);
    const elsewhere = fakeDb({ runner: resident({ host: "desk" }) });
    await op(elsewhere, report("on"));
    assert.deepEqual(elsewhere.state.writes, []);
  });

  it("records a refused sign-in start with its code unless another runner is live", async () => {
    for (const runner of [null, resident({ state: "stopped", stopReason: "error" }), resident({ seenAt: ago(4) }), resident({ host: "desk", state: "stopped", stopReason: "owner" })]) {
      const db = fakeDb({ runner });
      assert.deepEqual(await op(db, report("refused", { code: "autostart-branch" })), { ok: true, body: { ok: true, paused: false } });
      assert.deepEqual([db.state.runner?.session, db.state.runner?.host, db.state.runner?.state, db.state.runner?.stopReason, db.state.runner?.lastResult, db.state.runner?.autostart],
        [MINE, "laptop", "stopped", "signin", "autostart-branch", true], JSON.stringify(runner));
    }
    const busy = fakeDb({ runner: resident({ host: "desk", seenAt: ago(1) }) });
    await op(busy, report("refused"));
    assert.deepEqual([busy.state.writes, busy.state.runner?.host], [[], "desk"]);
  });

  it("removes what sign-in start left when it is turned off, and only on the same PC", async () => {
    for (const stopReason of ["owner", "signin"]) {
      const db = fakeDb({ runner: resident({ state: "stopped", stopReason, autostart: true }) });
      await op(db, report("off"));
      assert.equal(db.state.runner, null);
    }
    const live = fakeDb({ runner: resident({ autostart: true }) });
    await op(live, report("off"));
    assert.deepEqual([live.state.runner?.state, live.state.runner?.autostart], ["idle", false]);
    const stuck = fakeDb({ runner: resident({ state: "stopped", stopReason: "stuck", autostart: true }) });
    await op(stuck, report("off"));
    assert.deepEqual([stuck.state.runner?.stopReason, stuck.state.runner?.autostart], ["stuck", false]);
    for (const runner of [null, resident({ host: "desk", state: "stopped", stopReason: "owner", autostart: true }), runnerRow({ host: "laptop", state: "stopped", stopReason: "error" })]) {
      const db = fakeDb({ runner });
      assert.deepEqual(await op(db, report("off")), { ok: true, body: { ok: true, paused: false } });
      assert.deepEqual(db.state.writes, []);
    }
  });

  it("keeps Free and unavailable projects unchanged, and reports the pause", async () => {
    for (const state of ["on", "refused"] as const) {
      const free = fakeDb({ plan: "free" });
      assert.deepEqual(await op(free, report(state)), { ok: false, status: 403, code: "PLAN_REQUIRED", reason: RESIDENT_RUNNER_PLAN_GATE });
      assert.deepEqual(free.state.writes, []);
    }
    const locked = fakeDb({ available: false, runner: resident({ state: "stopped", stopReason: "owner" }) });
    assert.equal((await op(locked, report("off"))).ok, false);
    assert.deepEqual(locked.state.writes, []);
    assert.deepEqual(await op(fakeDb({ pausedAt: ago(5) }), report("on")), { ok: true, body: { ok: true, paused: true } });
  });
});

describe("setRunnerPaused", () => {
  it("is idempotent in both directions", async () => {
    const db = fakeDb();
    const pause = () => setRunnerPaused(db.client, { projectId: "p1", userId: "u1", paused: true });
    const resume = () => setRunnerPaused(db.client, { projectId: "p1", userId: "u1", paused: false });
    assert.deepEqual(await pause(), { ok: true, item: true });
    assert.deepEqual(db.project.runnerPausedAt, NOW);
    await pause();
    assert.deepEqual(await resume(), { ok: true, item: false });
    await resume();
    assert.deepEqual(db.state.writes, ["project.update", "project.update"]);
    assert.equal(db.project.runnerPausedAt, null);
  });

  it("refuses a foreign or unavailable project and a non-boolean choice", async () => {
    assert.deepEqual(await setRunnerPaused(fakeDb().client, { projectId: "p1", userId: "someone", paused: true }), { ok: false, reason: "Project not found." });
    const locked = await setRunnerPaused(fakeDb({ available: false }).client, { projectId: "p1", userId: "u1", paused: true });
    assert.equal(locked.ok, false);
    const db = fakeDb();
    assert.deepEqual(await setRunnerPaused(db.client, { projectId: "p1", userId: "u1", paused: "yes" as unknown as boolean }), { ok: false, reason: "Choose whether the runner is paused." });
    assert.equal(db.state.transactions, 0);
  });
});

describe("runner reads", () => {
  it("reads the row, the pause and the database time, and agent activity only for a working session", async () => {
    const working = fakeDb({ runner: runnerRow({ state: "working" }), pausedAt: ago(3), lastRun: ago(9), lastStep: ago(4) });
    const view = await readRunnerState(working.client, "p1");
    assert.deepEqual([view.runner?.state, view.pausedAt, view.lastActivity, view.renderedAt], ["working", ago(3), ago(4), NOW]);
    const idle = fakeDb({ runner: runnerRow(), lastStep: ago(0) });
    assert.equal((await readRunnerState(idle.client, "p1")).lastActivity, null);
    assert.equal(idle.state.activityReads, 0);
    assert.equal((await readRunnerState(fakeDb().client, "p1")).runner, null);
  });

  it("reads summaries in one transaction and skips the database for an empty list", async () => {
    const db = fakeDb({ runner: runnerRow() });
    const views = await readRunnerSummaries(db.client, ["p1", "p2"]);
    assert.deepEqual([...views.keys()], ["p1"]);
    assert.equal(db.state.transactions, 1);
    const empty = fakeDb();
    assert.equal((await readRunnerSummaries(empty.client, [])).size, 0);
    assert.equal(empty.state.transactions, 0);
  });
});
