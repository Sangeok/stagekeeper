import assert from "node:assert/strict";
import { it } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gitRoot, stateFiles, readState, startSession, checkSession, requestStop, releaseSession, registerChild, settleChild } from "../runtime/local-session.mjs";
import { parseArguments } from "./harness-session.mjs";
import { dispatchBinding, codexFailure, qaWorkflowFile } from "./harness-codex.mjs";
import { AppServer, childEnvironment, rolePermissions, roleCommandPath, stageVerifierPackage, boundArguments, inheritedPolicyOverrides, assertRolePolicy, roleBridge, dispatchFreshRole, verifyRoleExecution, RoleExecutionUnavailable } from "../runtime/codex-thread.mjs";
import { callTool } from "../runtime/mcp-client.mjs";
import { ROLE_TOOLS, readCodexRole, renderCodexRole, verifierPackage } from "../runtime/codex-agent.mjs";
import { RUNTIME_MARKER } from "../lib/execution/client-runtime.mjs";
import { QA_BROWSER_TOOLS } from "../lib/qa.mjs";
import { createRoleFiles } from "../runtime/role-files.mjs";

it("carries safe server refusals through real callTool and HTTP bridge without changing receipts", async t => {
  const f = fixture(), started = await startSession(f.files, f.binding, { client: "codex", commit: false, propose: false });
  let payload, status = 200, wrongId = false, beforeResponse = async () => {};
  const upstream = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString());
    await beforeResponse();
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: wrongId ? "wrong" : message.id, result: payload }));
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const input = { binding: f.binding, server: `http://127.0.0.1:${upstream.address().port}`, token: "hu_fixture_secret", client: "codex", config: { project: { slug: "p" } } };
  const bridge = await roleBridge(input, f.files, started.session, { project: "p", agent: "doc-auditor" }, {
    listTools: async () => ROLE_TOOLS["doc-auditor"].map(name => ({ name })), callTool, checkSession,
  });
  let id = 0;
  const request = async () => (await fetch(bridge.url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: "agent_next", arguments: {} } }) })).json();
  const refuse = value => { payload = { isError: true, content: [{ type: "text", text: JSON.stringify(value) }] }; };
  try {
    const current = { done: false, step: "audit", receipt: { runId: "r", revision: 1, stepId: "audit" }, runtime: { client: "codex", protocol: "harness-runtime-v1" } };
    payload = { content: [{ type: "text", text: JSON.stringify(current) }] };
    assert.equal((await request()).result.isError, false);
    const expectedState = { done: false, receipt: current };
    for (const value of [{ error: "verify step not recorded for actor" }, { error: "another domain refusal" },
      { error: "cap", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-10T12:00:00.000Z" }, { error: "rate", code: "RATE_LIMITED", retryAfterSec: 7 }]) {
      refuse({ ...value, stack: "must not leak", headers: { secret: "discard" } });
      const result = await request(); assert.equal(result.id, id); assert.equal(result.result.isError, true);
      assert.deepEqual(JSON.parse(result.result.content[0].text), value); assert.deepEqual(bridge.result(), expectedState);
    }
    for (const value of [{ error: input.token }, { error: "ho_credential" }, { error: "Authorization: secret" }, { error: "at fn (secret.js)" },
      { error: "x".repeat(1001) }, { error: "bad\nreason" }, { error: "cap", code: "USAGE_LIMIT_REACHED", resetAt: "invalid" }, { error: "rate", code: "RATE_LIMITED", retryAfterSec: "7" }]) {
      refuse(value); const result = await request(); assert.equal(result.error.code, -32000); assert.equal(result.result, undefined);
      assert.deepEqual(bridge.result(), expectedState);
    }
    refuse({ error: "safe reason" }); wrongId = true; assert.equal((await request()).error.code, -32000); wrongId = false;
    status = 503; assert.equal((await request()).error.code, -32000); status = 200;
    beforeResponse = () => requestStop(f.files, started.session);
    assert.equal((await request()).error.code, -32000); assert.deepEqual(bridge.result(), expectedState);
  } finally { await bridge.close(); await requestStop(f.files, started.session); await releaseSession(f.files, started.session); }
});

it("does not publish a domain refusal arriving after bridge abort", async t => {
  const f = fixture(), started = await startSession(f.files, f.binding, { client: "codex", commit: false, propose: false });
  let bridge;
  const upstream = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString()); bridge.abort();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: '{"error":"safe refusal"}' }] } }));
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve)); t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  bridge = await roleBridge({ binding: f.binding, server: `http://127.0.0.1:${upstream.address().port}`, token: "hu_fixture", client: "codex", config: { project: { slug: "p" } } },
    f.files, started.session, { project: "p", agent: "doc-auditor" }, { listTools: async () => ROLE_TOOLS["doc-auditor"].map(name => ({ name })), callTool, checkSession });
  try {
    const result = await (await fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "agent_next" } }) })).json();
    assert.equal(result.error.code, -32000); assert.deepEqual(bridge.result(), { done: false, receipt: null });
  } finally { await bridge.close(); await requestStop(f.files, started.session); await releaseSession(f.files, started.session); }
});

