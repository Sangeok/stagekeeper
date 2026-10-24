import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESIDENT_RUNNER_PLAN_GATE } from "@harness/core/plans/entitlement.mjs";
import { newToken } from "@harness/core/tokens/token.mjs";
import type { RunnerOp, RunnerOpResult } from "../runners/contracts";
import { INVALID_RUNNER_REQUEST, makeRunnerRequest, parseRunnerRequest, runnerResponse, type RunnerDeps } from "./runner-handler";

const agent = newToken();
const agentHeader = `Bearer ${agent.plain}`;
const SESSION = "0b0f1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const start = { op: "start", session: SESSION, mode: "session", host: "desk" };

type Options = {
  tokenRecord?: Awaited<ReturnType<RunnerDeps["findTokenByHash"]>>;
  access?: Awaited<ReturnType<RunnerDeps["projectAccess"]>>;
  limited?: boolean;
  result?: RunnerOpResult;
};

function setup(options: Options = {}) {
  const calls: { projectId: string; tokenId: string; request: RunnerOp }[] = [];
  const order: string[] = [];
  const deps: RunnerDeps = {
    findTokenByHash: async () => { order.push("token"); return options.tokenRecord === undefined ? { id: "agent-token", projectId: "project-1", expiresAt: null, revokedAt: null } : options.tokenRecord; },
    projectAccess: async () => { order.push("access"); return options.access ?? { plan: "pro", available: true }; },
    requestLimit: async () => { order.push("limit"); return options.limited ? { ok: false, reason: "Too many requests.", code: "RATE_LIMITED", retryAfterSec: 42 } : null; },
    runnerOp: async (input) => { order.push("op"); calls.push(input); return options.result ?? { ok: true, body: { ok: true, paused: false } }; },
  };
  return { request: makeRunnerRequest(deps), calls, order };
}

describe("runnerRequest", () => {
  it("passes the token's project and token id to the service after access and the request limit", async () => {
    const { request, calls, order } = setup();
    assert.deepEqual(await request(agentHeader, start), { ok: true, body: { ok: true, paused: false } });
    assert.deepEqual(order, ["token", "access", "limit", "op"]);
    assert.deepEqual(calls, [{ projectId: "project-1", tokenId: "agent-token", request: { op: "start", session: SESSION, mode: "session", host: "desk", branch: null, permission: null, autostart: false, takeover: false } }]);
  });

  it("refuses missing, malformed, unknown, revoked and owner tokens before any service call", async () => {
    for (const header of [null, "Token abc", "Bearer nope", `Bearer ${newToken("owner").plain}`]) {
      const { request, calls } = setup();
      assert.deepEqual(await request(header, start), { ok: false, status: 401, reason: "bearer token required" });
      assert.deepEqual(calls, []);
    }
    for (const record of [null, { id: "agent-token", projectId: "project-1", expiresAt: null, revokedAt: new Date() }]) {
      const { request, calls } = setup({ tokenRecord: record });
      assert.deepEqual(await request(agentHeader, start), { ok: false, status: 401, reason: "invalid or revoked token" });
      assert.deepEqual(calls, []);
    }
  });

  it("refuses an unavailable project with its reason, before counting the request", async () => {
    const { request, calls, order } = setup({ access: { plan: "free", available: false, code: "not-selected", reason: "not selected" } });
    assert.deepEqual(await request(agentHeader, start), { ok: false, status: 403, reason: "not selected" });
    assert.deepEqual(order, ["token", "access"]);
    assert.deepEqual(calls, []);
  });

  it("returns the shared 429 shape when the project budget is used up", async () => {
    const { request, calls } = setup({ limited: true });
    const result = await request(agentHeader, start);
    assert.deepEqual(result, { ok: false, reason: "Too many requests.", code: "RATE_LIMITED", retryAfterSec: 42, status: 429 });
    assert.deepEqual(calls, []);
    const response = runnerResponse(result);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "42");
    assert.deepEqual(await response.json(), { error: "Too many requests.", code: "RATE_LIMITED", retryAfterSec: 42 });
  });

  it("answers 400 for a body outside the table, after the limit, without a service call", async () => {
    const { request, calls } = setup();
    assert.deepEqual(await request(agentHeader, { ...start, session: "not-a-uuid" }), { ok: false, status: 400, reason: INVALID_RUNNER_REQUEST });
    assert.deepEqual(calls, []);
  });
});

