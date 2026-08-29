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
  submitPlan(projectId: string, input: { key: string; path: string; commit: string }): Promise<ToolResult<unknown>>;
  submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }): Promise<ToolResult<unknown>>;
  recordValidation(projectId: string, input: { key: string; text: string }): Promise<ToolResult<unknown>>;
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
  server.registerTool("project_get", { description: "프로젝트·roster·워크스페이스", inputSchema: z.object({}) }, async (_a, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.projectGet(projectId));
  });
  server.registerTool("project_sync", { description: "harness.json.workspaces를 서비스에 반영(roster 갱신)", inputSchema: z.object({ workspaces: z.array(workspace) }) }, async ({ workspaces }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text({ synced: await deps.projectSync(projectId, workspaces) });
  });
  server.registerTool("backlog_list", { description: "백로그 항목 + 최신 보드 status", inputSchema: z.object({ includeRemoved: z.boolean().optional() }) }, async ({ includeRemoved }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.backlogList(projectId, includeRemoved === true));
  });
  server.registerTool("backlog_get", { description: "항목 1건(source 전문)", inputSchema: z.object({ key: z.string() }) }, async ({ key }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    const item = await deps.backlogGet(projectId, key);
    return item ? text(item) : fail(`no such item: ${key}`);
  });
  server.registerTool("board_list", { description: "항목별 최신 보드 행", inputSchema: z.object({ open: z.boolean().optional() }) }, async ({ open }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.boardList(projectId, open === true));
  });
  server.registerTool("board_get", { description: "최신 보드 행 + 전이 이벤트 + 보고", inputSchema: z.object({ key: z.string() }) }, async ({ key }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    const row = await deps.boardGet(projectId, key);
    return row ? text(row) : fail(`no such board item: ${key}`);
  });
  server.registerTool("board_propose", { description: "pm: 승인대기 행 생성. 거부: 미결 2건·roster 밖·근거 150자 초과·이미 미결", inputSchema: z.object({ key: z.string(), agent: z.string(), reason: z.string() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.propose(projectId, args, actorRef));
  });
  server.registerTool("board_transition", { description: "에이전트 전이: 계획지시→검토대기(plan_submit 선행) · 구현승인→완료(report_submit 선행) · →보류(result 필수). 게이트는 없다", inputSchema: z.object({ key: z.string(), to: z.string(), result: z.string().optional() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.transition(projectId, args, actorRef));
  });
  server.registerTool("plan_submit", { description: "계획서 위치 기록(계획지시에서만)", inputSchema: z.object({ key: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return unwrap(await deps.submitPlan(projectId, args));
  });
  server.registerTool("report_submit", { description: "행위자 기록 위치(docs/agents/<actor>/<ID>.md)", inputSchema: z.object({ key: z.string(), actor: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return unwrap(await deps.submitReport(projectId, args));
  });
  server.registerTool("validation_record", { description: "main-loop: 검증 클린 패스 기록(검토대기에서만, 150자)", inputSchema: z.object({ key: z.string(), text: z.string() }) }, async (args, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return unwrap(await deps.recordValidation(projectId, args));
  });
}