async function dispatcherFixture(mode) {
  const f = fixture(), agent = ["cli", "wrapper", "native-provenance", "native-preflight", "command-broker", "git-broker"].includes(mode) ? "doc-auditor" : "qa-verifier";
  const started = await startSession(f.files, f.binding, { client: "codex", commit: false, propose: false });
  mkdirSync(path.join(f.root, ".codex/agents"), { recursive: true }); mkdirSync(path.join(f.root, "docs/harness"), { recursive: true });
  const roleTools = [...ROLE_TOOLS[agent].map(name => "mcp__harness__" + name), ...(agent === "qa-verifier" ? QA_BROWSER_TOOLS.map(name => "mcp__harness_qa_browser__" + name) : [])];
  const body = `---\nname: ${agent}\ndescription: Fixture\ntools: ${roleTools.join(", ")}\n---\n${RUNTIME_MARKER}\nUse the current server step.`;
  writeFileSync(path.join(f.root, `.codex/agents/${agent}.toml`), renderCodexRole(body, agent));
  const verifier = { path: "fixture/SKILL.md", checksum: "fixture" };
  writeFileSync(path.join(f.root, "docs/harness/codex-package.json"), JSON.stringify({ verifier }));
  const counts = { files: 0, browser: 0, bridge: 0, server: 0, acquired: 0 }; let filesystem, bridge, tools;
  const fail = () => { throw new Error(mode); };
  const operations = {
    codexExecutable: () => { if (["cli", "wrapper"].includes(mode)) fail(); return { executable: "fixture", prefix: [] }; },
    verifierPackage: () => verifier,
    createRoleFiles: (permissions, role) => {
      counts.acquired++; filesystem = permissions; const broker = createRoleFiles(permissions, role), close = broker.close;
      broker.close = async () => { counts.files++; await close(); }; return broker;
    },
    installedWindowsRuntime: () => {
      if (mode === "native-provenance") fail();
      if (["native-preflight", "command-broker", "git-broker"].includes(mode)) return {};
      throw Object.assign(new Error("no source runtime"), { code: "ENOENT" });
    },
    verifyNativeRuntime: async () => { if (mode === "native-preflight") fail(); },
    createRoleCommands: async ({ fileBroker }) => { if (mode === "command-broker") fail(); return fileBroker; },
    createRoleGit: ({ backend }) => { if (mode === "git-broker") fail(); return backend; },
    createQaBrowser: async () => {
      if (mode === "qa-init") fail();
      return { tools: [...QA_BROWSER_TOOLS, ...(mode === "tool-conflict" ? ["agent_next"] : [])].map(name => ({ name })),
        close: async () => { counts.browser++; if (mode === "browser-close") fail(); }, verified: () => false };
    },
    roleBridge: async (input, files, session, dispatch, unused, fileBroker) => {
      tools = [...ROLE_TOOLS[agent], ...fileBroker.tools.map(tool => tool.name)];
      bridge = await roleBridge(input, files, session, dispatch, {
        listTools: async () => { if (mode === "inventory") fail(); return ROLE_TOOLS[agent].slice(mode === "allowlist" ? 1 : 0).map(name => ({ name })); },
        callTool: fail, checkSession,
      }, fileBroker);
      const close = bridge.close; bridge.close = async () => { counts.bridge++; await close(); }; return bridge;
    },
    inspectHostPolicy: async () => { if (["host-policy", "browser-close"].includes(mode)) fail(); return []; },
    spawn: () => { if (mode === "spawn") fail(); return { pid: process.pid, stdin: new PassThrough() }; },
    createAppServer: child => ({ child, closed: false, listeners: new Set(),
      request: async method => {
        if (method === "initialize") { if (["initialize", "server-close"].includes(mode)) fail(); return {}; }
        if (method === "config/read") {
          if (mode === "effective-policy") return { config: {} };
          return { config: { agents: { enabled: false }, approval_policy: "never", default_permissions: "harness-role", web_search: "disabled", project_doc_max_bytes: 0,
            features: { multi_agent: false, apps: false, hooks: false, memories: false, goals: false, view_image: false, request_permissions_tool: false, code_mode: { enabled: false }, shell_tool: false, unified_exec: false },
            mcp_servers: { harness: { enabled: true, url: bridge.url, enabled_tools: tools, default_tools_approval_mode: "prompt", tools: Object.fromEntries(tools.map(name => [name, { approval_mode: "approve" }])), bearer_token_env_var: "HARNESS_ROLE_CAPABILITY" } },
            permissions: { "harness-role": { extends: ":read-only", filesystem, network: { enabled: false } } }, shell_environment_policy: { inherit: "none", set: { PATH: roleCommandPath() } } } };
        }
        if (method === "skills/list") return { data: [] };
        if (method === "thread/start") return { thread: { id: "thread" } };
        if (method === "turn/start") fail();
        throw new Error(`Unexpected fixture request: ${method}`);
      },
      close: async function () { counts.server++; this.closed = true; if (mode === "server-close") fail(); },
    }),
  };
  const input = { binding: f.binding, token: "hu_fixture", config: { project: { slug: "p" }, workspaces: [] } };
  return { ...f, counts, started, getBridge: () => bridge, run: () => dispatchFreshRole(input, f.files, started.session, { agent, agentKey: "A", key: "A" }, operations) };
}

