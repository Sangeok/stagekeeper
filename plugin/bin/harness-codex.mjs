#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gitRoot, stateFiles, checkSession, startSession, requestStop, releaseSession } from "../runtime/local-session.mjs";
import { connectionInput, verifyProject, verifyCodexSupport, callTool } from "../runtime/mcp-client.mjs";
import { codexExecutable, dispatchFreshRole, RoleExecutionUnavailable } from "../runtime/codex-thread.mjs";
import { RUNTIME_PROTOCOL } from "../lib/client-runtime.mjs";
import { verifierPackage } from "../runtime/codex-agent.mjs";
import { safeTarget } from "../runtime/file-ownership.mjs";

// Codex does not run impl-verifier yet (its verification environment is a separate proposal), so the dispatch stops before any run opens.
export class CodexRoleUnsupported extends Error {
  constructor() {
    super("Implementation verification (impl-verify) is not available on Codex yet; no role run started. Continue this item from Claude Code, or remove impl-verify from the Pipeline tab so items that have not started skip it.");
    this.name = "CodexRoleUnsupported";
    this.code = "codex-role-unsupported";
  }
}

export function dispatchBinding(next, workspaces) {
  if (next.action !== "dispatch") throw new Error("Current pipeline is not dispatchable");
  if (next.agent === "impl-verifier") throw new CodexRoleUnsupported();
  const item = next.key !== undefined;
  if (item && next.format !== null && next.format !== "slots-v1") throw new Error("Unsupported item pipeline format");
  if (next.format === "slots-v1" && (!next.entry?.runId || !next.entry?.entryId || !next.entry?.slotId)) throw new Error("Bound dispatch missing entry");
  const keyed = workspaces.some(ws => ws.agent === next.agent) || ["plan-verifier", "qa-verifier"].includes(next.agent);
  if (keyed && !next.key) throw new Error("Workspace/verifier requires an item key");
  return { agent: next.agent, key: next.key, agentKey: keyed ? next.key : undefined, entry: next.entry, ...(next.agentRunId ? { agentRunId: next.agentRunId } : {}) };
}

export function codexFailure(error, session = null) {
  if (error instanceof RoleExecutionUnavailable || error instanceof CodexRoleUnsupported) {
    return { event: "error", session, code: error.code, reason: error.message };
  }
  return { event: "error", session, code: "codex-refused", reason: "Codex configuration, runtime, binding, permission or server check failed. Keep ownership until owned work is quiescent; resolve with $harness-init. No completion is claimed." };
}

// Workflow files that may change after the QA target. impl-verify runs before qa, so its report lands here too.
export const qaWorkflowFile = (name, key) => ["harness.json", "harness.lock.json", "CLAUDE.md", ".mcp.json", `docs/agents/qa-verifier/${key}.md`, `docs/agents/impl-verifier/${key}.md`, `docs/agents/main-loop/${key}.md`].includes(name) || [".codex/", ".claude/", "docs/harness/"].some(prefix => name.startsWith(prefix));

function optionsFor(argv) {
  const [operation, ...args] = argv;
  if (!["prepare", "next", "dispatch", "stop", "release", "complete-init"].includes(operation)) throw new Error("Unknown Codex operation");
  const options = { operation };
  const accepted = new Set(["root", "server", "session", "key", "commit", "propose", "briefing", "handoff-commit", "retry-qa"]);
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i].slice(2), value = args[i + 1];
    if (!args[i].startsWith("--") || !accepted.has(name) || Object.hasOwn(options, name) || !value || value.startsWith("--")) throw new Error("Invalid Codex arguments");
    options[name] = value;
  }
  if (operation === "prepare") {
    if (options.session || !["yes", "no"].includes(options.commit) || !["yes", "no"].includes(options.propose)) throw new Error("Prepare requires explicit commit/propose policies");
  } else if (options.commit || options.propose) throw new Error("Stored policy cannot be replaced");
  if (["next", "dispatch", "stop", "release"].includes(operation) && !options.session) throw new Error("Session required");
  if (operation === "complete-init" && (options.session || options.key)) throw new Error("Init cannot dispatch a role");
  return { ...options, root: options.root ?? "." };
}

