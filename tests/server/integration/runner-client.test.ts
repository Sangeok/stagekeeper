import assert from "node:assert/strict";
import { it } from "node:test";
import { newToken } from "../../../packages/core/tokens/token.mjs";
import { POST } from "../../../src/app/api/runner/route";
import { readRunnerState } from "../../../src/server/runners/api";
import { cleanup, connections, fixture, type Fixture } from "./support";

const SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

it("fences client, stopped-session and sign-in operations through the real REST route and database", async () => {
  const pool = connections(1), [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { plan: "pro" });
    const token = newToken();
    await db.projectToken.create({ data: { projectId: f.projectId, hash: token.hash, label: "resident-client-test" } });
    const call = async (body: unknown) => {
      const response = await POST(new Request("http://localhost/api/runner", { method: "POST",
        headers: { authorization: `Bearer ${token.plain}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
      return { status: response.status, body: await response.json() };
    };
    const start = { op: "start", session: SESSION, client: "codex", mode: "resident", branch: "dev", host: "current-pc", permission: "scoped", autostart: false };
    const binding = { session: SESSION, client: "codex", mode: "resident", permission: "scoped" };
    assert.deepEqual(await call(start), { status: 200, body: { ok: true, paused: false, binding } });
    assert.deepEqual(await call({ op: "beat", client: "codex", session: SESSION }), { status: 200, body: { ok: true, paused: false, binding } });
    for (const body of [{ op: "beat", session: SESSION }, { op: "stop", session: SESSION, reason: "owner" },
      { ...start, client: "claude", permission: "auto" }, { ...start, host: "other" }, { ...start, branch: "other" }]) {
      const result = await call(body);
      assert.equal(result.status, 409); assert.equal(result.body.code, "RUNNER_REPLACED");
    }
    for (const state of ["on", "off", "refused"]) {
      const body = { op: "autostart", session: OTHER, state, host: "current-pc", branch: "dev", ...(state === "refused" ? { code: "dirty" } : {}) };
      const before: unknown = await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } });
      assert.equal((await call({ ...body, client: "codex" })).status, 400);
      assert.equal((await call(body)).status, 200);
      assert.deepEqual(await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } }), before);
    }
    const busy = await call({ ...start, session: OTHER });
    assert.equal(busy.status, 409); assert.equal(busy.body.holder.client, "codex");
    assert.equal((await readRunnerState(db, f.projectId)).runner?.client, "codex");
    await call({ op: "stop", client: "codex", session: SESSION, reason: "error" });
    const stopped = await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } });
    assert.equal((await call(start)).status, 409);
    assert.deepEqual(await db.runner.findUniqueOrThrow({ where: { projectId: f.projectId } }), stopped);
    assert.equal((await call({ ...start, session: OTHER })).status, 200);
    assert.equal((await call({ op: "stop", client: "codex", session: SESSION, reason: "owner" })).status, 409);
    assert.equal((await call({ op: "stop", client: "codex", session: OTHER, reason: "owner" })).status, 200);
    assert.equal(await db.runner.count({ where: { projectId: f.projectId } }), 0);
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});

it("defaults legacy rows to Claude and rejects every invalid Codex database policy including NULL", async () => {
  const pool = connections(1), [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    const base = { projectId: f.projectId, session: SESSION, tokenId: "test", mode: "resident", host: "pc", branch: "dev", permission: "auto", state: "idle", startedAt: new Date(), seenAt: new Date() };
    assert.equal((await db.runner.create({ data: base })).client, "claude");
    await db.runner.delete({ where: { projectId: f.projectId } });
    const codex = { ...base, client: "codex", permission: "scoped", autostart: false };
    for (const patch of [{ client: "unknown" }, { client: "claude" }, { mode: "session" }, { permission: null }, { permission: "auto" },
      { permission: "allowlist" }, { autostart: true }, { branch: null }]) {
      await assert.rejects(db.runner.create({ data: { ...codex, ...patch } }));
    }
    assert.equal((await db.runner.create({ data: codex })).permission, "scoped");
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});
