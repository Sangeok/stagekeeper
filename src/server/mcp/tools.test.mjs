import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AGENT_TOOL_NAMES, PROJECT_REQUIRED, registerTools as registerProductionTools } from "./tools.ts";
import { NOT_SELECTED_REASON } from "../project-access-query.ts";
import { REVISION_MAX } from "../agents/next.ts";

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
  "backlog_update", "backlog_remove", "token_issue", "command_create"];

const ctx = { http: { authInfo: { extra: { projectId: "p1", tokenId: "t1" } } } };
const ws = [{ id: "web", path: "apps/web", agent: "dev", verify: ["npm test"], knowledge: null, readOnly: [] }];
const open = { plan: "max", available: true };

describe("agent-scoped MCP tools", () => {
  it("registers exactly the §5 Phase-1 agent scope, underscore names only", () => {
    const names = [];
    registerTools({ registerTool: (name) => { names.push(name); } }, {});
    assert.deepEqual([...names].sort(), [...AGENT_TOOL_NAMES].sort());
    for (const n of WEB_ONLY) assert.ok(!names.includes(n), `web-only tool registered: ${n}`);
    for (const n of names) assert.doesNotMatch(n, /\./);
  });
  it("every tool advertises where project comes from and when it is required", () => {
    for (const [name, meta] of Object.entries(descriptions())) {
      const field = meta.inputSchema.shape.project;
      assert.ok(field.isOptional(), `${name}: hs_ compatibility`);
      assert.match(field.description, /harness.json project.slug/, name);
      assert.match(field.description, /Required on every call.*hu_/, name);
      assert.match(field.description, /ignored.*hs_/, name);
    }
    assert.ok(COPY.includes(PROJECT_REQUIRED), "product-copy must document the actual missing-scope error");
  });
  // 문구가 갈리는 두 도구는 product-copy를 그대로 따라야 한다.
  it("board_transition and plan_submit read exactly as product-copy §13 writes them", () => {
    const meta = descriptions();
    for (const tool of ["board_transition", "plan_submit", "agent_next", "backlog_add"]) {
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
  it("pipeline_next hands the key (or none) and the runbook version (or none) through to the deps", async () => {
    const calls = [];
    const handlers = {};
    registerTools({ registerTool: (name, _meta, fn) => { handlers[name] = fn; } }, {
      access: async () => open,
      pipelineNext: async (projectId, key, runbook) => { calls.push([projectId, key, runbook]); return { ok: true, item: key ? { key, node: "plan", version: 1, action: "dispatch", agent: "dev", hint: "h" } : { head: null, items: [] } }; },
    });
    const one = await handlers.pipeline_next({ key: "X-1" }, ctx);
    await handlers.pipeline_next({}, ctx);
    // 세션이 자기 CLAUDE.md의 판을 넘긴다. 모양은 여기서 재지 않는다 — 틀린 값도 호출은 성공하고 판정 쪽이 무시한다.
    await handlers.pipeline_next({ runbook: "a85859257e4c" }, ctx);
    await handlers.pipeline_next({ runbook: "not-a-version" }, ctx);
    assert.deepEqual(calls, [["p1", "X-1", undefined], ["p1", undefined, undefined], ["p1", undefined, "a85859257e4c"], ["p1", undefined, "not-a-version"]]);
    assert.equal(JSON.parse(one.content[0].text).action, "dispatch");
  });
});

// 잠금은 인증이 아니라 도구 층에서 건다 — mcp-handler 2.1.1의 401은 사유를 실을 수 없다.
describe("not-selected projects", () => {
  const locked = { plan: "free", available: false, code: "not-selected", reason: NOT_SELECTED_REASON };
  const handlersWith = (extra = {}) => {
    const h = {};
    registerTools({ registerTool: (name, _meta, fn) => { h[name] = fn; } }, { access: async () => locked, ...extra });
    return h;
  };
  const body = (r) => JSON.parse(r.content[0].text);

  // 등록된 도구 전부에서 허용 목록만 뺀 집합을 돈다 — 손으로 쓴 목록이면 게이트를 빼먹은 새 도구가 통과한다.
  // project_get은 의도적인 예외다(아래 시험): 잠금 사유를 에이전트에게 전하는 유일한 통로다.
  const ANSWERS_WHEN_LOCKED = new Set(["project_get"]);
  const ARGS = {
    board_propose: { key: "X-1", agent: "dev", reason: "r" },
    board_transition: { key: "X-1", to: "in_review" },
    plan_submit: { key: "X-1", path: "p", commit: "c" },
    report_submit: { key: "X-1", actor: "dev", path: "p", commit: "c" },
    validation_record: { key: "X-1", text: "clean" },
    project_sync: { workspaces: ws },
    pipeline_next: { key: "X-1" },
    backlog_get: { key: "X-1" },
    board_get: { key: "X-1" },
    agent_next: { agent: "dev" },
  };

  it("refuses every agent tool but project_get with the lock reason", async () => {
    const h = handlersWith();
    const calls = AGENT_TOOL_NAMES.filter((name) => !ANSWERS_WHEN_LOCKED.has(name)).map((name) => [name, ARGS[name] ?? {}]);
    assert.ok(calls.length > 0);
    for (const [name, args] of calls) {
      const r = await h[name](args, ctx);
      assert.equal(r.isError, true, name);
      assert.equal(body(r).error, NOT_SELECTED_REASON, name);
    }
  });

  it("project_get still answers, and carries the reason — the only channel the agent has", async () => {
    const h = handlersWith({ projectGet: async () => ({ id: "p1", slug: "s", workspaces: [] }) });
    const r = await h.project_get({}, ctx);
    assert.notEqual(r.isError, true);
    assert.equal(body(r).available, false);
    assert.equal(body(r).reason, NOT_SELECTED_REASON);
  });

  it("an unlocked project passes through untouched", async () => {
    const h = handlersWith({ access: async () => open, projectGet: async () => ({ id: "p1", slug: "s", workspaces: [] }) });
    const r = await h.project_get({}, ctx);
    assert.equal(body(r).available, true);
  });

  it("returns only an error on an integrity failure without fetching project details", async () => {
    const h = handlersWith({
      access: async () => ({ plan: "free", available: false, code: "integrity", reason: "Project ownership is unavailable." }),
      projectGet: async () => { throw new Error("project detail must not be fetched"); },
    });
    const result = await h.project_get({}, ctx);
    assert.equal(result.isError, true);
    assert.deepEqual(body(result), { error: "Project ownership is unavailable." });
  });

  it("serializes every legacy project and workspace field without D1 shadow fields", async () => {
    const project = {
      id: "p1", slug: "s", name: "Stagekeeper", owner: "octocat", repo: "stagekeeper", branch: "main",
      language: "ko", executorKind: "local", commandIssue: null, runbookVersion: null,
      createdAt: new Date("2026-09-13T00:00:00Z"),
      workspaces: [{
        id: "w1", projectId: "p1", wsId: "web", path: "apps/web", agent: "dev",
        verify: ["npm test", "npm run build"], knowledge: null, readOnly: ["docs/**"],
      }],
    };
    const h = handlersWith({ access: async () => open, projectGet: async () => project });

    const r = await h.project_get({}, ctx);

    assert.deepEqual(body(r), { ...project, createdAt: "2026-09-13T00:00:00.000Z", available: true });
    assert.equal("ownerUserId" in body(r), false);
    assert.equal("repoOwner" in body(r), false);
    assert.equal(body(r).available, true);
  });
});

// hu_ — 프로젝트가 토큰이 아니라 인자에서 온다. 인가는 scope() 한 곳에서 호출마다 일어난다.
describe("user-scoped tokens resolve the project from the argument", () => {
  const userCtx = { http: { authInfo: { extra: { userId: "user1", tokenId: "usr1" } } } };
  const body = (r) => JSON.parse(r.content[0].text);
  const handlersWith = (extra = {}) => {
    const h = {};
    registerTools({ registerTool: (name, _meta, fn) => { h[name] = fn; } }, { access: async () => open, ...extra });
    return h;
  };

  it("(b) a slug the user owns resolves, and projectFor sees the slug and the user", async () => {
    const seen = [];
    const h = handlersWith({
      projectFor: async (slug, userId) => { seen.push([slug, userId]); return "p1"; },
      backlogList: async (projectId) => [{ projectId }],
    });
    const r = await h.backlog_list({ project: "mine" }, userCtx);
    assert.notEqual(r.isError, true);
    assert.deepEqual(seen, [["mine", "user1"]]);
    assert.deepEqual(body(r), [{ projectId: "p1" }]);
  });

  it("(c) someone else's slug is refused with the owner wording, and no domain query runs", async () => {
    const h = handlersWith({
      projectFor: async () => null,
      backlogList: async () => { throw new Error("must not query a project the user does not own"); },
    });
    const r = await h.backlog_list({ project: "theirs" }, userCtx);
    assert.equal(r.isError, true);
    assert.equal(body(r).error, "not the owner of this project");
  });

  it("(d) a missing project argument is refused and says how to fix it", async () => {
    const h = handlersWith({ projectFor: async () => { throw new Error("must not look up without a slug"); } });
    const r = await h.backlog_list({}, userCtx);
    assert.equal(r.isError, true);
    assert.match(body(r).error, /^project required: send harness\.json project\.slug as project/);
  });

  it("every registered tool rejects a missing project before accessing domain data", async () => {
    const h = handlersWith({
      access: async () => { throw new Error("must not access without scope"); },
      projectFor: async () => { throw new Error("must not resolve without scope"); },
    });
    for (const name of AGENT_TOOL_NAMES) {
      const result = await h[name]({}, userCtx);
      assert.equal(result.isError, true, name);
      assert.equal(body(result).error, PROJECT_REQUIRED, name);
    }
  });

  it("scopes init sync, pipeline dispatch, and agent resume/outcomes on every call", async () => {
    const calls = [];
    const h = handlersWith({
      projectFor: async (slug, userId) => { assert.equal(userId, "user1"); return slug === "mine" ? "p1" : "p2"; },
      projectSync: async (id) => { calls.push(["sync", id]); return { ok: true, item: ws.length }; },
      pipelineNext: async (id) => { calls.push(["pipeline", id]); return { ok: true, item: {} }; },
      agentNext: async (id, tokenId, input) => {
        assert.equal(tokenId, "usr1");
        calls.push([input.outcome ?? "resume", id]);
        return { ok: true, item: { done: true } };
      },
    });
    for (const project of ["mine", "another"]) {
      const args = { project, agent: "dev", workspaces: ws };
      for (const name of ["project_sync", "pipeline_next", "agent_next"]) assert.notEqual((await h[name](args, userCtx)).isError, true);
      assert.notEqual((await h.agent_next({ ...args, outcome: "ok", receipt: { runId: "run", revision: 0, stepId: "verify" } }, userCtx)).isError, true);
    }
    assert.deepEqual(calls, ["p1", "p2"].flatMap((id) => ["sync", "pipeline", "resume", "ok"].map((name) => [name, id])));
  });

  it("every state-changing tool goes through the same gate", async () => {
    const h = handlersWith({ projectFor: async () => null });
    const calls = [
      ["board_propose", { key: "X-1", agent: "dev", reason: "r" }],
      ["board_transition", { key: "X-1", to: "in_review" }],
      ["plan_submit", { key: "X-1", path: "p", commit: "c" }],
      ["report_submit", { key: "X-1", actor: "dev", path: "p", commit: "c" }],
      ["validation_record", { key: "X-1", text: "clean" }],
      ["project_sync", { workspaces: ws }],
      ["pipeline_next", { key: "X-1" }],
      ["backlog_get", { key: "X-1" }], ["board_list", {}], ["board_get", { key: "X-1" }],
      ["agent_next", { agent: "dev" }], ["project_get", {}],
    ];
    for (const [name, args] of calls) {
      const r = await h[name]({ ...args, project: "theirs" }, userCtx);
      assert.equal(r.isError, true, name);
      assert.equal(body(r).error, "not the owner of this project", name);
    }
  });

  it("(a) an agent token never consults projectFor — the hs_ branch returns first", async () => {
    const h = handlersWith({
      projectFor: async () => { throw new Error("hs_ must not resolve a slug"); },
      backlogList: async (projectId) => [{ projectId }],
    });
    const r = await h.backlog_list({ project: "ignored" }, ctx);
    assert.deepEqual(body(r), [{ projectId: "p1" }]);
  });
});

it("MCP receipt schema rejects invalid revisions and retains the complete receipt", () => {
  const schema = descriptions().agent_next.inputSchema;
  const base = { agent: "dev", outcome: "ok", receipt: { runId: "r", stepId: "verify", revision: 1 } };
  assert.deepEqual(schema.parse(base), base);
  assert.equal(schema.safeParse({ ...base, receipt: { ...base.receipt, revision: REVISION_MAX } }).success, true);
  for (const revision of [-1, 0.5, REVISION_MAX + 1]) assert.equal(schema.safeParse({ ...base, receipt: { ...base.receipt, revision } }).success, false);
});
it("invalid normalized workspaces never reach projectSync", async () => {
  const handlers = {};
  let calls = 0;
  registerTools({ registerTool: (name, _meta, handler) => { handlers[name] = handler; } }, { access: async () => open, projectSync: async () => { calls++; } });
  const result = await handlers.project_sync({ workspaces: [{ ...ws[0], verify: [] }] }, ctx);
  assert.equal(result.isError, true);
  assert.equal(calls, 0);
});

it("backlog_add requires the scout payload and strips any client-assigned key", async () => {
  const meta = descriptions();
  const input = { runId: "run", title: "problem", area: "src", source: "Evidence: our hole", type: "fix" };
  for (const field of Object.keys(input)) {
    const missing = { ...input }; delete missing[field];
    assert.equal(meta.backlog_add.inputSchema.safeParse(missing).success, false, field);
  }
  assert.equal(meta.backlog_add.inputSchema.safeParse({ ...input, type: "bug" }).success, false);
  assert.deepEqual(meta.backlog_add.inputSchema.parse({ ...input, key: "FORGED-1" }), input);
  assert.equal(meta.plan_submit.inputSchema.safeParse({ key: "K", path: "p", commit: "c" }).success, true);
  assert.equal(meta.plan_submit.inputSchema.safeParse({ key: "K", path: "p", commit: "c", type: "bug" }).success, false);
  const calls = [];
  const handlers = {};
  registerTools({ registerTool: (name, _meta, fn) => { handlers[name] = fn; } }, {
    access: async () => open,
    projectFor: async (slug, user) => slug === "owned" && user === "u" ? "p2" : null,
    backlogAdd: async (projectId, payload) => { calls.push([projectId, payload]); return { ok: true, item: { key: "ITEM-01" } }; },
  });
  assert.deepEqual(JSON.parse((await handlers.backlog_add(input, ctx)).content[0].text), { key: "ITEM-01" });
  const user = { http: { authInfo: { extra: { userId: "u", tokenId: "t" } } } };
  assert.equal((await handlers.backlog_add(input, user)).isError, true);
  assert.equal((await handlers.backlog_add({ ...input, project: "foreign" }, user)).isError, true);
  assert.equal((await handlers.backlog_add({ ...input, project: "owned" }, user)).isError, undefined);
  assert.deepEqual(calls.map(([projectId]) => projectId), ["p1", "p2"]);
});
const registerTools = (server, deps) => registerProductionTools(server, { requestLimit: async () => null, ...deps });
