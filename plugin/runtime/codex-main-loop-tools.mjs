import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { callTool, listTools } from "./mcp-client.mjs";
import { dispatchFreshRole } from "./codex-thread.mjs";
import { dispatchBinding } from "../bin/harness-codex.mjs";
import { confirmCommitHandoff } from "./commit-handoff.mjs";
import { safeTarget } from "./file-ownership.mjs";
import { createRoleGit, roleGitTool } from "./role-git.mjs";
import { commitResidentArtifacts, recordResidentRoleReport, residentGit } from "./resident-commit.mjs";
import { residentRoleReportPath } from "./report-artifacts.mjs";
import { verifierTarget, RoleBriefingInputError } from "./verifier-dispatch.mjs";
import { createQaBrowser } from "./qa-browser.mjs";

const DOMAIN = ["pipeline_next", "board_get", "backlog_get", "backlog_list", "project_get", "validation_record", "report_submit", "acceptance_fail"];
const keySchema = { type: "string", pattern: "^[A-Za-z0-9_-]+$" };
const tool = (name, description, properties, required = []) => ({ name, description,
  inputSchema: { type: "object", properties, required, additionalProperties: false } });
const LOCAL = [
  tool("resident_dispatch", "Dispatch only the current server-selected role in a fresh independent context. requiredVerificationPaths is exclusively for plan-verifier; omit it or pass null for every other role. Never supply previous reviewer conclusions. After a handoff, first commit the artifact then dispatch again. Implementation verification uses an automatically prepared copy and needs only key. Before QA call resident_qa_environment to observe its configured test page and full implementation commit.",
    { key: keySchema, requiredVerificationPaths: { type: ["array", "null"], description: "Nonempty selected verification paths for plan-verifier only. For impl-verifier, qa-verifier, dev, scout and auditor omit this field or use null.", items: { type: "string" }, minItems: 1, maxItems: 30 } }),
  tool("resident_qa_environment", "Observe only the configured test page before a current QA dispatch. The page must expose the full implementation report commit. Returns actual browser snapshot evidence; it does not approve QA or acceptance. No arbitrary URL or mutation is accepted.", { key: keySchema }, ["key"]),
  tool("resident_commit", "Commit explicit current handoff files or the acceptance report using their observed SHA256 hashes. Every path must be repository-relative with forward slashes, unlike the absolute paths used by file tools. Include the pipeline_next.note handoff artifact, converting an absolute note to its repository-relative path, and all changed implementation files; for acceptance include docs/agents/main-loop/<key>.md. Requires this session's commit permission. No arbitrary Git command, hooks or push.",
    { key: keySchema, files: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", properties: { path: { type: "string", description: "Repository-relative file path with forward slashes, for example docs/plans/K-1.md; never an absolute path." }, hash: { type: "string", pattern: "^[a-f0-9]{64}$" } }, required: ["path", "hash"], additionalProperties: false } } }, ["key", "files"]),
  tool("resident_git", roleGitTool.description + " Supply the current item key; paths are absolute regular file paths, never a repository directory. The helper already checked the clean tree and owned branch before this cycle started.",
    { key: keySchema, ...roleGitTool.inputSchema.properties }, ["key", "operation"]),
];
const validKey = key => typeof key === "string" && /^[A-Za-z0-9_-]+$/.test(key);
const digest = value => createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex");

export async function createMainLoopTools(context, operations = {}) {
  const { input, files, session, branch, scratch, fileBroker, commandBroker, guard, lifecycle, signal } = context;
  const runtime = { callTool, listTools, dispatchFreshRole, commitResidentArtifacts, recordResidentRoleReport, createRoleGit, verifierTarget, createQaBrowser, ...operations };
  let qaObservation = null;
  const domain = (await runtime.listTools(input)).filter(value => DOMAIN.includes(value.name));
  if (domain.length !== DOMAIN.length || new Set(domain.map(value => value.name)).size !== DOMAIN.length) throw new Error("Main-loop domain inventory incomplete");
  const inventory = [...domain, ...LOCAL, ...commandBroker.tools];
  const request = async (name, args = {}) => {
    await guard({ remote: true });
    const value = await runtime.callTool(input, name, args, signal);
    await guard();
    if (name === "pipeline_next" && value.runbook?.stale) throw new Error("Resident runbook is stale");
    return value;
  };
  const nextFor = async key => {
    if (key !== undefined && !validKey(key)) throw new Error("Safe item key required");
    const value = await request("pipeline_next", key === undefined ? {} : { key });
    return key === undefined ? value.head : value;
  };

  async function dispatch(args, allowReportResume = true) {
    const owned = await guard({ remote: true });
    let next = await nextFor(args.key), handoff;
    if (next.action === "wait" && next.on === "handoff") {
      handoff = confirmCommitHandoff(input.binding.root, args.key, next, residentGit(input.binding.root, ["rev-parse", "HEAD"]));
      next = { ...next, ...next.resume, action: "dispatch" };
    }
    if (next.action !== "dispatch") return { event: "waiting", next };
    if (!next.key && !owned.policy.propose) throw new Error("New work is disabled");
    const binding = dispatchBinding(next, input.config.workspaces);
    if (handoff) binding.commitHandoff = handoff;
    if (binding.key) {
      const board = await request("board_get", { key: binding.key });
      binding.planPath = board.planPath; binding.planCommit = board.planCommit;
      if (["qa-verifier", "impl-verifier"].includes(binding.agent)) {
        const target = runtime.verifierTarget(input.binding.root, board, binding.key);
        binding.planCommit = target.planCommit;
        if (binding.agent === "impl-verifier") binding.implementation = { targetCommit: target.targetCommit };
        else if (handoff) binding.qaBriefing = { targetCommit: target.targetCommit, testBuildIdentity: "Owner-confirmed report continuation; record its existing browser evidence without repeating verification." };
        else {
          if (!qaObservation || qaObservation.key !== binding.key || qaObservation.targetCommit !== target.targetCommit) throw new Error("Observe the current QA test build with resident_qa_environment before dispatch");
          binding.qaBriefing = { targetCommit: target.targetCommit, testBuildIdentity: qaObservation.testBuildIdentity };
        }
      }
    }
    if (binding.agent === "plan-verifier") {
      const checks = args.requiredVerificationPaths;
      if (!Array.isArray(checks) || !checks.length || checks.length > 30 || checks.some(value => typeof value !== "string" || !value.trim() || value.length > 2000)
        || !binding.planPath || !binding.planCommit) throw new RoleBriefingInputError("plan-verifier requires nonempty requiredVerificationPaths and the current submitted plan. No role run started.");
      binding.requiredVerificationPaths = checks;
    } else if (args.requiredVerificationPaths != null) throw new RoleBriefingInputError(`requiredVerificationPaths is only for plan-verifier. The current role is ${binding.agent}; omit requiredVerificationPaths or pass null and retry with the same key. No role run started.`);
    await guard({ remote: true });
    const result = await runtime.dispatchFreshRole(input, files, session, binding, {
      signal, record: context.record, checkSession: async () => guard({ allowPaused: true }),
      callTool: async (target, name, values, roleSignal) => {
        await guard({ remote: true });
        const value = await runtime.callTool(target, name, values, roleSignal ? AbortSignal.any([signal, roleSignal]) : signal);
        await guard({ allowPaused: true });
        return value;
      },
    });
    await guard({ allowPaused: true });
    if (allowReportResume && !result.done && ["impl-verifier", "qa-verifier"].includes(binding.agent)) {
      const current = await guard({ remote: true });
      const pending = await nextFor(binding.key), runId = result.receipt?.agentRunId ?? result.receipt?.receipt?.runId, step = result.receipt?.step;
      if (current.policy.commit && ["report", "failed-report", "blocked-report"].includes(step) && pending.action === "wait" && pending.on === "handoff" && pending.resume?.agent === binding.agent && pending.resume.agentRunId === runId) {
        const artifact = `docs/agents/${binding.agent}/${binding.key}.md`, target = safeTarget(input.binding.root, artifact);
        if (safeTarget(input.binding.root, pending.note?.trim() ?? "") !== target) throw new Error("Verifier report handoff path differs");
        const hash = fileBroker.call("role_file_read", { path: target, maxLines: 1 }).hash;
        const board = await request("board_get", { key: binding.key });
        await guard({ remote: true });
        runtime.commitResidentArtifacts({ root: input.binding.root, branch, key: binding.key, next: pending, board, workspaces: input.config.workspaces, files: [{ path: artifact, hash }] });
        return dispatch({ key: binding.key }, false);
      }
    }
    let recordedReport = null;
    if (result.done && residentRoleReportPath(binding.agent)) {
      const current = await guard({ remote: true });
      recordedReport = runtime.recordResidentRoleReport({ root: input.binding.root, branch, agent: binding.agent,
        threadId: result.threadId, report: result.report, commitPermission: current.policy.commit });
    }
    return { event: result.event, threadId: result.threadId, done: result.done, receipt: result.receipt?.receipt ?? null, report: result.report, ...(recordedReport ? { recordedReport } : {}) };
  }

  return { tools: inventory, async call(name, original = {}) {
    signal.throwIfAborted();
    if (original === null || typeof original !== "object" || Array.isArray(original)) throw new Error("Object arguments required");
    const args = { ...original };
    if (Object.hasOwn(args, "project")) {
      if (args.project !== input.config.project.slug) throw new Error("Main-loop project mismatch");
      delete args.project;
    }
    if (Object.hasOwn(args, "client") && args.client !== "codex") throw new Error("Main-loop client mismatch");
    await guard();
    const local = LOCAL.find(value => value.name === name);
    if (local && (Object.keys(args).some(key => !Object.hasOwn(local.inputSchema.properties, key))
      || local.inputSchema.required.some(key => !Object.hasOwn(args, key)))) throw new Error("Unexpected main-loop arguments");
    if (name === "resident_dispatch") return dispatch(args);
    if (name === "resident_qa_environment") {
      qaObservation = null;
      const next = await nextFor(args.key);
      if (!(next.action === "dispatch" && next.agent === "qa-verifier") && !(next.action === "wait" && next.on === "handoff" && next.resume?.agent === "qa-verifier")) throw new Error("A current QA dispatch or report handoff is required");
      const board = await request("board_get", { key: args.key }), target = runtime.verifierTarget(input.binding.root, board, args.key);
      const browser = await runtime.createQaBrowser(input.config.qa);
      try {
        await browser.call("browser_navigate", { url: input.config.qa.baseUrl }, signal);
        const snapshot = await browser.call("browser_snapshot", {}, signal);
        const observed = snapshot.mcpResult.content.filter(item => item.type === "text").map(item => item.text).join("\n");
        if (!observed.includes(target.targetCommit)) return { event: "blocked", reason: "The configured QA page must expose the full implementation report commit before unattended QA can start.", targetCommit: target.targetCommit };
        qaObservation = { key: args.key, targetCommit: target.targetCommit,
          testBuildIdentity: `Observed the configured test page ${input.config.qa.baseUrl} exposing implementation commit ${target.targetCommit}. Browser snapshot SHA-256: ${digest(observed)}.` };
        await guard({ remote: true });
        return { event: "ready", ...qaObservation, snapshot: observed };
      } finally { await browser.close(); }
    }
    if (name === "resident_commit") {
      const owned = await guard({ remote: true });
      if (!owned.policy.commit) throw new Error("Commit permission required");
      const next = await nextFor(args.key), board = await request("board_get", { key: args.key });
      await guard({ remote: true });
      return runtime.commitResidentArtifacts({ root: input.binding.root, branch, key: args.key, next, board, workspaces: input.config.workspaces, files: args.files });
    }
    if (name === "resident_git") {
      const { key, ...query } = args;
      if (!validKey(key)) throw new Error("Safe item key required");
      const board = await request("board_get", { key });
      const reader = runtime.createRoleGit({ root: input.binding.root, agent: "main-loop", fileBroker,
        backend: commandBroker, planCommit: board.planCommit, commonDirectory: path.dirname(path.dirname(files.lock)) }, lifecycle);
      return reader.call("role_git_read", query, signal);
    }
    if (["report_submit", "acceptance_fail"].includes(name)) {
      if (!validKey(args.key) || (name === "report_submit" && args.actor !== "main-loop")) throw new Error("Main-loop acceptance only");
      if ((await nextFor(args.key)).action !== "accept") throw new Error("Fresh acceptance node required");
      if (args.path !== undefined || args.commit !== undefined || name === "report_submit") {
        if (args.path !== `docs/agents/main-loop/${args.key}.md` || !/^[a-f0-9]{40}$/.test(args.commit ?? "")) throw new Error("Confirmed acceptance artifact required");
        residentGit(input.binding.root, ["merge-base", "--is-ancestor", args.commit, "HEAD"]);
        const current = readFileSync(safeTarget(input.binding.root, args.path), "utf8");
        const committed = residentGit(input.binding.root, ["cat-file", "blob", `${args.commit}:${args.path}`], { raw: true });
        if (digest(current) !== digest(committed)) throw new Error("Acceptance artifact changed");
      }
      return request(name, args);
    }
    if (name === "validation_record") {
      if (!validKey(args.key)) throw new Error("Safe item key required");
      const board = await request("board_get", { key: args.key });
      if (board.status !== "in_review") throw new Error("Current plan review required");
      return request(name, args);
    }
    if (DOMAIN.includes(name)) return request(name, args);
    if (!commandBroker.tools.some(value => value.name === name)) throw new Error("Main-loop tool refused");
    if (name === "role_file_write") {
      const relative = path.relative(input.binding.root, args.path ?? "").replaceAll("\\", "/");
      const inScratch = path.relative(scratch, args.path ?? "");
      if (inScratch.startsWith("..") || path.isAbsolute(inScratch)) {
        const match = /^docs\/agents\/main-loop\/([A-Za-z0-9_-]+)\.md$/.exec(relative);
        if (!match || (await nextFor(match[1])).action !== "accept") throw new Error("Only the current acceptance report may be written");
      }
      await guard({ remote: true });
    }
    const value = await commandBroker.call(name, args, signal);
    await guard();
    return value;
  } };
}