for (const mode of ["cli", "wrapper", "native-provenance", "native-preflight", "command-broker", "git-broker", "qa-init", "inventory", "allowlist", "tool-conflict", "host-policy", "spawn", "initialize", "effective-policy", "browser-close", "server-close", "unacknowledged-turn"]) {
  it(`dispatcher cleans partial acquisition after ${mode} and preserves unsettled ownership`, {
    skip: process.platform !== "win32" && ["native-provenance", "native-preflight", "command-broker", "git-broker"].includes(mode),
  }, async () => {
    const f = await dispatcherFixture(mode);
    await assert.rejects(f.run());
    assert.equal(f.counts.files, ["cli", "wrapper"].includes(mode) ? 0 : 1);
    assert.equal(f.counts.acquired, ["cli", "wrapper"].includes(mode) ? 0 : 1);
    const hasBrowser = ["inventory", "allowlist", "tool-conflict", "host-policy", "spawn", "initialize", "effective-policy", "browser-close", "server-close", "unacknowledged-turn"].includes(mode);
    assert.equal(f.counts.browser, hasBrowser ? 1 : 0);
    const bridge = f.getBridge(); if (bridge) { assert.equal(f.counts.bridge, 1); await assert.rejects(fetch(bridge.url)); }
    const children = readState(f.files).lock.children;
    assert.equal(children.length, ["server-close", "unacknowledged-turn"].includes(mode) ? 1 : 0);
    assert.equal((await checkSession(f.files, f.started.session, f.binding)).event, "owned");
  });
}

function fixture() {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()),"harness-session-test-"));
  execFileSync("git", ["init", root], { stdio: "ignore" });
  const location = gitRoot(root), files = stateFiles(location.directory);
  const binding = { root: location.root, server: "http://127.0.0.1:1", project: "test", configHash: "1".repeat(64), tokenHash: "2".repeat(64) };
  return { root, location, files, binding };
}

it("serializes both clients on the existing common Git watch files without stealing", async () => {
  const f = fixture();
  const results = await Promise.all([startSession(f.files, f.binding, { client: "claude", commit: true, propose: false }), startSession(f.files, f.binding, { client: "codex", commit: false, propose: true })]);
  assert.deepEqual(results.map(result => result.event).sort(), ["locked", "started"]);
  assert.equal(path.basename(f.files.lock), "watch.lock.json"); assert.equal(path.basename(f.files.policy), "watch.json");
  const started = results.find(result => result.event === "started"), check = await checkSession(f.files, started.session, f.binding);
  assert.equal(check.event, "owned"); assert.deepEqual(check.policy, started.policy);
  assert.deepEqual(Object.keys(readState(f.files).lock.binding).sort(), Object.keys(f.binding).sort());
});

it("holds stopping ownership until the actual owned child settles, then fences late release", async () => {
  const f = fixture(), start = await startSession(f.files, f.binding, { client: "codex", commit: false, propose: false });
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { windowsHide: true, stdio: "ignore" });
  const identity = { pid: child.pid, nonce: randomUUID() };
  try {
    await registerChild(f.files, start.session, f.binding, identity);
    assert.equal((await releaseSession(f.files, start.session)).code, "stop-required");
    await requestStop(f.files, start.session);
    assert.equal((await checkSession(f.files, start.session, f.binding)).lifecycle, "stopping");
    assert.equal((await releaseSession(f.files, start.session)).code, "quiescence-required");
    assert.ok(existsSync(f.files.lock));
  } finally { const close = new Promise(resolve => child.once("close", resolve)); child.kill(); await close; }
  await settleChild(f.files, start.session, identity);
  assert.equal((await releaseSession(f.files, start.session)).event, "released");
  const successor = await startSession(f.files, f.binding, { client: "claude", commit: true, propose: true });
  const before = readFileSync(f.files.lock, "utf8");
  assert.equal((await requestStop(f.files, start.session)).event, "replaced"); assert.equal((await releaseSession(f.files, start.session)).event, "replaced");
  assert.equal(readFileSync(f.files.lock, "utf8"), before); assert.equal(readState(f.files).lock.id, successor.session);
});