async function main() {
  let options;
  try {
    options = optionsFor(process.argv.slice(2));
    const location = gitRoot(options.root), files = stateFiles(location.directory);
    if (["stop", "release"].includes(options.operation)) {
      const result = await (options.operation === "stop" ? requestStop(files, options.session) : releaseSession(files, options.session));
      console.log(JSON.stringify(result)); process.exitCode = result.event === "error" ? 1 : 0; return;
    }
    const input = connectionInput(location.root, { ...options, client: "codex" });
    if (options.operation === "complete-init") {
      await verifyProject(input); await verifyCodexSupport(input);
      const metadata = JSON.parse(readFileSync(join(location.root, "docs/harness/codex-package.json"), "utf8"));
      const verifier = verifierPackage();
      if (metadata.verifier?.path !== verifier.path || metadata.verifier.checksum !== verifier.checksum) throw new Error("Verifier package changed");
      const cli = codexExecutable();
      execFileSync(cli.executable, [...cli.prefix, "mcp", "add", "harness", "--url", `${input.server}/api/mcp`, "--bearer-token-env-var", "HARNESS_TOKEN"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      console.log(JSON.stringify({ event: "mcp-registered", client: "codex", protocol: RUNTIME_PROTOCOL }));
      const installed = JSON.parse(execFileSync(cli.executable, [...cli.prefix, "mcp", "get", "harness", "--json"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }));
      if (installed.transport?.url !== `${input.server}/api/mcp` || installed.transport?.bearer_token_env_var !== "HARNESS_TOKEN") throw new Error("Actual MCP registration differs");
      await callTool(input, "project_sync", { workspaces: input.config.workspaces, language: input.config.language });
      console.log(JSON.stringify({ event: "project-synced", client: "codex", protocol: RUNTIME_PROTOCOL }));
      await verifyProject(input); await verifyCodexSupport(input);
      // This marks wiring readiness only. Runtime isolation still needs the required host evidence.
      console.log(JSON.stringify({ event: "connected", client: "codex", protocol: RUNTIME_PROTOCOL, runtimeVerificationRequired: true })); return;
    }
    if (options.operation === "prepare") {
      await verifyProject(input); await verifyCodexSupport(input);
      const state = await startSession(files, input.binding, { client: "codex", commit: options.commit === "yes", propose: options.propose === "yes", host: process.env.HARNESS_SESSION_HOST_ID ?? null });
      console.log(JSON.stringify(state)); return;
    }
    const owned = await checkSession(files, options.session, input.binding);
    if (owned.event !== "owned" || owned.lifecycle !== "active" || owned.client !== "codex" || owned.mode !== "foreground") throw new Error("Active Codex foreground session required; a watch session cannot be adopted by ID");
    const pipeline = await callTool(input, "pipeline_next", options.key ? { key: options.key } : {});
    if (options.operation === "next") { console.log(JSON.stringify({ event: "next", session: options.session, policy: owned.policy, pipeline })); return; }
    let next = options.key ? pipeline : pipeline.head;
    if (options["retry-qa"] !== undefined) {
      if (options["retry-qa"] !== "yes" || next.action !== "wait" || next.on !== "qa") throw new Error("Explicit QA retry requires a current QA failure");
      next = { action: "dispatch", ...next.resume };
    }
    if (next.action === "wait" && next.on === "handoff" && options["handoff-commit"]) {
      if (!options.key || !/^[0-9a-f]{7,40}$/.test(options["handoff-commit"]) || !next.resume || !next.note) throw new Error("Confirmed handoff commit and current resume binding required");
      const prepared = safeTarget(location.root, next.note.trim());
      execFileSync("git", ["-C", location.root, "merge-base", "--is-ancestor", options["handoff-commit"], "HEAD"], { stdio: ["ignore", "pipe", "pipe"] });
      const relative = next.note.trim().replaceAll("\\", "/");
      if (![`docs/plans/${options.key}.md`, `docs/agents/${next.resume.agent}/${options.key}.md`].includes(relative)) throw new Error("Handoff artifact path differs from current role/item");
      const committed = execFileSync("git", ["-C", location.root, "show", `${options["handoff-commit"]}:${relative}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      if (committed.replaceAll("\r\n", "\n") !== readFileSync(prepared, "utf8").replaceAll("\r\n", "\n")) throw new Error("Prepared handoff file differs from confirmed commit");
      next = { action: "dispatch", ...next.resume };
    } else if (options["handoff-commit"]) throw new Error("No current handoff to continue");
    if (next.action !== "dispatch") { console.log(JSON.stringify({ event: "paused", session: options.session, pipeline })); return; }
    if (["pm", "feature-scout"].includes(next.agent) && !next.entry && !owned.policy.propose) throw new Error("New-work permission is disabled for this session");
    const dispatch = dispatchBinding(next, input.config.workspaces);
    if (dispatch.key) {
      const board = await callTool(input, "board_get", { key: dispatch.key });
      dispatch.planPath = board.planPath; dispatch.planCommit = board.planCommit;
    }
    if (dispatch.agent === "plan-verifier") {
      if (!options.briefing || !dispatch.planPath || !dispatch.planCommit) throw new Error("Verifier needs current plan and selected verification paths");
      const text = readFileSync(options.briefing, "utf8");
      if (text.length > 24000) throw new Error("Verifier briefing too large");
      const briefing = JSON.parse(text);
      if (Object.keys(briefing).some(name => name !== "requiredVerificationPaths") || !Array.isArray(briefing.requiredVerificationPaths) || !briefing.requiredVerificationPaths.length || briefing.requiredVerificationPaths.some(value => typeof value !== "string" || !value.trim())) throw new Error("Verifier briefing must contain only requiredVerificationPaths");
      dispatch.requiredVerificationPaths = briefing.requiredVerificationPaths;
    } else if (dispatch.agent === "qa-verifier") {
      if (!options.briefing || !input.config.qa) throw new Error("QA requires explicit test configuration and build identity briefing");
      const text = readFileSync(options.briefing, "utf8");
      if (text.length > 4000) throw new Error("QA briefing too large");
      const briefing = JSON.parse(text);
      if (Object.keys(briefing).some(name => !["targetCommit", "testBuildIdentity"].includes(name)) || !/^[0-9a-f]{7,40}$/.test(briefing.targetCommit ?? "") || typeof briefing.testBuildIdentity !== "string" || !briefing.testBuildIdentity.trim()) throw new Error("QA briefing requires only targetCommit and observed testBuildIdentity");
      const board = await callTool(input, "board_get", { key: dispatch.key });
      const report = board.reports?.filter(report => report.actor === board.agent && report.agentRunId).at(-1);
      if (!report || report.commit !== briefing.targetCommit) throw new Error("QA briefing target differs from the implementation report");
      execFileSync("git", ["-C", location.root, "merge-base", "--is-ancestor", briefing.targetCommit, "HEAD"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const changed = execFileSync("git", ["-C", location.root, "diff", "--name-only", briefing.targetCommit], { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim().split(/\r?\n/).filter(Boolean);
      if (changed.some(name => !qaWorkflowFile(name, dispatch.key))) throw new Error("Product files changed since the QA implementation target");
      dispatch.qaBriefing = briefing;
    } else if (options.briefing) throw new Error("Only independent verifiers accept a minimal briefing");
    console.log(JSON.stringify({ session: options.session, ...await dispatchFreshRole(input, files, options.session, dispatch) }));
  } catch (error) {
    console.log(JSON.stringify(codexFailure(error, options?.session ?? null))); process.exitCode = 1;
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/harness-codex.mjs")) void main();
