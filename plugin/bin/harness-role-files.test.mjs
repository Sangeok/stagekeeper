import assert from "node:assert/strict";
import { it } from "node:test";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRoleFiles, roleFileToolNames } from "../runtime/role-files.mjs";
import { roleBridge, verifyRoleExecution, assertRolePolicy, roleCommandPath, boundArguments } from "../runtime/codex-thread.mjs";
import { ROLE_TOOLS } from "../runtime/codex-agent.mjs";

function fixture() {
  const base = mkdtempSync(path.join(tmpdir(), "harness-native-files-")), root = path.join(base, "repository"), scratch = path.join(base, "scratch");
  for (const name of [root, scratch, path.join(root, "src/policy"), path.join(root, "other"), path.join(root, ".git"), path.join(root, "docs/plans")]) mkdirSync(name, { recursive: true });
  writeFileSync(path.join(base, "outside.txt"), "OUTSIDE_CANARY");
  writeFileSync(path.join(root, "src/code.ts"), "first line\nsecond needle\nthird line\n");
  writeFileSync(path.join(root, "src/policy/rule.ts"), "READONLY_CANARY");
  writeFileSync(path.join(root, "other/hidden.txt"), "FOREIGN_CANARY");
  writeFileSync(path.join(root, ".git/config"), "GIT_CANARY");
  const filesystem = { ":root": "deny", [root]: "read", [scratch]: "write", [path.join(root, "src")]: "write", [path.join(root, "src/policy")]: "read", [path.join(root, "other")]: "deny", [path.join(root, "docs/plans/A.md")]: "write" };
  return { base, root, scratch, filesystem, files: createRoleFiles(filesystem, "web-dev") };
}

it("executes guarded native reads, scratch writes and new item artifacts without a shell", async () => {
  const f = fixture(), source = path.join(f.root, "src/code.ts");
  const read = f.files.call("role_file_read", { path: source, startLine: 2, maxLines: 1 });
  assert.equal(read.text, "second needle"); assert.equal(read.nextLine, 3);
  assert.throws(() => f.files.call("role_file_write", { path: source, content: "wrong", expectedHash: null }));
  const write = f.files.call("role_file_write", { path: source, content: "changed", expectedHash: read.hash });
  assert.equal(f.files.call("role_file_read", { path: source }).hash, write.hash);
  assert.throws(() => f.files.call("role_file_write", { path: source, content: "stale", expectedHash: read.hash }));
  const artifact = path.join(f.root, "docs/plans/A.md");
  f.files.call("role_file_write", { path: artifact, content: "PLAN_CANARY", expectedHash: null });
  assert.equal(readFileSync(artifact, "utf8"), "PLAN_CANARY");
  await verifyRoleExecution({ request() { assert.fail("Native backend must not launch command/exec"); } }, f.scratch, "web-dev", "win32", f.files);
});

it("refuses external, foreign, readonly, Git and absent reserved paths, including root workspaces", () => {
  const f = fixture();
  for (const target of [path.join(f.base, "outside.txt"), path.join(f.root, "other/hidden.txt"), path.join(f.base, "repository-sibling.txt")]) assert.throws(() => f.files.call("role_file_read", { path: target }));
  for (const target of [path.join(f.root, "src/policy/new.ts"), path.join(f.root, ".git/config"), path.join(f.root, "docs/plans/B.md")]) assert.throws(() => f.files.call("role_file_write", { path: target, content: "FORBIDDEN", expectedHash: null }));
  assert.ok(!f.files.call("role_file_list", { path: f.root }).entries.some(entry => entry.path.endsWith("other")));
  const policy = { ":root": "deny", [f.root]: "write", [f.scratch]: "write", [path.join(f.root, ".git")]: "read", [path.join(f.root, ".claude")]: "deny" };
  for (const name of ["harness.json", "CLAUDE.md", ".mcp.json", "docs/harness", "docs/plans/template.md"]) policy[path.join(f.root, name)] = "read";
  const rootFiles = createRoleFiles(policy, "web-dev");
  for (const name of ["harness.json", "CLAUDE.md", ".mcp.json", "docs/harness/new.json", "docs/plans/template.md", ".claude/new.json", ".git/new-ref"]) assert.throws(() => rootFiles.call("role_file_write", { path: path.join(f.root, name), content: "FORBIDDEN", expectedHash: null }));
  assert.equal(readFileSync(path.join(f.root, ".git/config"), "utf8"), "GIT_CANARY");
});