it("stops/releases using no config or token and refuses ambiguous CLI arguments", async () => {
  const f = fixture(), start = await startSession(f.files, f.binding, { client: "codex", commit: false, propose: false });
  const environment = childEnvironment();
  for (const operation of ["stop", "release"]) {
    const output = execFileSync(process.execPath, ["plugin/bin/harness-session.mjs", "--root", f.root, `--${operation}`, "--session", start.session], { env: environment, encoding: "utf8", windowsHide: true });
    assert.equal(JSON.parse(output).event, operation === "stop" ? "stopping" : "released");
  }
  for (const args of [[], ["--start", "--check"], ["--start", "--commit", "yes"], ["--stop", "--session", "x", "--client", "codex"], ["--release", "--session", "x", "--force"], ["--start", "--commit", "yes", "--commit", "no", "--propose", "no"]]) assert.throws(() => parseArguments(args));
});

it("legacy v1 defaults remain Claude/watch/active and a poller cannot be released early", async () => {
  const f = fixture(), start = await startSession(f.files, f.binding, { client: "claude", commit: false, propose: false });
  const state = readState(f.files); delete state.lock.client; delete state.lock.mode; delete state.lock.lifecycle; delete state.lock.children;
  state.lock.poller = { pid: process.pid, nonce: randomUUID() }; writeFileSync(f.files.lock, JSON.stringify(state.lock));
  const view = await checkSession(f.files, start.session, f.binding);
  assert.equal(view.client, "claude"); assert.equal(view.mode, "watch"); assert.equal(view.lifecycle, "active");
  assert.equal((await startSession(f.files, f.binding, { client: "codex", commit: false, propose: false })).event, "locked");
  await requestStop(f.files, start.session); assert.equal((await releaseSession(f.files, start.session)).code, "quiescence-required");
});

it("binds the original legacy/slots key and receipt while refusing owner and other-run writes", () => {
  const entry = { runId: "pipeline", entryId: "entry", slotId: "verify" };
  assert.throws(() => dispatchBinding({ action: "dispatch", agent: "web-dev", key: "A", format: "unknown" }, [{ agent: "web-dev" }]));
  assert.throws(() => dispatchBinding({ action: "dispatch", agent: "web-dev", key: "A", format: "slots-v1" }, [{ agent: "web-dev" }]));
  const dispatch = { project: "p", ...dispatchBinding({ action: "dispatch", agent: "plan-verifier", key: "A", format: "slots-v1", entry }, []) };
  assert.equal(dispatch.agentKey, "A");
  const receipt = { receipt: { runId: "agent-run", revision: 2, stepId: "read" }, agentRunId: "agent-run", entry };
  assert.deepEqual(boundArguments("agent_next", { outcome: "ok", receipt: receipt.receipt }, dispatch, receipt), { outcome: "ok", receipt: receipt.receipt, agent: "plan-verifier", key: "A", client: "codex", entry, agentRunId: "agent-run", stepId: "read" });
  assert.throws(() => boundArguments("agent_next", { agent: "web-dev" }, dispatch, null));
  assert.throws(() => boundArguments("agent_next", { outcome: "ok", receipt: { ...receipt.receipt, revision: 1 } }, dispatch, receipt));
  assert.throws(() => boundArguments("report_submit", { actor: "main-loop", key: "A" }, dispatch, receipt));
  const report = dispatchBinding({ action: "dispatch", agent: "feature-scout", key: "A", format: "slots-v1", entry: { ...entry, slotId: "scout" } }, []);
  assert.equal(report.agentKey, undefined); assert.ok(report.entry);
});

it("QA accepts this item's impl-verifier report as a workflow file after its target, and nothing else new", () => {
  assert.equal(qaWorkflowFile("docs/agents/impl-verifier/A.md", "A"), true);
  assert.equal(qaWorkflowFile("docs/agents/impl-verifier/B.md", "A"), false);
  assert.equal(qaWorkflowFile("docs/agents/qa-verifier/A.md", "A"), true);
  assert.equal(qaWorkflowFile("src/app.ts", "A"), false);
});

it("Codex refuses impl-verifier before any role run opens and says where to continue", () => {
  const entry = { runId: "pipeline", entryId: "entry", slotId: "impl-verify" };
  let refused;
  assert.throws(() => dispatchBinding({ action: "dispatch", agent: "impl-verifier", key: "A", format: "slots-v1", entry }, []), (error) => { refused = error; return true; });
  assert.deepEqual(codexFailure(refused, "s"), { event: "error", session: "s", code: "codex-role-unsupported", reason: refused.message });
  assert.match(refused.message, /not available on Codex yet.*Claude Code/);
});

