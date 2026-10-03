import assert from "node:assert/strict";
import { it } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gitRoot, stateFiles, readState, startSession, checkSession, requestStop, releaseSession, registerChild, settleChild } from "../runtime/local-session.mjs";
import { parseArguments } from "./harness-session.mjs";
import { dispatchBinding } from "./harness-codex.mjs";
import { AppServer, childEnvironment, rolePermissions, boundArguments, inheritedPolicyOverrides, assertRolePolicy, roleBridge } from "../runtime/codex-thread.mjs";
import { ROLE_TOOLS, readCodexRole, renderCodexRole } from "../runtime/codex-agent.mjs";
import { RUNTIME_MARKER } from "../lib/client-runtime.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "harness-session-test-"));
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

it("neutralizes inherited servers/plugins/environment without copying their values and checks the effective policy", () => {
  const url = "http://127.0.0.1:1/capability", filesystem = { ":root": "deny", ":minimal": "read" };
  const inherited = inheritedPolicyOverrides({ mcp_servers: { harness_owner: { bearer_token: "owner-secret" } }, plugins: { "other@market": { enabled: true } }, shell_environment_policy: { set: { HARNESS_OWNER_TOKEN: "parent-secret" } } }, url, ROLE_TOOLS["doc-auditor"]).join("\n");
  assert.doesNotMatch(inherited, /owner-secret|parent-secret/);
  assert.match(inherited, /"harness_owner"=\{enabled=false\}/); assert.match(inherited, /"HARNESS_OWNER_TOKEN"=""/);
  const config = { agents: { enabled: false }, approval_policy: "never", default_permissions: "harness-role", web_search: "disabled", project_doc_max_bytes: 0,
    features: { multi_agent: false, apps: false, hooks: false, memories: false, goals: false, code_mode: { enabled: false }, shell_tool: true, unified_exec: false },
    mcp_servers: { harness_owner: { enabled: false }, harness: { enabled: true, url, enabled_tools: ROLE_TOOLS["doc-auditor"], bearer_token_env_var: "HARNESS_ROLE_CAPABILITY" } }, plugins: { other: { enabled: false } },
    permissions: { "harness-role": { extends: ":read-only", filesystem: { ...filesystem, glob_scan_max_depth: null }, network: { enabled: false } } }, shell_environment_policy: { inherit: "none", set: { HARNESS_OWNER_TOKEN: "" } } };
  assert.doesNotThrow(() => assertRolePolicy(config, filesystem, url, "doc-auditor"));
  for (const mutate of [value => { value.mcp_servers.harness_owner.enabled = true; }, value => { value.permissions["harness-role"].filesystem["C:/extra"] = "write"; }, value => { value.features.multi_agent = true; }, value => { value.shell_environment_policy.set.HARNESS_OWNER_TOKEN = "secret"; }, value => { value.mcp_servers.harness.http_headers = { Authorization: "secret" }; }, value => { value.permissions["harness-role"].network.enabled = true; }]) {
    const changed = structuredClone(config); mutate(changed); assert.throws(() => assertRolePolicy(changed, filesystem, url, "doc-auditor"));
  }
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
