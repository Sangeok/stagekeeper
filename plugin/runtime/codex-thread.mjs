import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { createServer } from "node:http";
import { isDeepStrictEqual } from "node:util";
import { ROLE_TOOLS, verifierPackage, readCodexRole } from "./codex-agent.mjs";
import { callTool, listTools } from "./mcp-client.mjs";
import { checkSession, registerChild, settleChild, gitRoot } from "./local-session.mjs";
import { safeTarget } from "./file-ownership.mjs";

export function codexExecutable() {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const suffix of process.platform === "win32" ? [".exe", ".cmd"] : [""]) {
      const candidate = path.join(directory, "codex" + suffix);
      if (!existsSync(candidate)) continue;
      if (suffix !== ".cmd") return { executable: candidate, prefix: [] };
      const entry = path.join(directory, "node_modules/@openai/codex/bin/codex.js");
      if (!existsSync(entry) || !readFileSync(candidate, "utf8").includes("node_modules\\@openai\\codex\\bin\\codex.js")) throw new Error("Unsupported Codex wrapper");
      return { executable: process.execPath, prefix: [entry] };
    }
  }
  throw new Error("Codex CLI required");
}

export function childEnvironment(environment = process.env) {
  const allowed = new Set(["path", "pathext", "systemroot", "windir", "comspec", "temp", "tmp", "home", "userprofile", "appdata", "localappdata", "programfiles", "programfiles(x86)", "programdata", "username", "userdomain", "os", "systemdrive"]);
  return Object.fromEntries(Object.entries(environment).filter(([name]) => allowed.has(name.toLowerCase())));
}

export function rolePermissions(input, agent, key, scratch) {
  const root = input.binding.root, workspace = input.config.workspaces.find(ws => ws.agent === agent);
  const filesystem = { ":root": "deny", ...(agent === "pm" ? {} : { ":minimal": "read" }), [root]: "read", [scratch]: "write", [path.join(homedir(), ".codex")]: "deny",
    [path.join(root, ".git")]: "read", [path.join(root, ".codex")]: "read", [path.join(root, ".claude")]: "deny" };
  filesystem[path.dirname(gitRoot(root).directory)] = agent === "pm" ? "deny" : "read";
  if (agent === "pm") { filesystem[root] = "deny"; filesystem[scratch] = "deny"; filesystem[path.join(root, ".codex")] = "deny"; }
  if (workspace) {
    if (!key || !/^[A-Za-z0-9_-]+$/.test(key)) throw new Error("Workspace role requires a safe item key");
    filesystem[workspace.path === "." ? root : safeTarget(root, workspace.path)] = "write";
    filesystem[safeTarget(root, `docs/plans/${key}.md`)] = "write";
    filesystem[safeTarget(root, `docs/agents/${agent}/${key}.md`)] = "write";
    for (const other of input.config.workspaces.filter(ws => ws.agent !== agent)) {
      if (other.path === ".") throw new Error("Overlapping root workspace cannot be isolated");
      filesystem[safeTarget(root, other.path)] = "deny";
    }
    for (const scope of workspace.readOnly ?? []) filesystem[scope === "." ? root : safeTarget(root, scope)] = "read";
    // Harness, role and policy files stay protected even when a workspace is the root.
    for (const file of ["harness.json", "harness.lock.json", "CLAUDE.md", ".mcp.json", "docs/harness", "docs/plans/template.md", "docs/plans/verification-paths.md"]) filesystem[safeTarget(root, file)] = "read";
    filesystem[path.join(root, ".codex")] = "read";
  }
  return filesystem;
}