describe("runnerRequest with a user token", () => {
  const user = newToken("user");
  const header = `Bearer ${user.plain}`;
  function userSetup(projectId: string | null = "project-1") {
    const slugs: string[] = [];
    const calls: { projectId: string; tokenId: string }[] = [];
    const deps: RunnerDeps = {
      findTokenByHash: async () => { throw new Error("hu_ must not reach the agent-token lookup"); },
      findUserTokenByHash: async () => ({ id: "user-token", userId: "user1", expiresAt: null, revokedAt: null }),
      projectFor: async (slug) => { slugs.push(slug); return projectId; },
      projectAccess: async () => ({ plan: "pro", available: true }),
      requestLimit: async () => null,
      runnerOp: async (input) => { calls.push({ projectId: input.projectId, tokenId: input.tokenId }); return { ok: true, body: { ok: true, paused: true } }; },
    };
    return { request: makeRunnerRequest(deps), slugs, calls };
  }

  it("takes the project from the body and records the user token id", async () => {
    const { request, slugs, calls } = userSetup();
    assert.deepEqual(await request(header, { ...start, project: "mine" }), { ok: true, body: { ok: true, paused: true } });
    assert.deepEqual(slugs, ["mine"]);
    assert.deepEqual(calls, [{ projectId: "project-1", tokenId: "user-token" }]);
  });

  it("refuses a missing project and a foreign project without a service call", async () => {
    const missing = userSetup();
    const noProject = await missing.request(header, start);
    assert.equal(noProject.ok === false && noProject.status, 401);
    assert.deepEqual(missing.calls, []);
    const foreign = userSetup(null);
    const notYours = await foreign.request(header, { ...start, project: "theirs" });
    assert.equal(notYours.ok === false && notYours.status, 403);
    assert.deepEqual(foreign.calls, []);
  });
});

describe("parseRunnerRequest", () => {
  it("accepts every row of the table", () => {
    assert.deepEqual(parseRunnerRequest({ op: "start", session: SESSION.toUpperCase(), mode: "resident", host: "desk", branch: "main", permission: "allowlist", autostart: true, takeover: true }),
      { op: "start", session: SESSION, mode: "resident", host: "desk", branch: "main", permission: "allowlist", autostart: true, takeover: true });
    assert.deepEqual(parseRunnerRequest({ op: "beat", session: SESSION }), { op: "beat", session: SESSION, state: null, waitReason: null, lastResult: null, lastLog: null });
    assert.deepEqual(parseRunnerRequest({ op: "beat", session: SESSION, state: "waiting", waitReason: "dirty", lastResult: "ITEM-01 done", lastLog: "2026-10-20T12-00-00Z.jsonl" }),
      { op: "beat", session: SESSION, state: "waiting", waitReason: "dirty", lastResult: "ITEM-01 done", lastLog: "2026-10-20T12-00-00Z.jsonl" });
    for (const reason of ["owner", "stuck", "error", "plan"]) assert.deepEqual(parseRunnerRequest({ op: "stop", session: SESSION, reason }), { op: "stop", session: SESSION, reason });
    assert.deepEqual(parseRunnerRequest({ op: "autostart", session: SESSION, state: "on", host: "desk", branch: "main" }),
      { op: "autostart", session: SESSION, state: "on", host: "desk", branch: "main", code: null });
    assert.deepEqual(parseRunnerRequest({ op: "autostart", session: SESSION, state: "off", host: "desk" }),
      { op: "autostart", session: SESSION, state: "off", host: "desk", branch: null, code: null });
    for (const code of ["dirty", "autostart-branch", "detached", "push-url", "checkout-in-use", "other"]) {
      assert.deepEqual(parseRunnerRequest({ op: "autostart", session: SESSION, state: "refused", host: "desk", branch: "main", code }),
        { op: "autostart", session: SESSION, state: "refused", host: "desk", branch: "main", code });
    }
    assert.deepEqual(parseRunnerRequest({ ...start, project: "mine" })?.op, "start");
  });

  it("rejects everything outside the table", () => {
    const long = (n: number) => "x".repeat(n);
    for (const body of [
      null, [], "start", {}, { op: "pause", session: SESSION },
      { ...start, session: undefined }, { ...start, session: "1234" },
      { ...start, mode: "cloud" }, { ...start, host: "" }, { ...start, host: long(65) }, { ...start, host: 7 },
      { ...start, extra: true }, { ...start, state: "idle" },
      { ...start, mode: "resident" }, { ...start, mode: "resident", branch: "main" }, { ...start, mode: "resident", permission: "auto" },
      { ...start, branch: long(256) }, { ...start, permission: "ask" }, { ...start, autostart: "yes" }, { ...start, takeover: 1 },
      { op: "beat", session: SESSION, state: "stopped" }, { op: "beat", session: SESSION, state: "waiting" },
      { op: "beat", session: SESSION, waitReason: "dirty" }, { op: "beat", session: SESSION, state: "idle", waitReason: "branch" },
      { op: "beat", session: SESSION, state: "waiting", waitReason: "late" },
      { op: "beat", session: SESSION, lastResult: long(151) }, { op: "beat", session: SESSION, lastResult: "" },
      { op: "beat", session: SESSION, lastLog: "runs/a.jsonl" }, { op: "beat", session: SESSION, lastLog: "runs\\a.jsonl" }, { op: "beat", session: SESSION, lastLog: long(101) },
      { op: "beat", session: SESSION, reason: "owner" },
      { op: "stop", session: SESSION }, { op: "stop", session: SESSION, reason: "replaced" }, { op: "stop", session: SESSION, reason: "owner", state: "idle" },
      { op: "stop", session: SESSION, reason: "signin" },
      { op: "autostart", session: SESSION, host: "desk", branch: "main" }, { op: "autostart", session: SESSION, state: "paused", host: "desk", branch: "main" },
      { op: "autostart", session: SESSION, state: "on", branch: "main" }, { op: "autostart", session: SESSION, state: "on", host: long(65), branch: "main" },
      { op: "autostart", session: SESSION, state: "on", host: "desk" }, { op: "autostart", session: SESSION, state: "on", host: "desk", branch: "main", code: "dirty" },
      { op: "autostart", session: SESSION, state: "refused", host: "desk", branch: "main" },
      { op: "autostart", session: SESSION, state: "refused", host: "desk", branch: "main", code: "no-claude" },
      { op: "autostart", session: SESSION, state: "refused", host: "desk", code: "dirty" },
      { op: "autostart", session: SESSION, state: "off", host: "desk", code: "dirty" },
      { op: "autostart", session: SESSION, state: "on", host: "desk", branch: "main", reason: "owner" },
      { op: "autostart", state: "on", host: "desk", branch: "main" },
    ]) assert.equal(parseRunnerRequest(body), null, JSON.stringify(body));
  });
});

