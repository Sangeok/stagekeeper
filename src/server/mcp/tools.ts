// 에이전트 토큰 스코프의 MCP 도구. 스펙 §5가 계약이다.
// 게이트·반려·백로그 편집·토큰 발급 도구는 여기 없다(D8) — 웹 전용이며 등록 자체가 없다.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

export const AGENT_TOOL_NAMES = [
  "project_get", "project_sync", "backlog_list", "backlog_get", "board_list", "board_get",
  "board_propose", "board_transition", "plan_submit", "report_submit", "validation_record",
] as const;

export type ToolResult<T> = { ok: true; item: T } | { ok: false; reason: string };
export type WorkspaceInput = { id: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] };

export type ToolDeps = {
  projectGet(projectId: string): Promise<unknown>;
  projectSync(projectId: string, workspaces: WorkspaceInput[]): Promise<number>;
  backlogList(projectId: string, includeRemoved: boolean): Promise<unknown>;
  backlogGet(projectId: string, key: string): Promise<unknown | null>;
  boardList(projectId: string, open: boolean): Promise<unknown>;
  boardGet(projectId: string, key: string): Promise<unknown | null>;
  propose(projectId: string, input: { key: string; agent: string; reason: string }, actorRef: string): Promise<ToolResult<unknown>>;
  transition(projectId: string, input: { key: string; to: string; result?: string }, actorRef: string): Promise<ToolResult<unknown>>;
  submitPlan(projectId: string, input: { key: string; path: string; commit: string }, actorRef: string): Promise<ToolResult<unknown>>;
  submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }, actorRef: string): Promise<ToolResult<unknown>>;
  recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string): Promise<ToolResult<unknown>>;
};

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (reason: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: reason }) }], isError: true });
const unwrap = <T,>(r: ToolResult<T>) => (r.ok ? text(r.item) : fail(r.reason));

function scope(ctx: Ctx) {
  const extra = ctx.http?.authInfo?.extra;
  const projectId = extra?.projectId, tokenId = extra?.tokenId;
  if (typeof projectId !== "string" || typeof tokenId !== "string") throw new Error("unauthenticated");
  return { projectId, actorRef: `token:${tokenId}` };
}

const workspace = z.object({ id: z.string(), path: z.string(), agent: z.string(), verify: z.array(z.string()), knowledge: z.string().nullable(), readOnly: z.array(z.string()) });

export function registerTools(server: McpServer, deps: ToolDeps) {
  // inputSchema를 비워서라도 넣는다 — 콜백 인자 형이 항상 (args, ctx)로 고정된다.
  server.registerTool("project_get", { description: "Project, roster, and workspaces.", inputSchema: z.object({}) }, async (_a, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.projectGet(projectId));
  });
  server.registerTool("project_sync", { description: "Push harness.json.workspaces to the service. Updates the roster.", inputSchema: z.object({ workspaces: z.array(workspace) }) }, async ({ workspaces }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text({ synced: await deps.projectSync(projectId, workspaces) });
  });
  server.registerTool("backlog_list", { description: "Backlog items with each item's latest board status.", inputSchema: z.object({ includeRemoved: z.boolean().optional() }) }, async ({ includeRemoved }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.backlogList(projectId, includeRemoved === true));
  });
  server.registerTool("backlog_get", { description: "One backlog item, full evidence.", inputSchema: z.object({ key: z.string() }) }, async ({ key }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    const item = await deps.backlogGet(projectId, key);
    return item ? text(item) : fail(`no such item: ${key}`);
  });
  server.registerTool("board_list", { description: "Latest board item per backlog item. open: true → only open ones.", inputSchema: z.object({ open: z.boolean().optional() }) }, async ({ open }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.boardList(projectId, open === true));
  });
  server.registerTool("board_get", { description: "Latest board item with its transition history and reports.", inputSchema: z.object({ key: z.string() }) }, async ({ key }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    const row = await deps.boardGet(projectId, key);
    return row ? text(row) : fail(`no such board item: ${key}`);
  });
  server.registerTool("board_propose", { description: "pm: create a proposed item. Rejected when 2 items are already open, the agent isn't in the roster, the reason is over 150 characters, or the key is already open.", inputSchema: z.object({ key: z.string(), agent: z.string(), reason: z.string() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.propose(projectId, args, actorRef));
  });
  server.registerTool("board_transition", { description: "Agent transitions only: planning → in_review (after plan_submit), implementing → done (after report_submit), → on_hold (result required). Gates are not here.", inputSchema: z.object({ key: z.string(), to: z.string(), result: z.string().optional() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.transition(projectId, args, actorRef));
  });
  server.registerTool("plan_submit", { description: "Record where the plan is (path and commit). Only in planning or in_review — re-call after review edits so the approved commit is recorded.", inputSchema: z.object({ key: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.submitPlan(projectId, args, actorRef));
  });
  server.registerTool("report_submit", { description: "Record where an actor's report is (docs/agents/<actor>/<KEY>.md, commit). Only in in_review, implementing, or done.", inputSchema: z.object({ key: z.string(), actor: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.submitReport(projectId, args, actorRef));
  });
  server.registerTool("validation_record", { description: "main-loop: record a clean validation pass. Only in in_review, 150 characters or fewer.", inputSchema: z.object({ key: z.string(), text: z.string() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.recordValidation(projectId, args, actorRef));
  });
}