export function boundArguments(name, args, dispatch, receipt) {
  if (args.project !== undefined && args.project !== dispatch.project) throw new Error("Role project mismatch");
  if (name === "agent_next") {
    if (args.agent !== undefined && args.agent !== dispatch.agent) throw new Error("Role agent mismatch");
    if (args.key !== undefined && args.key !== dispatch.agentKey) throw new Error("Role key mismatch");
    if (args.outcome && (!receipt || !isDeepStrictEqual(args.receipt, receipt.receipt))) throw new Error("Outcome receipt mismatch");
    const binding = receipt ?? dispatch;
    if (args.entry && !isDeepStrictEqual(args.entry, binding.entry)) throw new Error("Pipeline entry mismatch");
    if (args.agentRunId && args.agentRunId !== binding.agentRunId) throw new Error("Agent run mismatch");
    return { ...args, agent: dispatch.agent, key: dispatch.agentKey,
      ...(args.outcome && binding.receipt ? { stepId: binding.receipt.stepId } : {}),
      ...(binding.entry ? { entry: binding.entry } : {}), ...(binding.agentRunId ? { agentRunId: binding.agentRunId } : {}), client: "codex" };
  }
  if (dispatch.key && args.key !== undefined && args.key !== dispatch.key) throw new Error("Role artifact key mismatch");
  if (name === "report_submit") {
    if (!receipt?.receipt || args.actor !== dispatch.agent) throw new Error("Role report actor/run mismatch");
    if (args.runId !== undefined && args.runId !== receipt.receipt.runId) throw new Error("Report run mismatch");
    return { ...args, runId: receipt.receipt.runId };
  }
  if (name === "backlog_add") {
    if (!receipt?.receipt || (args.runId !== undefined && args.runId !== receipt.receipt.runId)) throw new Error("Scout run mismatch");
    return { ...args, runId: receipt.receipt.runId };
  }
  return args;
}