describe("Codex runner request boundary", () => {
  const codex = { op: "start", client: "codex", session: SESSION, mode: "resident", host: "desk", branch: "dev", permission: "scoped", autostart: false };
  it("requires explicit scoped resident policy and rejects unknown clients on every operation", () => {
    assert.equal(parseRunnerRequest(codex)?.client, "codex");
    for (const patch of [{ client: null }, { client: "" }, { client: "other" }, { client: "claude" }, { client: undefined },
      { mode: "session" }, { permission: "auto" }, { permission: "allowlist" }, { permission: null }, { branch: null }, { autostart: true }, { autostart: undefined }]) {
      assert.equal(parseRunnerRequest({ ...codex, ...patch }), null, JSON.stringify(patch));
    }
    for (const body of [{ op: "beat", session: SESSION }, { op: "stop", session: SESSION, reason: "owner" },
      { op: "autostart", session: SESSION, state: "off", host: "desk" }]) {
      for (const client of [null, "", "other", undefined]) assert.equal(parseRunnerRequest({ ...body, client }), null);
    }
  });

  it("refuses Codex sign-in operations before the service", async () => {
    for (const state of ["on", "off", "refused"]) {
      const { request, calls } = setup();
      assert.deepEqual(await request(agentHeader, { op: "autostart", client: "codex", session: SESSION, host: "desk", branch: "dev", state, ...(state === "refused" ? { code: "dirty" } : {}) }),
        { ok: false, status: 400, reason: INVALID_RUNNER_REQUEST });
      assert.deepEqual(calls, []);
    }
  });
});

describe("runnerResponse", () => {
  it("keeps the code and holder that the runner CLI branches on", async () => {
    const busy = runnerResponse({ ok: false, status: 409, code: "RUNNER_BUSY", reason: "busy", holder: { client: "claude", mode: "session", host: "desk", seenAt: "2026-10-20T12:00:00.000Z" } });
    assert.equal(busy.status, 409);
    assert.deepEqual(await busy.json(), { error: "busy", code: "RUNNER_BUSY", holder: { client: "claude", mode: "session", host: "desk", seenAt: "2026-10-20T12:00:00.000Z" } });
    const plan = runnerResponse({ ok: false, status: 403, code: "PLAN_REQUIRED", reason: RESIDENT_RUNNER_PLAN_GATE });
    assert.deepEqual([plan.status, await plan.json()], [403, { error: RESIDENT_RUNNER_PLAN_GATE, code: "PLAN_REQUIRED" }]);
    const gone = runnerResponse({ ok: false, status: 409, code: "RUNNER_REPLACED", reason: "Another runner took over this project. This one stops." });
    assert.deepEqual([gone.status, await gone.json()], [409, { error: "Another runner took over this project. This one stops.", code: "RUNNER_REPLACED" }]);
  });

  it("answers plain failures and successes in the existing REST shape", async () => {
    const invalid = runnerResponse({ ok: false, status: 400, reason: INVALID_RUNNER_REQUEST });
    assert.deepEqual([invalid.status, await invalid.json()], [400, { error: "Invalid runner request." }]);
    const ok = runnerResponse({ ok: true, body: { ok: true, paused: false, stop: "plan" } });
    assert.deepEqual([ok.status, await ok.json()], [200, { ok: true, paused: false, stop: "plan" }]);
  });
});
