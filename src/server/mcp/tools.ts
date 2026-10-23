import type { McpServer } from "@modelcontextprotocol/server";
import { NOTE_MAX, OUTCOMES, receiptSchema } from "@/server/agents/api";
import { type NextInput, type NextOutput } from "@/server/agents/contracts";
import type { Client } from "@harness/core/client-runtime.mjs";
import type { ProjectAccess } from "@/server/projects/contracts";
import type { ServerResult, ServerFailure, RequestRateFailure } from "@/server/result";
import { failureBody } from "@/server/result";
import { NOT_YOURS, PROJECT_REQUIRED } from "@/server/projects/api";
import { ITEM_TYPES } from "@harness/core/backlog.mjs";
import { validateWorkspaceSemantics } from "@harness/core/workspaces.mjs";
import type { BacklogView, BacklogWithStatusView } from "./views";
import { z } from "zod";

export const AGENT_TOOL_NAMES = [
  "project_get", "project_sync", "backlog_list", "backlog_get", "backlog_add", "board_list", "board_get",
  "board_propose", "board_transition", "plan_submit", "report_submit", "validation_record", "agent_next", "pipeline_next", "acceptance_fail",
] as const;

import type { WorkspaceInput } from "@/server/projects/contracts";

export type ProjectView = {
  id: string; slug: string; name: string; owner: string; repo: string; branch: string; language: string;
  executorKind: string; commandIssue: number | null; runbookVersion: string | null; createdAt: Date;
  workspaces: { id: string; projectId: string; wsId: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] }[];
};
export type BoardItemView = {
  id: string; agent: string; status: string; reason: string; results: string[]; validation: string | null;
  planPath: string | null; planCommit: string | null; proposedOn: Date; updatedAt: Date;
};
export type BoardRowView = BoardItemView & { backlogItem: { key: string; title: string; area: string; type: string | null } };
export type BoardDetailView = BoardRowView & {
  events: { from: string | null; to: string | null; actor: string; actorId: string | null; note: string | null; at: Date }[];
  reports: { actor: string; path: string; commit: string; at: Date }[];
  acceptanceFailures: { checks: number[]; note: string; path: string | null; commit: string | null; at: Date }[];
};

export type ToolDeps = {
  requestLimit(projectId: string): Promise<RequestRateFailure | null>;
  projectGet(projectId: string): Promise<ProjectView>;
  projectSync(projectId: string, workspaces: WorkspaceInput[], language?: string): Promise<ServerResult<number>>;
  backlogAdd(projectId: string, input: { runId: string; title: string; area: string; source: string; type: string }): Promise<ServerResult<{ key: string }>>;
  backlogList(projectId: string, includeRemoved: boolean): Promise<BacklogWithStatusView[]>;
  backlogGet(projectId: string, key: string): Promise<BacklogView | null>;
  boardList(projectId: string, open: boolean): Promise<BoardRowView[]>;
  boardGet(projectId: string, key: string): Promise<BoardDetailView | null>;
  propose(projectId: string, input: { key: string; agent: string; reason: string }, actorRef: string): Promise<ServerResult<BoardItemView>>;
  transition(projectId: string, input: { key: string; to: string; result?: string }, actorRef: string): Promise<ServerResult<unknown>>;
  submitPlan(projectId: string, input: { key: string; path: string; commit: string; type?: string }, actorRef: string): Promise<ServerResult<unknown>>;
  submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string; runId?: string; qa?: unknown }, actorRef: string): Promise<ServerResult<unknown>>;
  failAcceptance(projectId: string, input: { key: string; checks: number[]; note: string; path?: string; commit?: string }, actorRef: string): Promise<ServerResult<unknown>>;
  recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string): Promise<ServerResult<unknown>>;
  agentNext(projectId: string, tokenId: string, input: NextInput): Promise<ServerResult<NextOutput>>;
  pipelineNext(projectId: string, key: string | undefined, runbook?: string, client?: Client): Promise<ServerResult<unknown>>;
  access(projectId: string): Promise<ProjectAccess>;
  projectFor(slug: string, userId: string): Promise<string | null>;
};

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (failure: string | ServerFailure) => ({ content: [{ type: "text" as const, text: JSON.stringify(
  typeof failure === "string" ? { error: failure } : failureBody(failure),
) }], isError: true });
const unwrap = <T,>(r: ServerResult<T>) => (r.ok ? text(r.item) : fail(r));