export async function roleBridge(input, files, session, dispatch, operations = { listTools, callTool, checkSession }) {
  const logical = ROLE_TOOLS[dispatch.agent] ? dispatch.agent : "dev", names = ROLE_TOOLS[logical];
  const tools = (await operations.listTools(input)).filter(tool => names.includes(tool.name));
  if (tools.length !== names.length || new Set(tools.map(tool => tool.name)).size !== names.length) throw new Error("Role MCP allowlist incomplete");
  const capability = randomUUID(); let receipt = null, done = false, requests = 0, pending = 0;
  const controller = new AbortController();
  const server = createServer(async (request, response) => {
    if (request.url !== `/mcp/${capability}`) { response.writeHead(404); response.end(); return; }
    if (request.method !== "POST") { response.writeHead(405, { Allow: "POST" }); response.end(); return; }
    pending++; let requestId = null;
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { if ((bytes += chunk.length) > 65536) throw new Error("Bridge request too large"); chunks.push(chunk); }
      const message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requestId = message.id ?? null;
      let result;
      if (message.method === "initialize") result = { protocolVersion: message.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "harness-role", version: "1" } };
      else if (message.method?.startsWith("notifications/")) { response.writeHead(202); response.end(); return; }
      else if (message.method === "tools/list") result = { tools };
      else if (message.method === "tools/call") {
        if (++requests > 100 || done || pending > 1 || !names.includes(message.params?.name) || (!receipt && message.params.name !== "agent_next")) throw new Error("Role tool or run closed");
        const ownership = await operations.checkSession(files, session, input.binding);
        if (ownership.event !== "owned" || ownership.lifecycle !== "active" || ownership.client !== "codex") throw new Error("Role session no longer active");
        const name = message.params.name, args = boundArguments(name, message.params.arguments ?? {}, dispatch, receipt);
        const value = await operations.callTool(input, name, args, controller.signal);
        if (name === "agent_next") {
          if (typeof value.done !== "boolean" || (!value.done && (!value.receipt?.runId || !Number.isInteger(value.receipt.revision) || value.receipt.stepId !== value.step))
            || (dispatch.entry && !isDeepStrictEqual(value.entry, dispatch.entry))
            || (!value.done && dispatch.entry && value.agentRunId !== value.receipt.runId)) throw new Error("Role response binding mismatch");
          receipt = value; done = value.done === true;
        }
        result = { content: [{ type: "text", text: JSON.stringify(value) }], isError: false };
      } else throw new Error("Unsupported role bridge method");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    } catch {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: requestId, error: { code: -32000, message: "Role request refused; stop without bypassing permissions or ownership." } }));
    } finally { pending--; }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/mcp/${capability}`, result: () => ({ done, receipt }),
    close: async () => { controller.abort(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (pending) throw new Error("Role requests still pending"); } };
}

export class AppServer {
  constructor(child) {
    this.child = child; this.nextId = 0; this.pending = new Map(); this.listeners = new Set(); this.closed = false;
    this.reader = createInterface({ input: child.stdout });
    this.reader.on("line", line => {
      try {
        const message = JSON.parse(line);
        if (message.method && message.id !== undefined) {
          // A role cannot acquire greater rights or answer owner approvals.
          child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32000, message: "Role permission escalation refused" } }) + "\n");
        } else if (message.id !== undefined) {
          const handler = this.pending.get(message.id);
          if (handler) { this.pending.delete(message.id); if (message.error) handler.reject(new Error("Codex App Server request refused")); else handler.resolve(message.result); }
        } else for (const listener of this.listeners) listener(message);
      } catch { this.abort(new Error("Malformed App Server response")); }
    });
    child.stderr.resume();
    child.stdin.on("error", () => this.abort(new Error("Codex input transport failed")));
    this.exited = new Promise(resolve => child.once("close", () => { this.closed = true; this.abort(new Error("Codex process ended")); resolve(); }));
    child.once("error", () => this.abort(new Error("Codex process unavailable")));
  }
  abort(error) { for (const request of this.pending.values()) request.reject(error); this.pending.clear(); for (const listener of this.listeners) listener({ method: "transport/error" }); }
  request(method, params, timeout = 20000) {
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error("App Server closed")); return; }
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("App Server request deadline exceeded")); }, timeout);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  async close() {
    this.child.stdin.end(); if (!this.closed) this.child.kill();
    let timer;
    try { await Promise.race([this.exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Owned Codex process did not end; ownership retained")), 20000); })]); }
    finally { clearTimeout(timer); this.reader.close(); this.listeners.clear(); this.child.stdin.destroy(); this.child.stdout.destroy(); this.child.stderr.destroy(); if (!this.closed) this.child.unref(); }
  }
}

export function inheritedPolicyOverrides(config, url, tools) {
  const overrides = [];
  const servers = Object.keys(config.mcp_servers ?? {}).filter(name => name !== "harness");
  const disabled = servers.map(name => `${JSON.stringify(name)}={enabled=false}`);
  const approvedTools = tools.map(name => `${JSON.stringify(name)}={approval_mode="approve"}`).join(",");
  disabled.push(`harness={url=${JSON.stringify(url)},enabled=true,enabled_tools=${JSON.stringify(tools)},default_tools_approval_mode="prompt",tools={${approvedTools}},bearer_token_env_var="HARNESS_ROLE_CAPABILITY"}`);
  overrides.push(`mcp_servers={${disabled.join(",")}}`);
  const plugins = Object.keys(config.plugins ?? {});
  if (plugins.length) overrides.push(`plugins={${plugins.map(name => `${JSON.stringify(name)}={enabled=false}`).join(",")}}`);
  // TOML overrides merge maps. Emptying the table does not remove inherited values.
  const variables = Object.keys(config.shell_environment_policy?.set ?? {});
  if (variables.length) overrides.push(`shell_environment_policy.set={${variables.map(name => `${JSON.stringify(name)}=""`).join(",")}}`);
  return overrides;
}

export function assertRolePolicy(config, filesystem, url, agent) {
  const permission = config.permissions?.["harness-role"], actualFiles = permission?.filesystem ?? {};
  const paths = Object.fromEntries(Object.entries(actualFiles).filter(([name]) => name !== "glob_scan_max_depth"));
  const tools = ROLE_TOOLS[agent] ?? ROLE_TOOLS.dev, harness = config.mcp_servers?.harness;
  const disabled = ["multi_agent", "apps", "hooks", "memories", "goals"];
  if (config.agents?.enabled !== false || config.approval_policy !== "never" || config.default_permissions !== "harness-role"
    || config.sandbox_mode != null
    || config.web_search !== (agent === "feature-scout" ? "live" : "disabled") || config.project_doc_max_bytes !== 0 || config.features?.code_mode?.enabled !== false
    || disabled.some(name => config.features?.[name] !== false)
    || config.features?.shell_tool !== (agent !== "pm") || config.features?.unified_exec !== false
    || Object.entries(config.mcp_servers ?? {}).some(([name, server]) => name !== "harness" && server.enabled !== false)
    || Object.values(config.plugins ?? {}).some(plugin => plugin.enabled !== false)
    || !harness || harness.enabled !== true || harness.url !== url || !isDeepStrictEqual(harness.enabled_tools, tools)
    || harness.default_tools_approval_mode !== "prompt" || tools.some(name => harness.tools?.[name]?.approval_mode !== "approve")
    || Object.entries(harness.tools ?? {}).some(([name, policy]) => !tools.includes(name) && policy.approval_mode === "approve")
    || harness.bearer_token_env_var !== "HARNESS_ROLE_CAPABILITY" || harness.bearer_token != null
    || Object.keys(harness.http_headers ?? {}).length || Object.keys(harness.env_http_headers ?? {}).length
    || permission?.extends !== ":read-only" || permission.workspace_roots != null || !isDeepStrictEqual(paths, filesystem)
    || permission.network?.enabled !== false || Object.entries(permission.network ?? {}).some(([name, value]) => name !== "enabled" && value != null)
    || config.shell_environment_policy?.inherit !== "none" || Object.values(config.shell_environment_policy?.set ?? {}).some(value => value !== "")) {
    throw new Error("Effective role policy differs; no model turn started");
  }
}

export async function verifyRoleExecution(server, scratch, agent, platform = process.platform) {
  if (agent === "pm") return;
  const marker = "harness-role-execution-ready";
  const command = platform === "win32"
    ? [path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"), "-NoProfile", "-NonInteractive", "-Command", `[Console]::Write('${marker}')`]
    : ["/bin/sh", "-c", `printf '${marker}'`];
  // Omit sandboxPolicy: the command must use the already checked named permissions.
  // A config/read match alone does not prove the host can launch a restricted tool.
  let result;
  try { result = await server.request("command/exec", { command, cwd: scratch, timeoutMs: 10000, outputBytesCap: 1024 }, 15000); }
  catch { throw new Error("Role sandbox execution unavailable; no model turn started. Use a host supporting the unchanged role permissions."); }
  if (result.exitCode !== 0 || result.stdout?.trim() !== marker) {
    throw new Error("Role sandbox execution unavailable; no model turn started. Use a host supporting the unchanged role permissions.");
  }
}

async function inspectHostPolicy(cli, config, scratch, files, session, binding, url, tools) {
  const child = spawn(cli.executable, [...cli.prefix, ...config.flatMap(value => ["-c", value]), "app-server", "--stdio", "--strict-config"], { cwd: scratch, env: childEnvironment(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const server = new AppServer(child), identity = { pid: child.pid, nonce: randomUUID() };
  let registered = false;
  try {
    if (!child.pid) throw new Error("Codex policy inspection did not start");
    await registerChild(files, session, binding, identity); registered = true;
    await server.request("initialize", { clientInfo: { name: "stagekeeper-policy-preflight", version: "1" } });
    const result = await server.request("config/read", { includeLayers: false, cwd: scratch });
    return inheritedPolicyOverrides(result.config, url, tools);
  } finally {
    await server.close();
    if (registered && server.closed) await settleChild(files, session, identity);
  }
}

export async function dispatchFreshRole(input, files, session, dispatch) {
  const owned = await checkSession(files, session, input.binding);
  if (owned.event !== "owned" || owned.lifecycle !== "active" || owned.client !== "codex") throw new Error("Active Codex session required");
  if (!/^[a-z][a-z0-9-]*$/.test(dispatch.agent)) throw new Error("Invalid role");
  const role = readFileSync(safeTarget(input.binding.root, `.codex/agents/${dispatch.agent}.toml`), "utf8");
  const roleConfig = readCodexRole(role, ROLE_TOOLS[dispatch.agent] ? dispatch.agent : "dev", dispatch.agent);
  const verifier = verifierPackage();
  const expected = JSON.parse(readFileSync(path.join(input.binding.root, "docs/harness/codex-package.json"), "utf8")).verifier;
  if (verifier.path !== expected.path || verifier.checksum !== expected.checksum) throw new Error("Verifier package changed; rerun $harness-init");
  const scratch = mkdtempSync(path.join(tmpdir(), "harness-role-")), filesystem = rolePermissions(input, dispatch.agent, dispatch.key, scratch);
  if (dispatch.agent === "plan-verifier") filesystem[path.dirname(verifier.path)] = "read";
  const bridge = await roleBridge(input, files, session, { ...dispatch, project: input.config.project.slug });
  const cli = codexExecutable(), config = [
    'approval_policy="never"', 'agents.enabled=false', 'features.multi_agent=false', 'features.apps=false', 'features.hooks=false', 'features.memories=false', 'features.goals=false', 'features.code_mode.enabled=false', `web_search=${JSON.stringify(dispatch.agent === "feature-scout" ? "live" : "disabled")}`, 'project_doc_max_bytes=0',
    `features.shell_tool=${dispatch.agent !== "pm"}`, 'features.unified_exec=false', 'default_permissions="harness-role"', 'permissions.harness-role.extends=":read-only"',
    `permissions.harness-role.filesystem={${Object.entries(filesystem).map(([file, access]) => `${JSON.stringify(file)}=${JSON.stringify(access)}`).join(",")}}`, 'permissions.harness-role.network.enabled=false',
    `mcp_servers={harness={url=${JSON.stringify(bridge.url)},enabled_tools=${JSON.stringify(ROLE_TOOLS[dispatch.agent] ?? ROLE_TOOLS.dev)}}}`, 'shell_environment_policy.inherit="none"',
  ];
  let inherited;
  try { inherited = await inspectHostPolicy(cli, config, scratch, files, session, input.binding, bridge.url, ROLE_TOOLS[dispatch.agent] ?? ROLE_TOOLS.dev); }
  catch (error) { await bridge.close(); throw error; }
  const child = spawn(cli.executable, [...cli.prefix, ...[...config, ...inherited].flatMap(value => ["-c", value]), "app-server", "--stdio", "--strict-config"], { cwd: scratch, env: { ...childEnvironment(), HARNESS_ROLE_CAPABILITY: randomUUID() }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const hostChild = { pid: child.pid, nonce: randomUUID() }, server = new AppServer(child);
  let registered = false, threadId, turnId, settled = false, turnRequested = false, monitor, ownershipTimer, ownershipPending, complete;
  let monitorStopped = false; const reports = [];
  try {
    if (!child.pid) throw new Error("Codex process did not start");
    await registerChild(files, session, input.binding, hostChild); registered = true;
    await server.request("initialize", { clientInfo: { name: "stagekeeper-role", version: "1" }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
    const effective = await server.request("config/read", { includeLayers: false, cwd: scratch });
    assertRolePolicy(effective.config, filesystem, bridge.url, dispatch.agent);
    await verifyRoleExecution(server, scratch, dispatch.agent);
    const inventory = await server.request("skills/list", { cwds: [scratch], forceReload: true });
    const skills = (inventory.data ?? []).flatMap(value => value.skills ?? []), matching = skills.filter(skill => skill.name === "reconciling-proposals-with-codebase");
    if (dispatch.agent === "plan-verifier" && (matching.length !== 1 || realpathSync(matching[0].path) !== realpathSync(verifier.path))) throw new Error("Actual verifier loader path differs");
    const thread = await server.request("thread/start", { cwd: scratch, ephemeral: true, baseInstructions: "You are a Stagekeeper role in a new independent context. Use only the supplied role and current server instructions. No parent conversation is provided.", developerInstructions: roleConfig.developer_instructions, config: { "skills.config": skills.map(skill => ({ path: skill.path, enabled: dispatch.agent === "plan-verifier" && skill.name === "reconciling-proposals-with-codebase" })) } });
    threadId = thread.thread?.id;
    if (!threadId) throw new Error("Fresh thread identity missing");
    const completion = new Promise((resolve, reject) => { complete = message => {
      const item = message.params?.item;
      if (message.method === "item/completed" && message.params?.threadId === threadId && item?.type === "agentMessage" && item.phase !== "commentary" && typeof item.text === "string") reports.push(item.text);
      if (message.method === "transport/error") reject(new Error("Role transport failed"));
      if (message.method === "turn/completed" && message.params?.threadId === threadId) {
        if (turnId && message.params.turn?.id !== turnId) return;
        settled = true; if (message.params.turn?.status === "completed") resolve(); else reject(new Error("Role turn failed or interrupted"));
      }
    }; server.listeners.add(complete); });
    void completion.catch(() => {});
    turnRequested = true;
    const turn = await server.request("turn/start", { threadId, input: [{ type: "text", text: JSON.stringify({ project: input.config.project.slug, repository: input.binding.root, scratch, agent: dispatch.agent, key: dispatch.agentKey ?? null, boardKey: dispatch.key ?? null, planPath: dispatch.planPath, planCommit: dispatch.planCommit, requiredVerificationPaths: dispatch.requiredVerificationPaths, entry: dispatch.entry ?? null, agentRunId: dispatch.agentRunId ?? null, commitPermission: false, commitHandoffPermission: owned.policy.commit, verifierPath: dispatch.agent === "plan-verifier" ? verifier.path : undefined }) }] });
    turnId = turn.turn?.id;
    if (!turnId) throw new Error("Active turn identity missing");
    const deadline = new Promise((_, reject) => { monitor = setTimeout(() => reject(new Error("Role turn deadline exceeded")), 15 * 60000); });
    const monitorOwnership = async () => {
      try { const state = await checkSession(files, session, input.binding); if (state.event !== "owned" || state.lifecycle !== "active") { if (turnId) await server.request("turn/interrupt", { threadId, turnId }); } }
      catch { if (!server.closed) server.child.kill(); }
      if (!monitorStopped && !settled) ownershipTimer = setTimeout(() => { ownershipPending = monitorOwnership(); }, 1000);
    };
    ownershipTimer = setTimeout(() => { ownershipPending = monitorOwnership(); }, 1000);
    await Promise.race([completion, deadline]);
    const result = bridge.result();
    if (!result.receipt) throw new Error("Role did not execute agent_next; no completion claimed");
    const report = reports.join("\n\n");
    if (report.length > 1024 * 1024 || report.includes(input.token) || /\b(?:hs_|hu_|ho_)[A-Za-z0-9_-]+/.test(report)) throw new Error("Role report unsafe or too large");
    return { event: result.done ? "done" : "paused", threadId, report, ...result };
  } finally {
    clearTimeout(monitor);
    monitorStopped = true; clearTimeout(ownershipTimer); await ownershipPending;
    if (threadId && turnId && !settled && !server.closed) {
      await server.request("turn/interrupt", { threadId, turnId }).catch(() => {});
      const limit = Date.now() + 20000;
      while (!settled && !server.closed && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 25));
    }
    let processEnded = false;
    try { await server.close(); processEnded = true; } finally { await bridge.close(); }
    // Process death alone cannot establish quiescence of an unacknowledged active turn.
    if (registered && processEnded && server.closed && (!turnRequested || settled)) await settleChild(files, session, hostChild);
  }
}