it("omits parent credentials and restricts workspace, readonly and foreign paths", () => {
  assert.deepEqual(childEnvironment({ PATH: "ok", HARNESS_TOKEN: "secret", HARNESS_OWNER_TOKEN: "owner", OPENAI_API_KEY: "key", NODE_OPTIONS: "injection", CODEX_HOME: "parent", CLAUDE_CONFIG_DIR: "parent", GIT_CONFIG_COUNT: "1" }), { PATH: "ok" });
  const f = fixture(), input = { binding: f.binding, config: { workspaces: [{ agent: "web-dev", path: "src/web", readOnly: ["src/web/policy"] }, { agent: "api-dev", path: "src/api" }] } };
  const permissions = rolePermissions(input, "web-dev", "A", path.join(f.root, "scratch"));
  assert.equal(permissions[path.join(f.root, "src/web")], "write"); assert.equal(permissions[path.join(f.root, "src/web/policy")], "read");
  assert.equal(permissions[path.join(f.root, "src/api")], "deny"); assert.equal(permissions[path.join(f.root, ".git")], "read");
  assert.equal(permissions[":root"], "deny");
  assert.equal(rolePermissions(input, "pm", undefined, path.join(f.root, "scratch"))[f.root], "deny");
  assert.throws(() => rolePermissions(input, "web-dev", "../../escape", path.join(f.root, "scratch")));
});