const guardUnavailable = async (deps: ToolDeps, projectId: string) => {
  const access = await deps.access(projectId);
  if (!access.available) return fail(access.reason);
  const limited = await deps.requestLimit(projectId);
  return limited ? fail(limited) : null;
};

export { PROJECT_REQUIRED };

type Scoped =
  | { ok: true; projectId: string; tokenId: string; actorRef: string }
  | { ok: false; reason: string };

async function scope(args: { project?: unknown }, ctx: Ctx, deps: ToolDeps): Promise<Scoped> {
  const extra = ctx.http?.authInfo?.extra;
  const tokenId = extra?.tokenId;
  if (typeof tokenId !== "string") throw new Error("unauthenticated");
  if (typeof extra?.projectId === "string") {
    return { ok: true, projectId: extra.projectId, tokenId, actorRef: `token:${tokenId}` };
  }
  if (typeof extra?.userId !== "string") throw new Error("unauthenticated");
  if (typeof args?.project !== "string") return { ok: false, reason: PROJECT_REQUIRED };
  const projectId = await deps.projectFor(args.project, extra.userId);
  if (projectId === null) return { ok: false, reason: NOT_YOURS };
  return { ok: true, projectId, tokenId, actorRef: `token:${tokenId}` };
}

const workspace = z.object({ id: z.string(), path: z.string(), agent: z.string(), verify: z.array(z.string()), knowledge: z.string().nullable(), readOnly: z.array(z.string()) });

const project = { project: z.string().optional().describe("Project slug from harness.json project.slug. Required on every call with a user token (hu_); ignored for a project token (hs_). Keep the same project on resume and outcome calls.") };