it("refuses linked, binary, oversized and ambiguous Windows files with no token or process operations", () => {
  const f = fixture(), hard = path.join(f.root, "src/hard.txt");
  linkSync(path.join(f.base, "outside.txt"), hard);
  assert.throws(() => f.files.call("role_file_read", { path: hard }));
  assert.throws(() => f.files.call("role_file_write", { path: hard, content: "FORBIDDEN", expectedHash: null }));
  writeFileSync(path.join(f.root, "src/binary"), Buffer.from([0, 255, 254]));
  writeFileSync(path.join(f.root, "src/large.txt"), Buffer.alloc(1024 * 1024 + 1, 65));
  for (const name of ["binary", "large.txt"]) assert.throws(() => f.files.call("role_file_read", { path: path.join(f.root, "src", name) }));
  if (process.platform === "win32") for (const name of ["code.ts:secret", "CON.txt", "trailing.", "space ", "../other/hidden.txt"]) assert.throws(() => f.files.call("role_file_read", { path: f.root + "\\src\\" + name }));
  const alias = path.join(f.root, "src/alias");
  symlinkSync(f.base, alias, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => f.files.call("role_file_read", { path: path.join(alias, "outside.txt") }));
  assert.equal(readFileSync(path.join(f.base, "outside.txt"), "utf8"), "OUTSIDE_CANARY");
  assert.throws(() => f.files.call("role_command_exec", { command: "anything" }));
  assert.throws(() => f.files.call("role_file_read", { path: path.join(f.root, "src/code.ts"), token: "injection" }));
  assert.deepEqual(roleFileToolNames("pm"), []);
  f.files.close(); assert.throws(() => f.files.call("role_file_list", { path: f.root }));
});

it("searches only permitted text and reports bounded or skipped scans as incomplete", () => {
  const f = fixture();
  const search = f.files.call("role_file_search", { path: f.root, text: "needle" });
  assert.deepEqual(search.matches.map(match => [path.relative(f.root, match.path), match.line]), [[path.join("src", "code.ts"), 2]]);
  assert.equal(search.incomplete, false);
  writeFileSync(path.join(f.root, "src/many.txt"), "needle\n".repeat(201));
  const limited = f.files.call("role_file_search", { path: f.root, text: "needle" });
  assert.equal(limited.matches.length, 200); assert.equal(limited.incomplete, true); assert.ok(limited.truncatedFile);
  const binary = fixture(); writeFileSync(path.join(binary.root, "src/binary"), Buffer.from([255]));
  const skipped = binary.files.call("role_file_search", { path: binary.root, text: "needle" });
  assert.equal(skipped.incomplete, true); assert.equal(skipped.skipped, 1);
  const linked = fixture(); linkSync(path.join(linked.base, "outside.txt"), path.join(linked.root, "src/alias.txt"));
  const aliasList = linked.files.call("role_file_list", { path: path.join(linked.root, "src") });
  assert.equal(aliasList.incomplete, true); assert.equal(aliasList.skipped, 1);
  const aliasSearch = linked.files.call("role_file_search", { path: linked.root, text: "needle" });
  assert.equal(aliasSearch.incomplete, true); assert.equal(aliasSearch.skipped, 1);
});

it("checks the Windows broker tool allowlist and disables native shell execution in effective config", () => {
  const f = fixture(), agent = "doc-auditor", url = "http://127.0.0.1:1/native-role";
  const names = [...ROLE_TOOLS[agent], ...roleFileToolNames(agent)];
  const config = { agents: { enabled: false }, approval_policy: "never", default_permissions: "harness-role", web_search: "disabled", project_doc_max_bytes: 0,
    features: { multi_agent: false, apps: false, hooks: false, memories: false, goals: false, view_image: false, request_permissions_tool: false, code_mode: { enabled: false }, shell_tool: false, unified_exec: false },
    mcp_servers: { harness: { enabled: true, url, enabled_tools: names, default_tools_approval_mode: "prompt", tools: Object.fromEntries(names.map(name => [name, { approval_mode: "approve" }])), bearer_token_env_var: "HARNESS_ROLE_CAPABILITY" } },
    permissions: { "harness-role": { extends: ":read-only", filesystem: f.filesystem, network: { enabled: false } } }, shell_environment_policy: { inherit: "none", set: { PATH: roleCommandPath() } } };
  assert.doesNotThrow(() => assertRolePolicy(config, f.filesystem, url, agent, true));
  const shell = structuredClone(config); shell.features.shell_tool = true;
  assert.throws(() => assertRolePolicy(shell, f.filesystem, url, agent, true));
  const expanded = structuredClone(config); expanded.mcp_servers.harness.enabled_tools.push("role_command_exec");
  assert.throws(() => assertRolePolicy(expanded, f.filesystem, url, agent, true));
  for (const name of ["view_image", "request_permissions_tool"]) {
    const changed = structuredClone(config); changed.features[name] = true;
    assert.throws(() => assertRolePolicy(changed, f.filesystem, url, agent, true));
  }
});

