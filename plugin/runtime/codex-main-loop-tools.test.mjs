import assert from "node:assert/strict";
import { RoleGitInputError, RoleGitPathMissingError } from "./role-git.mjs";
import { createRoleFiles } from "./role-files.mjs";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { it } from "node:test";
import path from "node:path";
import { createMainLoopTools } from "./codex-main-loop-tools.mjs";
import { createMainLoopBridge } from "./codex-main-loop.mjs";

const names = ["pipeline_next", "board_get", "backlog_get", "backlog_list", "project_get", "validation_record", "report_submit", "acceptance_fail"];
async function fixture(overrides = {}) {
  const controller = new AbortController(), calls = [], roles = [], commits = [], records = [];
  const root = path.resolve("test-resident-root"), scratch = path.resolve("test-resident-scratch");
  const state = { active: true, paused: false, policy: { commit: true, propose: false },
    next: { key: "K-1", action: "dispatch", agent: "dev", format: "slots-v1", entry: { runId: "p", entryId: "e", slotId: "plan" }, agentRunId: "a" },
    board: { status: "planning", planPath: "docs/plans/K-1.md", planCommit: "a".repeat(40) } };
  const guard = async ({ allowPaused = false } = {}) => {
    controller.signal.throwIfAborted();
    if (!state.active || (state.paused && !allowPaused)) throw new Error("Lease unavailable");
    return { policy: state.policy };
  };
  const context = { input: { binding: { root }, config: { project: { slug: "test-project" }, workspaces: [{ agent: "dev", path: "src" }], qa: { baseUrl: "http://127.0.0.1:3000" } } },
    files: { lock: path.join(root, ".git/harness/watch.lock.json") }, session: "session", branch: "fixture", scratch, fileBroker: {}, lifecycle: {}, signal: controller.signal, guard, record: event => records.push(event),
    commandBroker: { tools: [{ name: "role_file_write" }, { name: "role_file_read" }], call: async (name, args) => { calls.push({ name, args }); return {}; } } };
  const tools = await createMainLoopTools(context, {
    listTools: async () => [...names.map(name => ({ name })), { name: "gate_approve" }, { name: "agent_next" }],
    callTool: async (_input, name, args) => { calls.push({ name, args }); return name === "pipeline_next" ? state.next : name === "board_get" ? state.board : {}; },
    commitResidentArtifacts: input => { commits.push(input); return { commit: "b".repeat(40) }; },
    recordResidentRoleReport: input => { commits.push(input); return { commit: "b".repeat(40), path: "recorded-log" }; },
    verifierTarget: () => ({ targetCommit: "b".repeat(40), planCommit: "a".repeat(40) }),
    dispatchFreshRole: async (...args) => { roles.push(args); return { event: "completed", threadId: "fresh", done: true, receipt: { receipt: { runId: "a", revision: 1, stepId: "plan" } }, report: "evidence" }; },
    ...overrides,
  });
  return { tools, state, calls, roles, commits, records, controller, root, scratch };
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
  const diagnostic = { event: "role-tool-failed", agent: "dev", tool: "role_file_read", reason: "path-missing", systemCode: null };
  f.roles[0][4].record(diagnostic); assert.deepEqual(f.records, [diagnostic]);
  f.state.next = { ...f.state.next, agent: "plan-verifier" };
  await assert.rejects(f.tools.call("resident_dispatch", { key: "K-1" }), /requiredVerificationPaths/);
  await f.tools.call("resident_dispatch", { key: "K-1", requiredVerificationPaths: ["Run the exact test command and inspect its inputs"] });
  assert.deepEqual(f.roles[1][3].requiredVerificationPaths, ["Run the exact test command and inspect its inputs"]);
  f.state.next = { ...f.state.next, agent: "qa-verifier" };
  await assert.rejects(f.tools.call("resident_dispatch", { key: "K-1" }), /resident_qa_environment/);
  assert.equal(f.roles.length, 2);
});