export function registerTools(server: McpServer, deps: ToolDeps) {
  server.registerTool("project_get", { description: "Project, roster, and workspaces.", inputSchema: z.object({ ...project }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    const access = await deps.access(projectId);
    if (!access.available && access.code !== "not-selected") return fail(access.reason);
    const limited = await deps.requestLimit(projectId);
    if (limited) return fail(limited);
    const project = await deps.projectGet(projectId);
    return text(access.available ? { ...project, available: true } : { ...project, available: false, reason: access.reason });
  });
  server.registerTool("project_sync", { description: "Push harness.json.workspaces (and language) to the service. Updates the roster; agent_next serves steps in that language.", inputSchema: z.object({ ...project, workspaces: z.array(workspace), language: z.string().optional() }) }, async (args, ctx: Ctx) => {
    const { workspaces, language } = args;
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    try { validateWorkspaceSemantics(workspaces); } catch (error) { return fail(error instanceof Error ? error.message : "invalid workspaces"); }
    const synced = await deps.projectSync(projectId, workspaces, language);
    return synced.ok ? text({ synced: synced.item }) : fail(synced.reason);
  });
  server.registerTool("backlog_add", {
    description: "feature-scout: add one backlog item you have evidence for. The server assigns the key (ITEM-NN). Pass runId = the runId of the receipt your current agent_next step returned. At most 3 per run, and never an item the owner removed or discarded (backlog_list includeRemoved shows them). After a failed or timed-out call, check backlog_list before calling again.",
    inputSchema: z.object({ ...project, runId: z.string().min(1), title: z.string().min(1), area: z.string().min(1), source: z.string().min(1), type: z.enum(ITEM_TYPES) }),
  }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const unavailable = await guardUnavailable(deps, s.projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.backlogAdd(s.projectId, args));
  });
  server.registerTool("backlog_list", { description: "Backlog items with each item's latest board status.", inputSchema: z.object({ ...project, includeRemoved: z.boolean().optional() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return text(await deps.backlogList(projectId, args.includeRemoved === true));
  });
  server.registerTool("backlog_get", { description: "One backlog item, full evidence.", inputSchema: z.object({ ...project, key: z.string() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    const item = await deps.backlogGet(projectId, args.key);
    return item ? text(item) : fail(`no such item: ${args.key}`);
  });
  server.registerTool("board_list", { description: "Latest board item per backlog item. open: true → only open ones.", inputSchema: z.object({ ...project, open: z.boolean().optional() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return text(await deps.boardList(projectId, args.open === true));
  });
  server.registerTool("board_get", { description: "Latest board item with its transition history and reports.", inputSchema: z.object({ ...project, key: z.string() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    const row = await deps.boardGet(projectId, args.key);
    return row ? text(row) : fail(`no such board item: ${args.key}`);
  });
  server.registerTool("board_propose", { description: "pm: create a proposed item. Rejected when 2 items are already open, the agent isn't in the roster, the reason is over 150 characters, the key is already open, or the key is on hold (only the owner resumes it, on the web).", inputSchema: z.object({ ...project, key: z.string(), agent: z.string(), reason: z.string() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId, actorRef } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.propose(projectId, args, actorRef));
  });
  server.registerTool("board_transition", { description: "Agent transitions only: planning or implementing → on_hold (result required). Implementation completion belongs to the pipeline. plan_submit already crosses planning → in_review, so that call is no longer needed; asking for the status the item is already in succeeds without recording anything. Gates are not here.", inputSchema: z.object({ ...project, key: z.string(), to: z.string(), result: z.string().optional() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId, actorRef } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.transition(projectId, args, actorRef));
  });
  server.registerTool("plan_submit", { description: "Record where the plan is (path and commit) and move the item to in_review, in one transaction. Only in planning or in_review — re-call after review edits so the approved commit is recorded; a re-call from in_review records the commit and moves nothing. Optional type (feat, fix, refactor, docs) fills an empty type or revises an agent-set type; an owner-set type is preserved (typeKept: owner when it differs).", inputSchema: z.object({ ...project, key: z.string(), path: z.string(), commit: z.string(), type: z.enum(ITEM_TYPES).optional() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId, actorRef } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.submitPlan(projectId, args, actorRef));
  });
  server.registerTool("report_submit", { description: "Record where an actor's report is (docs/agents/<actor>/<KEY>.md, commit). QA additionally requires runId and qa {verdict, targetCommit, baseUrl, scenarios:[{id,status,expected,actual,evidence:[]}]}. impl-verifier additionally requires runId. Only in in_review, implementing, or done. In done, a main-loop report is the acceptance record.", inputSchema: z.object({ ...project, key: z.string(), actor: z.string(), path: z.string(), commit: z.string(), runId: z.string().optional(), qa: z.unknown().optional() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId, actorRef } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.submitReport(projectId, args, actorRef));
  });
  server.registerTool("validation_record", { description: "main-loop: record a clean validation pass. Only in in_review, 150 characters or fewer, and only after a plan-verifier pass is on record for the current plan.", inputSchema: z.object({ ...project, key: z.string(), text: z.string() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId, actorRef } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.recordValidation(projectId, args, actorRef));
  });
  server.registerTool("acceptance_fail", {
    description: "main-loop: record a failed acceptance at the accept node — the failed checks (1–5, the runbook's five acceptance checks) and a note of 150 characters or fewer; a committed write-up's path and commit are optional, together. The item then waits for the owner, who runs acceptance again or reopens it on the item page. Don't run the checks again until pipeline_next answers accept.",
    inputSchema: z.object({ ...project, key: z.string(), checks: z.array(z.number().int().min(1).max(5)).min(1).max(5), note: z.string(), path: z.string().optional(), commit: z.string().optional() }),
  }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const unavailable = await guardUnavailable(deps, s.projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.failAcceptance(s.projectId, args, s.actorRef));
  });
  server.registerTool("pipeline_next", { description: "Next thing to do — for one item (key) or for every open item (no key): dispatch an agent, wait at a gate or for the owner (including failed acceptance), accept, or done. Advances the pipeline cursor where the graph allows. Without a key the answer also carries a runbook field when the runbook version you pass (or, without one, the version the last init reported) is older than the current template.", inputSchema: z.object({ ...project, client: z.enum(["claude", "codex"]).optional(), key: z.string().optional(), runbook: z.string().optional() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.pipelineNext(projectId, args.key, args.runbook, args.client));
  });
  server.registerTool("agent_next", { description: "Your next step. Call without outcome to (re)read the current step; with outcome ok | blocked | failed to finish it and get the next one, or handoff to record a commit handoff and stay on the step. Every outcome requires the receipt { runId, revision, stepId } returned with the current step. Send it unchanged; stale receipts require a fresh read without outcome. Repeat until done: true. A refusal says which board state opens the step.", inputSchema: z.object({ agent: z.string(), client: z.enum(["claude", "codex"]).optional(), key: z.string().optional(), entry: z.object({ runId: z.string().min(1), entryId: z.string().min(1), slotId: z.string().min(1) }).optional(), agentRunId: z.string().optional(), stepId: z.string().optional(), outcome: z.enum(OUTCOMES).optional(), note: z.string().max(NOTE_MAX).optional(), receipt: receiptSchema.optional(), ...project }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId, tokenId } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.agentNext(projectId, tokenId, args));
  });
}
