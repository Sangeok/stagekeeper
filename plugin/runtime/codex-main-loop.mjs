import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { AppServer, assertRolePolicy, childEnvironment, codexExecutable, inspectHostPolicy, stageVerifierPackage, verifyRoleExecution } from "./codex-thread.mjs";
import { verifierPackage } from "./codex-agent.mjs";
import { checkSession, readState, recordedChildren, registerChild, settleChild } from "./local-session.mjs";
import { createRoleFiles, RoleFileInputError, RoleFileRevisionError, RolePathMissingError } from "./role-files.mjs";
import { createRoleCommands, installedWindowsRuntime, verifyNativeRuntime, RoleCommandInputError } from "./role-commands.mjs";
import { createMainLoopTools } from "./codex-main-loop-tools.mjs";
import { ResidentCommitInputError, residentGit } from "./resident-commit.mjs";
import { RoleGitInputError, RoleGitPathMissingError } from "./role-git.mjs";

const correctableInput = error => error instanceof RoleFileInputError || error instanceof RoleCommandInputError || error instanceof ResidentCommitInputError
  || error instanceof RolePathMissingError || error instanceof RoleGitInputError || error instanceof RoleGitPathMissingError || error instanceof RoleFileRevisionError;

export async function createMainLoopBridge(tools, signal, record = () => {}, onRefusal = () => {}) {
  const capability = randomUUID(), pending = new Set();
  let queue = Promise.resolve(), count = 0, queued = 0, closing = false;
  async function handle(request, response) {
    if (request.url !== `/mcp/${capability}`) { response.writeHead(404); response.end(); return; }
    if (request.method !== "POST") { response.writeHead(405); response.end(); return; }
    let id = null;
    try {
      if (closing || signal.aborted || pending.size > 32) throw new Error("Cycle closed");
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { if ((bytes += chunk.length) > 65536) throw new Error("Request limit"); chunks.push(chunk); }
      const message = JSON.parse(Buffer.concat(chunks).toString("utf8")); id = message.id ?? null;
      let result;
      if (message.method === "initialize") result = { protocolVersion: message.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "stagekeeper-resident", version: "1" } };
      else if (message.method?.startsWith("notifications/")) { response.writeHead(202); response.end(); return; }
      else if (message.method === "tools/list") result = { tools: tools.tools };
      else if (message.method === "tools/call") {
        if (++count > 256 || queued >= 32) throw new Error("Tool request limit");
        queued++;
        const task = queue.then(async () => {
          signal.throwIfAborted();
          if (closing) throw new Error("Cycle closed");
          const name = message.params?.name, started = Date.now();
          try {
            const value = await tools.call(name, message.params?.arguments);
            signal.throwIfAborted();
            record({ event: "tool-settled", name, milliseconds: Date.now() - started });
            return value;
          } catch (error) {
            record({ event: "tool-refused", name, reason: String(error?.message ?? "Tool failed").slice(0, 500).replace(/\b(?:hs_|hu_|ho_)[A-Za-z0-9_-]+/g, "[redacted]") });
            if (!correctableInput(error) && !signal.aborted) { closing = true; onRefusal(); }
            throw error;
          }
        });
        queue = task.catch(() => {});
        try { result = { content: [{ type: "text", text: JSON.stringify(await task) }] }; }
        finally { queued--; }
      } else if (message.method === "ping") result = {};
      else throw new Error("Method refused");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (error) {
      if (response.destroyed) return;
      const invalid = error instanceof RoleFileInputError || error instanceof RoleCommandInputError || error instanceof ResidentCommitInputError || error instanceof RoleGitInputError;
      const missing = error instanceof RolePathMissingError || error instanceof RoleGitPathMissingError;
      const conflict = error instanceof RoleFileRevisionError;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: invalid ? -32602 : missing ? -32004 : conflict ? -32005 : -32000,
        message: invalid || missing || conflict ? error.message : "Resident request refused. Stop this cycle without bypassing ownership, permissions or a required handoff." } }));
    }
  }
  const server = createServer((request, response) => {
    const task = handle(request, response); pending.add(task);
    void task.finally(() => pending.delete(task)).catch(() => response.destroy());
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/mcp/${capability}`, async close() {
    closing = true; server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await Promise.allSettled([...pending]);
    if (queued !== 0) throw new Error("Resident handlers remain active");
  } };
}

export function createCodexExecution(context, operations = {}) {
  const { input, files, session, branch, beat, record = () => {} } = context;
  const runtime = { spawn, codexExecutable, inspectHostPolicy, createRoleFiles, createRoleCommands, installedWindowsRuntime,
    verifyNativeRuntime, verifierPackage, stageVerifierPackage, verifyRoleExecution, assertRolePolicy, createMainLoopTools, createMainLoopBridge, createAppServer: child => new AppServer(child), ...operations };
  let current = null, lastLease = null, leaseAt = 0;
  const policy = readState(files)?.policy;
  return {
    stopMode: "interrupt",
    observeLease(result) {
      lastLease = result; leaseAt = Date.now();
      if ((result.kind !== "ok" && result.kind !== "transient") || result.stop) current?.end("stop");
    },
    start({ generation }) {
      if (current) throw new Error("A Codex cycle is already active");
      const controller = new AbortController(), signal = controller.signal;
      let server, bridge, backend, identity, threadId, turnId, listener, terminal, terminalStatus, terminalTurnId, endedFor = null;
      let registered = false, turnRequested = false, interruptRequested = false, interruptPending;
      const interrupt = () => {
        if (!server || server.closed || !threadId || !turnId || terminalStatus || interruptRequested) return interruptPending;
        interruptRequested = true;
        interruptPending = server.request("turn/interrupt", { threadId, turnId });
        void interruptPending.catch(() => {});
        return interruptPending;
      };
      const end = reason => { if (endedFor) return; endedFor = reason; controller.abort(); void interrupt()?.catch(() => {}); };
      const cycle = { end, done: null }; current = cycle;
      const guard = async ({ remote = false, allowPaused = false } = {}) => {
        signal.throwIfAborted();
        const owned = await checkSession(files, session, input.binding);
        if (current !== cycle || owned.event !== "owned" || owned.lifecycle !== "active" || owned.client !== "codex" || owned.mode !== "resident"
          || !isDeepStrictEqual(readState(files)?.policy, policy)) {
          end("stop"); throw new Error("Resident ownership changed");
        }
        if (residentGit(input.binding.root, ["symbolic-ref", "--short", "HEAD"]) !== branch) { end("branch"); throw new Error("Resident branch changed"); }
        if (remote) { lastLease = await beat({}); leaseAt = Date.now(); }
        signal.throwIfAborted();
        if (lastLease?.kind !== "ok" || lastLease.stop || Date.now() - leaseAt > 120000) throw new Error("Live resident lease required");
        if (!allowPaused && lastLease.paused) throw new Error("Resident is paused");
        return owned;
      };
      cycle.done = (async () => {
        let failure = null;
        try {
          await guard({ remote: true });
          const scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-main-loop-"));
          const root = input.binding.root;
          const verifier = runtime.verifierPackage(), expected = JSON.parse(readFileSync(path.join(root, "docs/harness/codex-package.json"), "utf8")).verifier;
          if (verifier.path !== expected.path || verifier.checksum !== expected.checksum) throw new Error("Verifier package changed");
          const stagedVerifier = runtime.stageVerifierPackage(verifier, scratch);
          const filesystem = { ":root": "deny", ":minimal": "read", [root]: "read", [scratch]: "write",
            [path.dirname(stagedVerifier.path)]: "read",
            [path.join(root, "docs/agents/main-loop")]: "write", [path.join(root, ".git")]: "deny",
            [path.join(root, ".codex")]: "deny", [path.join(root, ".claude")]: "deny", [path.join(homedir(), ".codex")]: "deny" };
          const fileBroker = runtime.createRoleFiles(filesystem, "main-loop"); backend = fileBroker;
          const lifecycle = { onSpawn: value => registerChild(files, session, input.binding, value), onSettled: value => settleChild(files, session, value),
            beforeActivate: async () => { await guard({ allowPaused: true }); } };
          const native = runtime.installedWindowsRuntime();
          await runtime.verifyNativeRuntime(native, lifecycle);
          await guard({ remote: true });
          backend = await runtime.createRoleCommands({ root, scratch, agent: "main-loop", fileBroker, runtime: native }, lifecycle);
          const tools = await runtime.createMainLoopTools({ input, files, session, branch, scratch, fileBroker, commandBroker: backend, guard, lifecycle, signal,
            record: event => record({ ...event, generation }) });
          bridge = await runtime.createMainLoopBridge(tools, signal, event => record({ ...event, generation }), () => end("policy"));
          const names = tools.tools.map(tool => tool.name), cli = runtime.codexExecutable();
          const config = ['approval_policy="never"', 'agents.enabled=false', 'features.multi_agent=false', 'features.apps=false', 'features.hooks=false', 'features.memories=false',
            'features.goals=false', 'features.view_image=false', 'features.request_permissions_tool=false', 'features.code_mode.enabled=false', 'features.shell_tool=false', 'features.unified_exec=false',
            'web_search="disabled"', 'project_doc_max_bytes=0', 'default_permissions="harness-role"', 'permissions.harness-role.extends=":read-only"',
            `permissions.harness-role.filesystem={${Object.entries(filesystem).map(([name, access]) => `${JSON.stringify(name)}=${JSON.stringify(access)}`).join(",")}}`,
            'permissions.harness-role.network.enabled=false', 'shell_environment_policy.inherit="none"'];
          const inherited = await runtime.inspectHostPolicy(cli, config, scratch, files, session, input.binding, bridge.url, names, 1200);
          await guard({ remote: true });
          const child = runtime.spawn(cli.executable, [...cli.prefix, ...[...config, ...inherited].flatMap(value => ["-c", value]), "app-server", "--stdio", "--strict-config"],
            { cwd: scratch, env: { ...childEnvironment(), HARNESS_ROLE_CAPABILITY: randomUUID() }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
          server = runtime.createAppServer(child); identity = { pid: child.pid, nonce: randomUUID() };
          if (!child.pid) throw new Error("Main-loop process unavailable");
          await registerChild(files, session, input.binding, identity); registered = true;
          await server.request("initialize", { clientInfo: { name: "stagekeeper-resident", version: "1" }, capabilities: { experimentalApi: true } });
          child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
          const effective = await server.request("config/read", { includeLayers: false, cwd: scratch });
          runtime.assertRolePolicy(effective.config, filesystem, bridge.url, "main-loop", true, true, false, names);
          await runtime.verifyRoleExecution(server, scratch, "main-loop", process.platform, fileBroker);
          const inventory = await server.request("skills/list", { cwds: [scratch], forceReload: true });
          const thread = await server.request("thread/start", { cwd: scratch, ephemeral: true,
            baseInstructions: "You are Stagekeeper's resident main loop in a new independent context. The server owns pipeline state. No previous conversation is provided.",
            developerInstructions: "Read the complete installed runbook and follow its server-driven procedure and five acceptance checks. This explicitly authorized resident entry extends its foreground-only adapter: stored commit/propose policy is current permission, resident_dispatch replaces the foreground CLI, and permitted handoffs resume automatically after resident_commit. Never call prepare or adopt a foreground session. Never reset, stash, push or approve gates. Use resident_dispatch for fresh roles; never perform a role's work yourself. Use resident_commit only for current handoffs or your acceptance report, providing observed file hashes. Independent verifier briefing contains only selected verification paths, never prior verdicts. Before dispatching the verifier, load the complete staged verifier skill and conduct your own read-only reconciliation with the selected paths. Read files through role_file_read/list/search (maxLines at most 500); write planning/review logs and receipts only under the supplied scratch path. The repository report docs/agents/main-loop/<key>.md may be written only when pipeline_next currently returns accept. Run verification through role_command_exec in a disposable snapshot using relative paths; inspect omissions and failures. Use resident_git for HEAD/approved-plan evidence. Owner tools, shell, arbitrary Git, extra agents and permission escalation are unavailable. Invalid file, command or commit parameters may be corrected within the existing tool schema; an ownership or policy refusal ends this cycle without bypass. End when no permitted work remains, or on gate/cap/QA/acceptance wait. Report model completion separately from server acceptance.",
            config: { "skills.config": (inventory.data ?? []).flatMap(value => value.skills ?? []).map(skill => ({ path: skill.path, enabled: false })) } });
          threadId = thread.thread?.id;
          if (!threadId) throw new Error("Main-loop thread identity missing");
          terminal = new Promise((resolve, reject) => {
            listener = message => {
              if (message.method === "transport/error") reject(new Error("Main-loop transport ended"));
              const item = message.params?.item;
              if (message.method === "item/completed" && message.params?.threadId === threadId && item?.type === "agentMessage" && item.phase !== "commentary")
                record({ event: "model-message", generation, text: String(item.text ?? "").slice(0, 6000).replace(/\b(?:hs_|hu_|ho_)[A-Za-z0-9_-]+/g, "[redacted]") });
              if (message.method === "turn/completed" && message.params?.threadId === threadId
                && (!turnId || message.params.turn?.id === turnId)) { terminalTurnId = message.params.turn?.id; terminalStatus = message.params.turn?.status; resolve(terminalStatus); }
            }; server.listeners.add(listener);
          });
          void terminal.catch(() => {});
          const owned = await guard({ remote: true });
          turnRequested = true;
          const turn = await server.request("turn/start", { threadId, input: [{ type: "text", text: JSON.stringify({ project: input.config.project.slug,
            repository: root, scratch, runbook: path.join(root, "docs/harness/codex-runbook.md"), verifierPath: stagedVerifier.path, session, generation, policy: owned.policy,
            instruction: "Read the complete runbook, query pipeline_next and process currently permitted work. Read the verification-path catalog before selecting independent checks. Never approve a gate or push." }) }] });
          turnId = turn.turn?.id;
          if (!turnId) throw new Error("Main-loop turn identity missing");
          if (terminalTurnId && terminalTurnId !== turnId) { terminalStatus = undefined; throw new Error("Main-loop terminal identity differs"); }
          record({ event: "model-start", generation, threadId, turnId });
          if (signal.aborted) await interrupt();
          await terminal;
        } catch (error) { failure = error; }
        finally {
          controller.abort();
          if (turnRequested && !terminalStatus && server && !server.closed) {
            await interrupt()?.catch(() => {});
            let timer;
            try { await Promise.race([terminal?.catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 20000); })]); }
            finally { clearTimeout(timer); }
          }
          try { if (server) await server.close(); }
          finally { try { if (bridge) await bridge.close(); } finally { await backend?.close(); } }
          if (listener) server?.listeners.delete(listener);
          if (registered && server.closed && (!turnRequested || terminalStatus)) await settleChild(files, session, identity);
          if (recordedChildren(readState(files)?.lock ?? {}).length) throw new Error("Resident child termination unconfirmed");
          current = null;
        }
        record({ event: "model-settled", generation, terminal: terminalStatus ?? "not-started", endedFor, failed: failure !== null,
          ...(failure ? { reason: String(failure.message ?? "Cycle failed").slice(0, 500).replace(/\b(?:hs_|hu_|ho_)[A-Za-z0-9_-]+/g, "[redacted]") } : {}) });
        return { terminal: terminalStatus, endedFor, failed: failure !== null, generation };
      })();
      return cycle;
    },
    classify(result) {
      const outcome = result.endedFor === "stop" ? "cancelled" : result.endedFor === "branch" ? "branch" : result.endedFor === "timeout" ? "timeout"
        : !result.endedFor && result.terminal === "completed" && !result.failed ? "success" : "error";
      return { outcome, line: `Codex cycle ${result.generation}: ${outcome}` };
    },
  };
}
