import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_TOOL_NAMES, registerTools } from "./tools.ts";

// 웹 전용 — 에이전트 토큰용 서버에 절대 없어야 한다(불변식 4의 회귀 가드).
const WEB_ONLY = ["gate_approve", "board_approve", "board_bounce", "board_hold", "board_discard", "board_resume",
  "backlog_add", "backlog_update", "backlog_remove", "token_issue", "command_create"];

const ctx = { http: { authInfo: { extra: { projectId: "p1", tokenId: "t1" } } } };
const ws = [{ id: "web", path: "apps/web", agent: "dev", verify: ["npm test"], knowledge: null, readOnly: [] }];
const open = { plan: "max", locked: false };

describe("agent-scoped MCP tools", () => {
  it("registers exactly the §5 Phase-1 agent scope, underscore names only", () => {
    const names = [];
    registerTools({ registerTool: (name) => { names.push(name); } }, {});
    assert.deepEqual([...names].sort(), [...AGENT_TOOL_NAMES].sort());
    for (const n of WEB_ONLY) assert.ok(!names.includes(n), `web-only tool registered: ${n}`);
    for (const n of names) assert.doesNotMatch(n, /\./);
  });
  it("handlers refuse calls that carry no project scope", async () => {
    const handlers = {};
    registerTools({ registerTool: (name, _meta, fn) => { handlers[name] = fn; } }, {});
    await assert.rejects(() => handlers.project_get({}, { http: {} }), /unauthenticated/);
    await assert.rejects(() => handlers.board_propose({ key: "X-1", agent: "dev", reason: "r" }, {}), /unauthenticated/);
  });
  it("project_sync hands language through to the deps — absent stays undefined", async () => {
    const calls = [];
    const handlers = {};
    registerTools({ registerTool: (name, _meta, fn) => { handlers[name] = fn; } }, {
      access: async () => open,
      projectSync: async (projectId, workspaces, language) => { calls.push({ projectId, workspaces, language }); return { ok: true, item: workspaces.length }; },
    });
    await handlers.project_sync({ workspaces: ws, language: "ko" }, ctx);
    await handlers.project_sync({ workspaces: ws }, ctx);
    assert.deepEqual(calls.map((c) => [c.projectId, c.language]), [["p1", "ko"], ["p1", undefined]]);
  });
});

// T4.8. 잠금은 인증이 아니라 도구 층에서 건다 — mcp-handler 2.1.1의 401은 사유를 실을 수 없다.
describe("locked projects", () => {
  const locked = { plan: "free", locked: true, reason: "project cap reached on the free plan (1); this project is locked" };
  const handlersWith = (extra = {}) => {
    const h = {};
    registerTools({ registerTool: (name, _meta, fn) => { h[name] = fn; } }, { access: async () => locked, ...extra });
    return h;
  };
  const body = (r) => JSON.parse(r.content[0].text);

  it("refuses the state-changing tools with the lock reason", async () => {
    const h = handlersWith();
    const calls = [
      ["board_propose", { key: "X-1", agent: "dev", reason: "r" }],
      ["board_transition", { key: "X-1", to: "in_review" }],
      ["plan_submit", { key: "X-1", path: "p", commit: "c" }],
      ["report_submit", { key: "X-1", actor: "dev", path: "p", commit: "c" }],
      ["validation_record", { key: "X-1", text: "clean" }],
      ["project_sync", { workspaces: ws }],
    ];
    for (const [name, args] of calls) {
      const r = await h[name](args, ctx);
      assert.equal(r.isError, true, name);
      assert.match(body(r).error, /this project is locked/, name);
    }
  });

  it("project_get still answers, and carries the reason — the only channel the agent has", async () => {
    const h = handlersWith({ projectGet: async () => ({ id: "p1", slug: "s", workspaces: [] }) });
    const r = await h.project_get({}, ctx);
    assert.notEqual(r.isError, true);
    assert.equal(body(r).locked, true);
    assert.match(body(r).reason, /this project is locked/);
  });

  it("an unlocked project passes through untouched", async () => {
    const h = handlersWith({ access: async () => open, projectGet: async () => ({ id: "p1", slug: "s", workspaces: [] }) });
    const r = await h.project_get({}, ctx);
    assert.equal(body(r).locked, undefined);
  });
});
