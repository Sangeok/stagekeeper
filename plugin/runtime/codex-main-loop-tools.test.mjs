import assert from "node:assert/strict";
import { RoleGitInputError, RoleGitPathMissingError } from "./role-git.mjs";
import { it } from "node:test";
import path from "node:path";
import { createMainLoopTools } from "./codex-main-loop-tools.mjs";
import { createMainLoopBridge } from "./codex-main-loop.mjs";

const names = ["pipeline_next", "board_get", "backlog_get", "backlog_list", "project_get", "validation_record", "report_submit", "acceptance_fail"];
async function fixture(overrides = {}) {
  const controller = new AbortController(), calls = [], roles = [], commits = [];
  const root = path.resolve("test-resident-root"), scratch = path.resolve("test-resident-scratch");
  const state = { active: true, paused: false, policy: { commit: true, propose: false },
    next: { key: "K-1", action: "dispatch", agent: "dev", format: "slots-v1", entry: { runId: "p", entryId: "e", slotId: "plan" }, agentRunId: "a" },
    board: { status: "planning", planPath: "docs/plans/K-1.md", planCommit: "a".repeat(40) } };
  const guard = async ({ allowPaused = false } = {}) => {
    controller.signal.throwIfAborted();
    if (!state.active || (state.paused && !allowPaused)) throw new Error("Lease unavailable");
    return { policy: state.policy };
  };
  const context = { input: { binding: { root }, config: { project: { slug: "test-project" }, workspaces: [{ agent: "dev", path: "src" }] } },
    files: { lock: path.join(root, ".git/harness/watch.lock.json") }, session: "session", branch: "fixture", scratch, fileBroker: {}, lifecycle: {}, signal: controller.signal, guard,
    commandBroker: { tools: [{ name: "role_file_write" }, { name: "role_file_read" }], call: async (name, args) => { calls.push({ name, args }); return {}; } } };
  const tools = await createMainLoopTools(context, {
    listTools: async () => [...names.map(name => ({ name })), { name: "gate_approve" }, { name: "agent_next" }],
    callTool: async (_input, name, args) => { calls.push({ name, args }); return name === "pipeline_next" ? state.next : name === "board_get" ? state.board : {}; },
    commitResidentArtifacts: input => { commits.push(input); return { commit: "b".repeat(40) }; },
    dispatchFreshRole: async (...args) => { roles.push(args); return { event: "completed", threadId: "fresh", done: true, receipt: { receipt: { runId: "a", revision: 1, stepId: "plan" } }, report: "evidence" }; },
    ...overrides,
  });
  return { tools, state, calls, roles, commits, controller, root, scratch };
}

it("exposes only bounded main-loop tools and rejects owner, role cursor, identity and extra arguments", async () => {
  const f = await fixture();
  assert.equal(f.tools.tools.some(tool => ["gate_approve", "agent_next"].includes(tool.name)), false);
  for (const [name, args] of [["gate_approve", {}], ["agent_next", {}], ["project_get", { project: "other" }], ["project_get", { client: "claude" }],
    ["resident_dispatch", { key: "K-1", previousVerdict: "pass" }], ["resident_commit", { key: "K-1" }]]) await assert.rejects(f.tools.call(name, args));
  assert.equal(f.calls.length, 0);
});

it("dispatches only the fresh current binding and never inherits a prior reviewer conclusion", async () => {
  const f = await fixture();
  const result = await f.tools.call("resident_dispatch", { key: "K-1" });
  assert.equal(result.threadId, "fresh"); assert.deepEqual(result.receipt, { runId: "a", revision: 1, stepId: "plan" });
  assert.deepEqual(f.roles[0][3].entry, f.state.next.entry); assert.equal(f.roles[0][3].agentRunId, "a");
  f.state.next = { ...f.state.next, agent: "plan-verifier" };
  await assert.rejects(f.tools.call("resident_dispatch", { key: "K-1" }), /verification paths/);
  await f.tools.call("resident_dispatch", { key: "K-1", requiredVerificationPaths: ["Run the exact test command and inspect its inputs"] });
  assert.deepEqual(f.roles[1][3].requiredVerificationPaths, ["Run the exact test command and inspect its inputs"]);
  f.state.next = { ...f.state.next, agent: "qa-verifier" };
  await assert.rejects(f.tools.call("resident_dispatch", { key: "K-1" }), /foreground handoff/);
  assert.equal(f.roles.length, 2);
});