it("binds nullable optional agent_next keys to the actual role without accepting a different key", () => {
  const role = { project: "native", agent: "plan-verifier" };
  assert.equal(boundArguments("agent_next", { key: null }, role, null).key, undefined);
  assert.equal(boundArguments("agent_next", { key: null }, { ...role, agentKey: "A" }, null).key, "A");
  assert.throws(() => boundArguments("agent_next", { key: "B" }, { ...role, agentKey: "A" }, null));
});

it("fences native file tools with the current receipt and active owner, never forwards them to the service", async () => {
  const f = fixture(), calls = [], receipt = { runId: "native-run", revision: 1, stepId: "inspect" };
  let active = true;
  const operations = { listTools: async () => ROLE_TOOLS["doc-auditor"].map(name => ({ name, inputSchema: { type: "object" } })),
    checkSession: async () => ({ event: "owned", lifecycle: active ? "active" : "stopping", client: "codex" }),
    callTool: async (_, name) => { calls.push(name); return { done: false, receipt, step: "inspect" }; } };
  const bridge = await roleBridge({}, {}, "owned", { project: "test", agent: "doc-auditor" }, operations, f.files);
  const request = async (name, args) => (await fetch(bridge.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) })).json();
  try {
    assert.ok((await request("role_file_read", { path: path.join(f.root, "src/code.ts") })).error);
    assert.ok((await request("agent_next", {})).result);
    const malformed = await request("role_file_read", { path: path.join(f.root, "src/code.ts"), maxLines: 600 });
    assert.equal(malformed.error.code, -32602); assert.match(malformed.error.message, /1\.\.500/);
    const read = await request("role_file_read", { path: path.join(f.root, "src/code.ts") });
    assert.equal(JSON.parse(read.result.content[0].text).text, "first line\nsecond needle\nthird line\n");
    assert.deepEqual(calls, ["agent_next"]);
    active = false;
    assert.equal((await request("role_file_write", { path: path.join(f.scratch, "late.txt"), content: "LATE", expectedHash: null })).error.code, -32000);
  } finally { await bridge.close(); }
  assert.throws(() => f.files.call("role_file_list", { path: f.root }));
});

it("discards an asynchronous local result after stop and waits for its backend to settle", async () => {
  const receipt = { runId: "command-run", revision: 1, stepId: "inspect" };
  let finish, entered, signal, closed = false;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { finish = resolve; });
  const backend = { tools: [{ name: "role_command_exec", inputSchema: { type: "object" } }],
    call: async (_, __, controllerSignal) => { signal = controllerSignal; entered(); await pending; return { exitCode: 0, status: "exited", quiescent: true }; },
    close: async () => { await pending; closed = true; } };
  const operations = { listTools: async () => ROLE_TOOLS["doc-auditor"].map(name => ({ name, inputSchema: { type: "object" } })),
    checkSession: async () => ({ event: "owned", lifecycle: "active", client: "codex" }),
    callTool: async () => ({ done: false, receipt, step: "inspect" }) };
  const bridge = await roleBridge({}, {}, "owned", { project: "test", agent: "doc-auditor" }, operations, backend);
  const request = async name => (await fetch(bridge.url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }) })).json();
  try {
    await request("agent_next");
    const command = request("role_command_exec"); await started;
    assert.ok((await request("role_command_exec")).error);
    bridge.abort(); assert.equal(signal.aborted, true);
    finish(); assert.ok((await command).error);
  } finally { finish(); await bridge.close(); }
  assert.equal(closed, true);
});