it("macOS resident prepares implementation verification from the server target without carrying prior verdicts", { skip: process.platform !== "darwin" }, async () => {
  const f = await fixture(); f.state.next = { ...f.state.next, agent: "impl-verifier" };
  await f.tools.call("resident_dispatch", { key: "K-1" });
  assert.deepEqual(f.roles[0][3].implementation, { targetCommit: "b".repeat(40) });
  assert.equal(f.roles[0][3].agentKey, "K-1");
  assert.equal(f.roles[0][3].planCommit, "a".repeat(40));
  await assert.rejects(f.tools.call("resident_dispatch", { key: "K-1", previousVerdict: "pass" }), /Unexpected/);
});

it("corrects plan-only briefing arguments without interrupting the cycle or opening the wrong role", async () => {
  const f = await fixture(); let refusals = 0;
  const bridge = await createMainLoopBridge(f.tools, f.controller.signal, () => {}, () => { refusals++; });
  const invoke = args => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "resident_dispatch", arguments: args } }) }).then(response => response.json());
  try {
    const invalid = await invoke({ key: "K-1", requiredVerificationPaths: ["only a plan reviewer accepts this"] });
    assert.equal(invalid.error.code, -32602); assert.match(invalid.error.message, /current role is dev.*No role run started/);
    assert.equal(f.roles.length, 0); assert.equal(refusals, 0);
    assert.equal((await invoke({ key: "K-1", requiredVerificationPaths: null })).error, undefined);
    assert.equal(f.roles.length, 1); assert.equal(f.roles[0][3].requiredVerificationPaths, undefined);
    assert.equal(refusals, 0);
  } finally { await bridge.close(); }
});

it("commits a blocked verifier report and resumes only that same report run", { skip: process.platform !== "darwin" }, async t => {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "resident-verifier-handoff-"));
  t.after(() => rmSync(root, { recursive: true }));
  const git = args => execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@test.invalid", ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  git(["init", "-q", "-b", "fixture"]); writeFileSync(path.join(root, "code.txt"), "unchanged"); git(["add", "."]); git(["commit", "-qm", "baseline"]);
  const baseline = git(["rev-parse", "HEAD"]), entry = { runId: "pipeline", entryId: "entry", slotId: "impl-verify" };
  const artifact = "docs/agents/impl-verifier/K-1.md", content = "Verification blocked; no pass is claimed.\n";
  let next = { key: "K-1", action: "dispatch", agent: "impl-verifier", format: "slots-v1", entry }, turns = 0;
  const board = { status: "done", planCommit: baseline, planPath: "plan.md" }, files = createRoleFiles({ ":root": "deny", [root]: "read" }, "main-loop");
  t.after(() => files.close());
  const tools = await createMainLoopTools({ input: { binding: { root }, config: { project: { slug: "fixture" }, workspaces: [] } }, files: {}, session: "session", branch: "fixture", scratch: root,
    fileBroker: files, commandBroker: files, lifecycle: {}, signal: new AbortController().signal,
    guard: async () => ({ policy: { commit: true, propose: false } }),
  }, {
    listTools: async () => names.map(name => ({ name })), callTool: async (_input, name) => name === "pipeline_next" ? next : board,
    verifierTarget: () => ({ targetCommit: baseline, planCommit: baseline }),
    dispatchFreshRole: async (_input, _files, _session, binding) => {
      turns++;
      if (turns === 1) {
        mkdirSync(path.dirname(path.join(root, artifact)), { recursive: true }); writeFileSync(path.join(root, artifact), content);
        next = { action: "wait", on: "handoff", key: "K-1", note: artifact, resume: { agent: "impl-verifier", key: "K-1", agentRunId: "same-run", format: "slots-v1", entry } };
        return { event: "paused", done: false, receipt: { step: "blocked-report", agentRunId: "same-run", receipt: { runId: "same-run", revision: 1, stepId: "blocked-report" } }, report: "blocked" };
      }
      assert.equal(binding.agentRunId, "same-run"); assert.equal(binding.commitHandoff.agentRunId, "same-run");
      assert.equal(binding.commitHandoff.path, artifact); assert.equal(git(["show", `${binding.commitHandoff.commit}:${artifact}`]), content.trim());
      next = { action: "wait", on: "impl-verify", key: "K-1" };
      return { event: "done", done: true, threadId: "report-continuation", receipt: { done: true }, report: "Blocked report recorded; verification not retried." };
    },
  });
  const result = await tools.call("resident_dispatch", { key: "K-1" });
  assert.equal(result.done, true); assert.equal(turns, 2); assert.equal(next.on, "impl-verify");
  assert.equal(git(["diff", "--name-only", baseline, "HEAD"]), artifact); assert.equal(git(["status", "--porcelain"]), "");
});

