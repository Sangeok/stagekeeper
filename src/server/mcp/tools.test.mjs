import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AGENT_TOOL_NAMES, registerTools } from "./tools.ts";

// product-copy.md §13의 행 하나. 백틱과 굵은글은 마크다운 서식이라 떼고 비교한다.
const COPY = readFileSync(new URL("../../../docs/conventions/product-copy.md", import.meta.url), "utf8");
const TICK = "`";
const copyRow = (tool) => {
  const head = `| ${TICK}${tool}${TICK} | `;
  // 작업본이 CRLF일 수 있다 — 끝의 CR을 떼지 않으면 표 끝의 `|`가 안 떨어진다.
  const line = COPY.split(/\r?\n/).find((l) => l.startsWith(head));
  return line === undefined ? null : line.slice(head.length).trimEnd().replace(/\|$/, "").trimEnd().replaceAll(TICK, "").replaceAll("**", "");
};
const descriptions = () => {
  const meta = {};
  registerTools({ registerTool: (name, m) => { meta[name] = m; } }, {});
  return meta;
};

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
  // PR #34가 plan_submit에 전이를 합치고 product-copy는 갱신했는데 등록 문구가 따라오지 않았다.
  // 그래서 모든 에이전트 세션이 옛 프로토콜을 읽었고, 그 문구를 인용한 계획서가 구현 직전에 막혔다(실측).
  // 문구가 갈리는 두 도구는 product-copy를 그대로 따라야 한다.
  it("board_transition and plan_submit read exactly as product-copy §13 writes them", () => {
    const meta = descriptions();
    for (const tool of ["board_transition", "plan_submit"]) {
      const expected = copyRow(tool);
      assert.ok(expected, `no product-copy row for ${tool}`);
      assert.equal(meta[tool].description, expected, tool);
    }
  });
  it("no tool still calls planning → in_review an agent transition", () => {
    for (const [name, m] of Object.entries(descriptions())) {
      assert.doesNotMatch(m.description ?? "", /planning → in_review \(after plan_submit\)/, name);
    }
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
  it("pipeline_next hands the key (or none) through to the deps", async () => {
    const calls = [];
    const handlers = {};
    registerTools({ registerTool: (name, _meta, fn) => { handlers[name] = fn; } }, {
      access: async () => open,
      pipelineNext: async (projectId, key) => { calls.push([projectId, key]); return { ok: true, item: key ? { key, node: "plan", version: 1, action: "dispatch", agent: "dev", hint: "h" } : { head: null, items: [] } }; },
    });
    const one = await handlers.pipeline_next({ key: "X-1" }, ctx);
    await handlers.pipeline_next({}, ctx);
    assert.deepEqual(calls, [["p1", "X-1"], ["p1", undefined]]);
    assert.equal(JSON.parse(one.content[0].text).action, "dispatch");
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
      ["pipeline_next", { key: "X-1" }],
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
