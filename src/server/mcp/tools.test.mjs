import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_TOOL_NAMES, registerTools } from "./tools.ts";

// 웹 전용 — 에이전트 토큰용 서버에 절대 없어야 한다(불변식 4의 회귀 가드).
const WEB_ONLY = ["gate_approve", "board_approve", "board_bounce", "board_hold", "board_discard", "board_resume",
  "backlog_add", "backlog_update", "backlog_remove", "token_issue", "command_create"];

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
});