it("blocks new work, commits and remote calls after pause, ownership loss or cancellation", async () => {
  const f = await fixture();
  for (const change of [() => { f.state.paused = true; }, () => { f.state.paused = false; f.state.active = false; }, () => { f.state.active = true; f.controller.abort(); }]) {
    change(); const before = f.calls.length;
    for (const [name, args] of [["resident_dispatch", { key: "K-1" }], ["resident_commit", { key: "K-1", files: [] }], ["pipeline_next", {}]]) await assert.rejects(f.tools.call(name, args));
    assert.equal(f.calls.length, before);
  }
  assert.equal(f.roles.length, 0); assert.equal(f.commits.length, 0);
});

it("checks the lease again after a remote response and before any dependent mutation", async () => {
  let state;
  const f = await fixture({ callTool: async (_input, name) => { if (name === "pipeline_next") state.active = false; return { action: "accept", key: "K-1" }; } });
  state = f.state;
  await assert.rejects(f.tools.call("resident_commit", { key: "K-1", files: [] }), /Lease/);
  assert.equal(f.commits.length, 0);
});

it("requires stored commit permission and fresh acceptance for report writes or acceptance results", async () => {
  const f = await fixture(); f.state.policy.commit = false;
  await assert.rejects(f.tools.call("resident_commit", { key: "K-1", files: [] }), /Commit permission/);
  await assert.rejects(f.tools.call("report_submit", { key: "K-1", actor: "dev" }), /Main-loop acceptance/);
  await assert.rejects(f.tools.call("acceptance_fail", { key: "K-1", checks: [3], note: "verification blocked" }), /Fresh acceptance/);
  await assert.rejects(f.tools.call("role_file_write", { path: path.join(f.root, "src/main.mjs"), content: "changed", expectedHash: null }), /acceptance report/);
  f.state.next = { action: "accept", key: "K-1" };
  await f.tools.call("role_file_write", { path: path.join(f.root, "docs/agents/main-loop/K-1.md"), content: "evidence", expectedHash: null });
  await f.tools.call("acceptance_fail", { key: "K-1", checks: [3], note: "verification blocked" });
  assert.equal(f.calls.at(-1).name, "acceptance_fail");
});

it("serializes actual HTTP calls, fences queued requests after abort and waits for in-flight cleanup", async () => {
  const controller = new AbortController(); let release, entered;
  const active = new Promise(resolve => { entered = resolve; }), completion = new Promise(resolve => { release = resolve; });
  let calls = 0, closed = false;
  const bridge = await createMainLoopBridge({ tools: [{ name: "bounded" }], call: async () => { calls++; entered(); await completion; return {}; } }, controller.signal);
  const invoke = id => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "bounded", arguments: {} } }) }).then(response => response.json()).catch(() => null);
  try {
    assert.equal((await fetch(bridge.url.replace(/\/mcp\/.+$/, "/mcp/wrong"), { method: "POST" })).status, 404);
    const first = invoke(1); await active; const second = invoke(2);
    controller.abort(); const closing = bridge.close().then(() => { closed = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, false);
    release(); await closing; await Promise.all([first, second]);
    assert.equal(calls, 1); assert.equal(closed, true);
  } finally { release(); if (!closed) await bridge.close(); }
});

it("fences an already queued dispatch when a prior tool receives a policy refusal", async () => {
  let entered, release, calls = 0, refusals = 0;
  const active = new Promise(resolve => { entered = resolve; }), completion = new Promise(resolve => { release = resolve; });
  const bridge = await createMainLoopBridge({ tools: [], call: async () => { calls++; entered(); await completion; throw new Error("Only the current acceptance report may be written"); } },
    new AbortController().signal, () => {}, () => { refusals++; });
  const invoke = id => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: id === 1 ? "role_file_write" : "resident_dispatch", arguments: {} } }) }).then(response => response.json());
  try {
    const first = invoke(1); await active; const queued = invoke(2);
    release();
    assert.equal((await first).error.code, -32000);
    assert.equal((await queued).error.code, -32000);
    assert.equal((await invoke(3)).error.code, -32000);
    assert.equal(calls, 1); assert.equal(refusals, 1);
  } finally { release(); await bridge.close(); }
});

it("keeps the resident bridge usable after correctable Git input or a missing baseline file", async () => {
  let calls = 0, refusals = 0;
  const bridge = await createMainLoopBridge({ tools: [], call: async () => {
    calls++; if (calls === 1) throw new RoleGitInputError(); if (calls === 2) throw new RoleGitPathMissingError(); return { output: "verified" };
  } }, new AbortController().signal, () => {}, () => { refusals++; });
  const invoke = () => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "resident_git", arguments: {} } }) }).then(response => response.json());
  try {
    assert.equal((await invoke()).error.code, -32602); assert.equal((await invoke()).error.code, -32004);
    assert.match((await invoke()).result.content[0].text, /verified/); assert.equal(calls, 3); assert.equal(refusals, 0);
  } finally { await bridge.close(); }
});
