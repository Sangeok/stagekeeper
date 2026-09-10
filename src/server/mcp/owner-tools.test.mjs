import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OWNER_TOOL_NAMES, registerOwnerTools } from "./owner-tools.ts";
import { AGENT_TOOL_NAMES } from "./tools.ts";

const ctx = { http: { authInfo: { extra: { projectId: "p1", userId: "u1", ownerTokenId: "o1" } } } };
const body = (r) => JSON.parse(r.content[0].text);
const handlersWith = (deps) => {
  const h = {};
  registerOwnerTools({ registerTool: (name, _meta, fn) => { h[name] = fn; } }, deps);
  return h;
};
const next = { key: "X-1", node: "implement", version: 2, action: "dispatch", agent: "web-dev", hint: "Dispatch with the item key. One item per dispatch." };

describe("owner-scoped MCP tools", () => {
  it("registers exactly gate_approve — and none of the agent tools (pipeline_next included)", () => {
    const names = [];
    registerOwnerTools({ registerTool: (name) => { names.push(name); } }, {});
    assert.deepEqual(names, [...OWNER_TOOL_NAMES]);
    assert.ok(AGENT_TOOL_NAMES.includes("pipeline_next"));
    for (const n of AGENT_TOOL_NAMES) assert.ok(!names.includes(n), `agent tool on the owner server: ${n}`);
  });
  it("refuses calls that carry no user scope", async () => {
    const h = handlersWith({});
    await assert.rejects(() => h.gate_approve({ key: "X-1", gate: "before-plan" }, { http: { authInfo: { extra: { projectId: "p1" } } } }), /unauthenticated/);
  });
  it("hands key, gate, planCommit and the user to the deps, and returns { item, next } — no runbook step (H.6)", async () => {
    const calls = [];
    const h = handlersWith({
      member: async () => true,
      access: async () => ({ plan: "pro", locked: false }),
      gate: async (projectId, userId, input) => { calls.push({ projectId, userId, input }); return { ok: true, item: { item: { agent: "web-dev", status: "implementing" }, next } }; },
    });
    const r = await h.gate_approve({ key: "X-1", gate: "before-implement", planCommit: "3f2a9c1" }, ctx);
    assert.deepEqual(calls, [{ projectId: "p1", userId: "u1", input: { key: "X-1", gate: "before-implement", planCommit: "3f2a9c1" } }]);
    assert.equal(body(r).item.status, "implementing");
    assert.deepEqual(body(r).next, next);
    assert.equal(body(r).next.step, undefined);
  });
  it("a refused gate carries no next", async () => {
    const h = handlersWith({ member: async () => true, access: async () => ({ plan: "pro", locked: false }), gate: async () => ({ ok: false, reason: "not waiting at before-implement — the item is at verify" }) });
    const r = await h.gate_approve({ key: "X-1", gate: "before-implement", planCommit: "0000000" }, ctx);
    assert.equal(r.isError, true);
    assert.match(body(r).error, /not waiting at/);
    assert.equal(body(r).next, undefined);
  });
  it("refuses on a locked project and on a plan without session approvals", async () => {
    const locked = handlersWith({ member: async () => true, access: async () => ({ plan: "free", locked: true, reason: "project cap reached on the free plan (1); this project is locked" }) });
    assert.match(body(await locked.gate_approve({ key: "X-1", gate: "before-plan" }, ctx)).error, /this project is locked/);
    const free = handlersWith({ member: async () => true, access: async () => ({ plan: "free", locked: false }), gate: async () => { throw new Error("must not be called"); } });
    assert.match(body(await free.gate_approve({ key: "X-1", gate: "before-plan" }, ctx)).error, /not on the free plan/);
  });
  it("refuses a caller who is no longer a member — before lock, plan, or gate are consulted", async () => {
    const seen = [];
    const h = handlersWith({
      member: async (projectId, userId) => { seen.push(["member", projectId, userId]); return false; },
      access: async () => { throw new Error("must not be called"); },
      gate: async () => { throw new Error("must not be called"); },
    });
    const r = await h.gate_approve({ key: "X-1", gate: "before-plan" }, ctx);
    assert.equal(r.isError, true);
    assert.match(body(r).error, /not a member of this project/);
    assert.deepEqual(seen, [["member", "p1", "u1"]]);
  });
});