it("refuses modified role policies including owner tools, duplicate sections and nested agents", () => {
  const body = `---\nname: doc-auditor\ndescription: Audit\ntools: Read, ${ROLE_TOOLS["doc-auditor"].map(name => "mcp__harness__" + name).join(", ")}\n---\n${RUNTIME_MARKER}\nUse the current server step.`;
  const managed = renderCodexRole(body, "doc-auditor");
  assert.equal(readCodexRole(managed, "doc-auditor", "doc-auditor").name, "doc-auditor");
  for (const changed of [managed.replace('enabled = false', 'enabled = true'), managed.replace('[mcp_servers.harness_owner]\nenabled = false', '[mcp_servers.harness_owner]\nenabled = true'), managed.replace('"backlog_list"', '"gate_approve"'), managed + '[agents]\nenabled = false\n', managed.replace('sandbox_mode = "read-only"', 'sandbox_mode = "workspace-write"'), managed + 'unmanaged = true\n']) assert.throws(() => readCodexRole(changed, "doc-auditor", "doc-auditor"));
});
it("QA can write only its bound report and scratch while retaining read access to product files", async () => {
  const f = fixture(), scratch = path.join(f.root, "scratch");
  mkdirSync(scratch);
  const product = path.join(f.root, "app.ts"), ownReport = path.join(f.root, "docs/agents/qa-verifier/A.md");
  writeFileSync(product, "product");
  const input = { binding: f.binding, config: { workspaces: [{ agent: "web-dev", path: "." }] } };
  const files = createRoleFiles(rolePermissions(input, "qa-verifier", "A", scratch), "qa-verifier");
  try {
    assert.equal(files.call("role_file_read", { path: product }).text, "product");
    files.call("role_file_write", { path: ownReport, content: "Observed QA", expectedHash: null });
    files.call("role_file_write", { path: path.join(scratch, "evidence.md"), content: "Snapshot", expectedHash: null });
    for (const target of [product, path.join(f.root, "docs/agents/qa-verifier/B.md"), path.join(f.root, "harness.json"), path.join(f.root, ".git/config")]) {
      assert.throws(() => files.call("role_file_write", { path: target, content: "changed", expectedHash: null }), /permission refused|protected/);
    }
    assert.equal(readFileSync(product, "utf8"), "product");
  } finally { await files.close(); }
});
it("QA alone receives the complete browser allowlist without shell, owner or nested-agent rights", () => {
  const body = `---\nname: qa-verifier\ndescription: Browser QA\ntools: Read, Write, ${ROLE_TOOLS["qa-verifier"].map(name => "mcp__harness__" + name).join(", ")}, ${QA_BROWSER_TOOLS.map(name => "mcp__harness_qa_browser__" + name).join(", ")}\n---\n${RUNTIME_MARKER}\nUse mcp__harness_qa_browser__browser_snapshot.`;
  const managed = renderCodexRole(body, "qa-verifier"), policy = readCodexRole(managed, "qa-verifier", "qa-verifier");
  assert.equal(policy.sandbox_mode, "workspace-write");
  assert.equal(policy["agents.enabled"], false);
  assert.equal(policy["mcp_servers.harness_owner.enabled"], false);
  assert.match(policy.developer_instructions, /mcp__harness__browser_snapshot/);
  assert.throws(() => renderCodexRole(body.replace("tools: Read,", "tools: Bash, Read,"), "qa-verifier"), /file tool allowlist/);
  assert.throws(() => renderCodexRole(body.replace(", mcp__harness_qa_browser__browser_network_requests", ""), "qa-verifier"), /browser allowlist/);
  const devBody = body.replace("name: qa-verifier", "name: web-dev").replace(ROLE_TOOLS["qa-verifier"].map(name => "mcp__harness__" + name).join(", "), ROLE_TOOLS.dev.map(name => "mcp__harness__" + name).join(", "));
  assert.throws(() => renderCodexRole(devBody, "dev"), /browser allowlist/);
});
it("impl-verifier installs on Codex as a write role with its exact tools, so a Pro bundle renders", () => {
  const body = `---\nname: impl-verifier\ndescription: Implementation check\ntools: Read, Glob, Grep, Bash, Write, ${ROLE_TOOLS["impl-verifier"].map(name => "mcp__harness__" + name).join(", ")}\n---\n${RUNTIME_MARKER}\nUse the current server step.`;
  const policy = readCodexRole(renderCodexRole(body, "impl-verifier"), "impl-verifier", "impl-verifier");
  assert.equal(policy.sandbox_mode, "workspace-write");
  assert.deepEqual(policy["mcp_servers.harness.enabled_tools"], ["agent_next", "board_get", "backlog_get", "report_submit"]);
  assert.throws(() => renderCodexRole(body.replace("tools: Read,", "tools: Edit, Read,"), "impl-verifier"), /file tool allowlist/);
});
it("QA verify refuses fabricated completion and forwards browser evidence with the current receipt binding", async () => {
  const entry = { runId: "pipeline", entryId: "entry", slotId: "qa" }, receipt = { runId: "qa-run", revision: 1, stepId: "verify" };
  const calls = []; let verified = false;
  const operations = {
    checkSession: async () => ({ event: "owned", lifecycle: "active", client: "codex" }),
    listTools: async () => [...ROLE_TOOLS["qa-verifier"], "gate_approve", "board_transition"].map(name => ({ name, inputSchema: { type: "object" } })),
    callTool: async (_input, name, args) => { calls.push({ name, args }); return { done: false, step: args.outcome ? "report" : "verify", receipt: args.outcome ? { ...receipt, revision: 2, stepId: "report" } : receipt, agentRunId: "qa-run", entry }; },
  };
  const evidence = { content: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }], isError: false };
  const browser = { tools: QA_BROWSER_TOOLS.map(name => ({ name, inputSchema: { type: "object" } })), call: async () => ({ mcpResult: evidence }), qaVerified: () => verified, close: async () => {} };
  const bridge = await roleBridge({ binding: {} }, {}, "session", { project: "p", agent: "qa-verifier", key: "A", agentKey: "A", entry }, operations, browser);
  let id = 0;
  const request = async (method, params) => (await fetch(bridge.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) })).json();
  try {
    const inventory = (await request("tools/list", {})).result.tools.map(tool => tool.name);
    assert.ok(!inventory.includes("gate_approve") && !inventory.includes("board_transition"));
    await request("tools/call", { name: "agent_next", arguments: {} });
    assert.ok((await request("tools/call", { name: "agent_next", arguments: { outcome: "ok", receipt } })).error);
    assert.equal(calls.length, 1);
    assert.deepEqual((await request("tools/call", { name: "browser_take_screenshot", arguments: {} })).result, evidence);
    verified = true;
    assert.equal(JSON.parse((await request("tools/call", { name: "agent_next", arguments: { outcome: "ok", receipt } })).result.content[0].text).step, "report");
    assert.deepEqual(calls.at(-1).args, { outcome: "ok", receipt, agent: "qa-verifier", key: "A", entry, agentRunId: "qa-run", stepId: "verify", client: "codex" });
  } finally { await bridge.close(); }
});

