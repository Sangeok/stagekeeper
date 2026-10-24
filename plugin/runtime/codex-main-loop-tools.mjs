import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { callTool, listTools } from "./mcp-client.mjs";
import { dispatchFreshRole } from "./codex-thread.mjs";
import { dispatchBinding } from "../bin/harness-codex.mjs";
import { confirmCommitHandoff } from "./commit-handoff.mjs";
import { safeTarget } from "./file-ownership.mjs";
import { createRoleGit, roleGitTool } from "./role-git.mjs";
import { commitResidentArtifacts, residentGit } from "./resident-commit.mjs";

const DOMAIN = ["pipeline_next", "board_get", "backlog_get", "backlog_list", "project_get", "validation_record", "report_submit", "acceptance_fail"];
const keySchema = { type: "string", pattern: "^[A-Za-z0-9_-]+$" };
const tool = (name, description, properties, required = []) => ({ name, description,
  inputSchema: { type: "object", properties, required, additionalProperties: false } });
const LOCAL = [
  tool("resident_dispatch", "Dispatch only the current server-selected role in a fresh independent context. Supply verification paths, never previous reviewer conclusions. After a handoff, first commit the artifact then dispatch again. Optional QA roles stop for an explicit foreground handoff.",
    { key: keySchema, requiredVerificationPaths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 30 } }),
  tool("resident_commit", "Commit explicit current handoff files or the acceptance report using their observed SHA256 hashes. Every path must be repository-relative with forward slashes, unlike the absolute paths used by file tools. Include the pipeline_next.note handoff artifact, converting an absolute note to its repository-relative path, and all changed implementation files; for acceptance include docs/agents/main-loop/<key>.md. Requires this session's commit permission. No arbitrary Git command, hooks or push.",
    { key: keySchema, files: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", properties: { path: { type: "string", description: "Repository-relative file path with forward slashes, for example docs/plans/K-1.md; never an absolute path." }, hash: { type: "string", pattern: "^[a-f0-9]{64}$" } }, required: ["path", "hash"], additionalProperties: false } } }, ["key", "files"]),
  tool("resident_git", roleGitTool.description + " Supply the current item key; paths are absolute regular file paths, never a repository directory. The helper already checked the clean tree and owned branch before this cycle started.",
    { key: keySchema, ...roleGitTool.inputSchema.properties }, ["key", "operation"]),
];
const validKey = key => typeof key === "string" && /^[A-Za-z0-9_-]+$/.test(key);
const digest = value => createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex");

export async function createMainLoopTools(context, operations = {}) {
  const { input, files, session, branch, scratch, fileBroker, commandBroker, guard, lifecycle, signal } = context;
  const runtime = { callTool, listTools, dispatchFreshRole, commitResidentArtifacts, createRoleGit, ...operations };
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

  async function dispatch(args) {
    const owned = await guard({ remote: true });
    let next = await nextFor(args.key), handoff;
    if (next.action === "wait" && next.on === "handoff") {
      handoff = confirmCommitHandoff(input.binding.root, args.key, next, residentGit(input.binding.root, ["rev-parse", "HEAD"]));
      next = { action: "dispatch", ...next.resume };
    }
    if (next.action !== "dispatch") return { event: "waiting", next };
    if (["qa-verifier", "impl-verifier"].includes(next.agent)) throw new Error("Optional verifier requires an explicit foreground handoff");
    if (!next.entry && ["pm", "feature-scout"].includes(next.agent) && !owned.policy.propose) throw new Error("New work is disabled");
    const binding = dispatchBinding(next, input.config.workspaces);
    if (handoff) binding.commitHandoff = handoff;
    if (binding.key) {
      const board = await request("board_get", { key: binding.key });
      binding.planPath = board.planPath; binding.planCommit = board.planCommit;
    }
    if (binding.agent === "plan-verifier") {
      const checks = args.requiredVerificationPaths;
      if (!Array.isArray(checks) || !checks.length || checks.length > 30 || checks.some(value => typeof value !== "string" || !value.trim() || value.length > 2000)
        || !binding.planPath || !binding.planCommit) throw new Error("Independent verification paths and approved plan required");
      binding.requiredVerificationPaths = checks;
    } else if (args.requiredVerificationPaths !== undefined) throw new Error("Only the independent verifier accepts verification paths");
    await guard({ remote: true });
    const result = await runtime.dispatchFreshRole(input, files, session, binding, {
      signal, checkSession: async () => guard({ allowPaused: true }),
      callTool: async (target, name, values, roleSignal) => {
        await guard({ remote: true });
        const value = await runtime.callTool(target, name, values, roleSignal ? AbortSignal.any([signal, roleSignal]) : signal);
        await guard({ allowPaused: true });
        return value;
      },
    });
    await guard({ allowPaused: true });
    return { event: result.event, threadId: result.threadId, done: result.done, receipt: result.receipt?.receipt ?? null, report: result.report };
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
    if (name === "resident_commit") {
      const owned = await guard({ remote: true });
      if (!owned.policy.commit) throw new Error("Commit permission required");
      const next = await nextFor(args.key), board = await request("board_get", { key: args.key });
      await guard({ remote: true });
      return runtime.commitResidentArtifacts({ root: input.binding.root, branch, key: args.key, next, board, workspaces: input.config.workspaces, files: args.files });
    }
    if (name === "resident_git") {
      if (!validKey(args.key)) throw new Error("Safe item key required");
      const board = await request("board_get", { key: args.key });
      const reader = runtime.createRoleGit({ root: input.binding.root, agent: "main-loop", fileBroker,
        backend: commandBroker, planCommit: board.planCommit, commonDirectory: path.dirname(path.dirname(files.lock)) }, lifecycle);
      const { key: _key, ...query } = args;
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