it("resident QA requires an observed matching build and preserves explicit retry after failure", async () => {
  let text = "wrong build", closes = 0;
  const f = await fixture({ createQaBrowser: async () => ({ call: async () => ({ mcpResult: { content: [{ type: "text", text }] } }), close: async () => { closes++; } }) });
  f.state.next = { ...f.state.next, agent: "qa-verifier" };
  await assert.rejects(f.tools.call("resident_dispatch", { key: "K-1" }), /resident_qa_environment/);
  await assert.rejects(f.tools.call("resident_qa_environment", { key: "K-1", url: "https://production.invalid" }), /Unexpected/);
  const blocked = await f.tools.call("resident_qa_environment", { key: "K-1" });
  assert.equal(blocked.event, "blocked"); assert.equal(f.roles.length, 0);
  text = `- Page URL: http://127.0.0.1:3000\nBuild ${"b".repeat(40)}`;
  const observed = await f.tools.call("resident_qa_environment", { key: "K-1" });
  assert.equal(observed.event, "ready"); assert.equal(closes, 2);
  await f.tools.call("resident_dispatch", { key: "K-1" });
  assert.equal(f.roles[0][3].qaBriefing.targetCommit, "b".repeat(40));
  assert.match(f.roles[0][3].qaBriefing.testBuildIdentity, /Observed.*Browser snapshot SHA-256/);
  f.state.next = { action: "wait", on: "qa", key: "K-1" };
  assert.equal((await f.tools.call("resident_dispatch", { key: "K-1" })).event, "waiting");
  assert.equal(f.roles.length, 1);
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

it("requires new-work permission for every project head even when an entry is supplied", async () => {
  for (const [agent, slotId] of [["work-assigner", "assign-work"], ["work-discoverer", "discover-work"], ["doc-auditor", "doc-audit"]]) {
    const head = { action: "dispatch", agent, entry: { runId: "project-run", entryId: "entry", slotId } };
    const f = await fixture({ callTool: async () => ({ head, items: [] }) });
    await assert.rejects(f.tools.call("resident_dispatch", {}), /New work is disabled/);
    assert.equal(f.roles.length, 0);
    f.state.policy.propose = true;
    await f.tools.call("resident_dispatch", {});
    assert.deepEqual(f.roles[0][3].entry, head.entry);
  }
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

it("recovers guarded file writes after hash errors without relaxing protected paths", async () => {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "resident-write-conflict-"));
  const target = path.join(root, "report.md"), protectedFile = path.join(root, "protected.md");
  writeFileSync(target, "original"); writeFileSync(protectedFile, "protected");
  const files = createRoleFiles({ ":root": "deny", [root]: "read", [target]: "write" }, "dev");
  let refusals = 0;
  const bridge = await createMainLoopBridge(files, new AbortController().signal, () => {}, () => { refusals++; });
  const invoke = (name, args) => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }).then(response => response.json());
  try {
    assert.equal((await invoke("role_file_write", { path: target, content: "changed", expectedHash: "copied-incorrectly" })).error.code, -32602);
    assert.equal((await invoke("role_file_write", { path: target, content: "changed", expectedHash: "0".repeat(64) })).error.code, -32005);
    assert.equal(readFileSync(target, "utf8"), "original"); assert.equal(refusals, 0);
    const current = JSON.parse((await invoke("role_file_read", { path: target })).result.content[0].text);
    assert.equal((await invoke("role_file_write", { path: target, content: "changed", expectedHash: current.hash })).error, undefined);
    assert.equal(readFileSync(target, "utf8"), "changed");
    assert.equal((await invoke("role_file_write", { path: protectedFile, content: "forbidden", expectedHash: null })).error.code, -32000);
    assert.equal(readFileSync(protectedFile, "utf8"), "protected"); assert.equal(refusals, 1);
    assert.equal((await invoke("role_file_read", { path: target })).error.code, -32000);
  } finally { await bridge.close(); files.close(); }
});