it("neutralizes inherited servers/plugins/environment without copying their values and checks the effective policy", () => {
  const url = "http://127.0.0.1:1/capability", filesystem = { ":root": "deny", ":minimal": "read" };
  const inherited = inheritedPolicyOverrides({ mcp_servers: { harness_owner: { bearer_token: "owner-secret" } }, plugins: { "other@market": { enabled: true } }, shell_environment_policy: { set: { HARNESS_OWNER_TOKEN: "parent-secret", PATH: "/private/parent-tools", Path: "/private/alias-tools" } } }, url, ROLE_TOOLS["doc-auditor"]).join("\n");
  assert.doesNotMatch(inherited, /owner-secret|parent-secret/);
  assert.match(inherited, /"harness_owner"=\{enabled=false\}/); assert.match(inherited, /"HARNESS_OWNER_TOKEN"=""/);
  assert.doesNotMatch(inherited, /private\/parent-tools|private\/alias-tools/);
  assert.ok(inherited.includes(`"PATH"=${JSON.stringify(roleCommandPath())}`));
  assert.ok(inherited.includes(`"Path"=${JSON.stringify(roleCommandPath())}`));
  const config = { agents: { enabled: false }, approval_policy: "never", default_permissions: "harness-role", web_search: "disabled", project_doc_max_bytes: 0,
    features: { multi_agent: false, apps: false, hooks: false, memories: false, goals: false, view_image: false, request_permissions_tool: false, code_mode: { enabled: false }, shell_tool: true, unified_exec: false },
    mcp_servers: { harness_owner: { enabled: false }, harness: { enabled: true, url, enabled_tools: ROLE_TOOLS["doc-auditor"], default_tools_approval_mode: "prompt", tools: Object.fromEntries(ROLE_TOOLS["doc-auditor"].map(name => [name, { approval_mode: "approve" }])), bearer_token_env_var: "HARNESS_ROLE_CAPABILITY" } }, plugins: { other: { enabled: false } },
    permissions: { "harness-role": { extends: ":read-only", filesystem: { ...filesystem, glob_scan_max_depth: null }, network: { enabled: false } } }, shell_environment_policy: { inherit: "none", set: { PATH: roleCommandPath(), HARNESS_OWNER_TOKEN: "" } } };
  assert.doesNotThrow(() => assertRolePolicy(config, filesystem, url, "doc-auditor"));
  assert.throws(() => assertRolePolicy({ ...config, sandbox_mode: "workspace-write" }, filesystem, url, "doc-auditor"));
  for (const value of [undefined, "", "/private/parent-tools"]) {
    const changed = structuredClone(config); changed.shell_environment_policy.set.PATH = value;
    assert.throws(() => assertRolePolicy(changed, filesystem, url, "doc-auditor"));
  }
  for (const mutate of [value => { value.mcp_servers.harness_owner.enabled = true; }, value => { value.permissions["harness-role"].filesystem["C:/extra"] = "write"; }, value => { value.features.multi_agent = true; }, value => { value.shell_environment_policy.set.HARNESS_OWNER_TOKEN = "secret"; }, value => { value.mcp_servers.harness.http_headers = { Authorization: "secret" }; }, value => { value.permissions["harness-role"].network.enabled = true; }, value => { value.mcp_servers.harness.default_tools_approval_mode = "approve"; }, value => { value.mcp_servers.harness.tools.agent_next.approval_mode = "prompt"; }, value => { value.mcp_servers.harness.tools.gate_approve = { approval_mode: "approve" }; }]) {
    const changed = structuredClone(config); mutate(changed); assert.throws(() => assertRolePolicy(changed, filesystem, url, "doc-auditor"));
  }
});

it("resolves POSIX read commands with only the fixed system PATH and no parent credentials", { skip: process.platform === "win32" }, () => {
  const output = execFileSync("/bin/sh", ["-c", 'printf READ_CANARY | cat; test -z "${HARNESS_OWNER_TOKEN:-}"'], { encoding: "utf8", env: { PATH: roleCommandPath() } });
  assert.equal(output, "READ_CANARY");
  assert.equal(roleCommandPath("linux"), "/usr/local/bin:/usr/bin:/bin");
  assert.ok(roleCommandPath("win32").split(";").every(directory => path.win32.isAbsolute(directory)));
});

it("copies the complete verifier into scratch without copying credential siblings or permitting a changed package", () => {
  const owner = mkdtempSync(path.join(realpathSync(tmpdir()),"harness-verifier-owner-"));
  const packageRoot = path.join(owner, "skills/reconciling-proposals-with-codebase"), scratch = mkdtempSync(path.join(realpathSync(tmpdir()),"harness-verifier-stage-"));
  mkdirSync(path.join(packageRoot, "references"), { recursive: true });
  writeFileSync(path.join(owner, "auth.json"), "credential-sibling-canary");
  writeFileSync(path.join(packageRoot, "SKILL.md"), "---\nname: reconciling-proposals-with-codebase\n---\n[Required resource](references/required.md)\n");
  writeFileSync(path.join(packageRoot, "references/required.md"), "Complete supporting instructions");
  const expected = verifierPackage(packageRoot), staged = stageVerifierPackage(expected, scratch);
  assert.equal(staged.checksum, expected.checksum); assert.equal(staged.files, 2);
  assert.ok(staged.path.startsWith(scratch + path.sep));
  assert.equal(readFileSync(path.join(path.dirname(staged.path), "references/required.md"), "utf8"), "Complete supporting instructions");
  assert.equal(existsSync(path.join(path.dirname(staged.path), "auth.json")), false);
  assert.throws(() => stageVerifierPackage(expected, scratch));
  writeFileSync(path.join(packageRoot, "references/required.md"), "Changed after init");
  assert.throws(() => stageVerifierPackage(expected, mkdtempSync(path.join(realpathSync(tmpdir()),"harness-verifier-changed-"))), /changed while staging/);
});

it("requires actual sandbox execution without replacing named permissions or starting a model", async () => {
  const calls = [];
  const server = { request: async (method, params) => { calls.push({ method, params }); return { exitCode: 0, stdout: "harness-role-execution-ready" }; } };
  await verifyRoleExecution(server, "scratch", "doc-auditor", "win32");
  await verifyRoleExecution(server, "scratch", "dev", "linux");
  await verifyRoleExecution(server, "scratch", "pm", "win32");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.method === "command/exec" && !Object.hasOwn(call.params, "sandboxPolicy") && call.params.timeoutMs === 10000));
  const assertRuntimeFailure = error => {
    assert.ok(error instanceof RoleExecutionUnavailable);
    const failure = codexFailure(error, "owned-session");
    assert.equal(failure.code, "codex-role-execution-unavailable");
    assert.equal(failure.session, "owned-session");
    assert.match(failure.reason, /no model turn started/);
    assert.match(failure.reason, /Stagekeeper must fix runtime compatibility/);
    assert.doesNotMatch(failure.reason, /private-host-details|Use a host|resolve with \$harness-init/);
    return true;
  };
  for (const result of [{ exitCode: 1, stdout: "", stderr: "private-host-details" }, { exitCode: 0, stdout: "wrong-marker" }]) {
    await assert.rejects(verifyRoleExecution({ request: async () => result }, "scratch", "dev", "win32"), assertRuntimeFailure);
  }
  await assert.rejects(verifyRoleExecution({ request: async () => { throw new Error("private-host-details"); } }, "scratch", "dev"), assertRuntimeFailure);
  const privateError = Object.assign(new Error("private-host-details"), { code: "codex-role-execution-unavailable" });
  const refused = codexFailure(privateError);
  assert.equal(refused.code, "codex-refused");
  assert.equal(refused.session, null);
  assert.doesNotMatch(JSON.stringify(refused), /private-host-details/);
});

it("refuses App Server approval requests and bounds failed transport requests", async () => {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.emit("close", 0); return true; }; child.unref = () => {};
  const server = new AppServer(child), sent = []; child.stdin.on("data", value => sent.push(JSON.parse(value.toString())));
  try {
    child.stdout.write(JSON.stringify({ id: 91, method: "item/commandExecution/requestApproval", params: {} }) + "\n");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent[0].id, 91); assert.equal(sent[0].error.code, -32000); assert.equal(sent[0].result, undefined);
    await assert.rejects(server.request("config/read", {}, 5), /deadline exceeded/);
    const pending = server.request("turn/interrupt", {}); child.emit("close", 1);
    await assert.rejects(pending, /process ended/); assert.equal(server.pending.size, 0);
  } finally { await server.close(); }
});

it("serves only the role MCP tools and fences owner calls, stale receipts and a completed run over HTTP", async () => {
  const f = fixture(), started = await startSession(f.files, f.binding, { client: "codex", commit: false, propose: false });
  const calls = [], receipt = { runId: "existing", revision: 0, stepId: "audit" };
  const operations = { checkSession, listTools: async () => [...ROLE_TOOLS["doc-auditor"], "gate_approve", "pipeline_next"].map(name => ({ name, inputSchema: { type: "object" } })),
    callTool: async (_input, name, args) => { calls.push({ name, args }); return args.outcome ? { done: true } : { done: false, step: "audit", receipt }; } };
  const bridge = await roleBridge({ binding: f.binding }, f.files, started.session, { project: "p", agent: "doc-auditor" }, operations);
  const request = async (id, method, params) => (await fetch(bridge.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).json();
  try {
    assert.equal((await fetch(bridge.url)).status, 405);
    const listed = await request(1, "tools/list", {}); assert.deepEqual(listed.result.tools.map(tool => tool.name), ROLE_TOOLS["doc-auditor"]);
    const owner = await request(2, "tools/call", { name: "gate_approve", arguments: {} }); assert.equal(owner.id, 2); assert.ok(owner.error); assert.equal(calls.length, 0);
    const first = await request(3, "tools/call", { name: "agent_next", arguments: {} }); assert.equal(JSON.parse(first.result.content[0].text).receipt.runId, "existing");
    const stale = await request(4, "tools/call", { name: "agent_next", arguments: { outcome: "ok", receipt: { ...receipt, revision: 1 } } }); assert.ok(stale.error); assert.equal(calls.length, 1);
    const done = await request(5, "tools/call", { name: "agent_next", arguments: { outcome: "ok", receipt } }); assert.equal(JSON.parse(done.result.content[0].text).done, true);
    assert.ok((await request(6, "tools/call", { name: "agent_next", arguments: {} })).error); assert.equal(calls.length, 2);
    assert.equal(bridge.result().done, true);
  } finally { await bridge.close(); await requestStop(f.files, started.session); await releaseSession(f.files, started.session); }
});
