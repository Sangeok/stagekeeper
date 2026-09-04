// 에이전트 토큰 스코프의 MCP 도구. 스펙 §5가 계약이다.
// 게이트·반려·백로그 편집·토큰 발급 도구는 여기 없다(D8) — 웹 전용이며 등록 자체가 없다.
import type { McpServer } from "@modelcontextprotocol/server";
import { NOTE_MAX, OUTCOMES, type NextInput, type NextOutput } from "@/server/agents/next";
import type { ProjectAccess } from "@/server/entitlement";
import type { ServerResult } from "@/server/result";
import { z } from "zod";

export const AGENT_TOOL_NAMES = [
  "project_get", "project_sync", "backlog_list", "backlog_get", "board_list", "board_get",
  "board_propose", "board_transition", "plan_submit", "report_submit", "validation_record", "agent_next",
] as const;

export type WorkspaceInput = { id: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] };

// 에이전트가 JSON으로 받는 최소 계약. Prisma 행은 이보다 넓고, 넓은 쪽은 좁은 쪽에 대입된다 —
// 그래서 여기에 적힌 필드가 board.ts의 select/include에서 빠지면 deps.ts가 컴파일에서 걸린다.
// 예전에는 전부 unknown이라, 쿼리에서 필드가 사라져도 타입은 아무 말이 없고 프로토콜만 조용히
// 깨졌다. Prisma 타입을 직접 import하지 않는 건 inbox-item.ts의 BoardRow와 같은 이유다.
export type ProjectView = {
  id: string; slug: string; name: string; owner: string; repo: string; branch: string; language: string;
  workspaces: { wsId: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] }[];
};
export type BacklogView = { id: string; key: string; title: string; area: string; source: string; removedAt: Date | null };
export type BacklogWithStatusView = BacklogView & { status: string | null };
// board_propose는 방금 만든 행만 돌려준다 — backlogItem을 include하지 않는다(board.ts propose).
export type BoardItemView = {
  id: string; agent: string; status: string; reason: string; results: string[]; validation: string | null;
  planPath: string | null; planCommit: string | null; proposedOn: Date; updatedAt: Date;
};
export type BoardRowView = BoardItemView & { backlogItem: { key: string; title: string; area: string } };
export type BoardDetailView = BoardRowView & {
  events: { from: string | null; to: string | null; actor: string; actorId: string | null; note: string | null; at: Date }[];
  reports: { actor: string; path: string; commit: string; at: Date }[];
};

export type ToolDeps = {
  projectGet(projectId: string): Promise<ProjectView>;
  projectSync(projectId: string, workspaces: WorkspaceInput[], language?: string): Promise<ServerResult<number>>;
  backlogList(projectId: string, includeRemoved: boolean): Promise<BacklogWithStatusView[]>;
  backlogGet(projectId: string, key: string): Promise<BacklogView | null>;
  boardList(projectId: string, open: boolean): Promise<BoardRowView[]>;
  boardGet(projectId: string, key: string): Promise<BoardDetailView | null>;
  propose(projectId: string, input: { key: string; agent: string; reason: string }, actorRef: string): Promise<ServerResult<BoardItemView>>;
  transition(projectId: string, input: { key: string; to: string; result?: string }, actorRef: string): Promise<ServerResult<unknown>>;
  submitPlan(projectId: string, input: { key: string; path: string; commit: string }, actorRef: string): Promise<ServerResult<unknown>>;
  submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }, actorRef: string): Promise<ServerResult<unknown>>;
  recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string): Promise<ServerResult<unknown>>;
  agentNext(projectId: string, tokenId: string, input: NextInput): Promise<ServerResult<NextOutput>>;
  access(projectId: string): Promise<ProjectAccess>;
};

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (reason: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: reason }) }], isError: true });
const unwrap = <T,>(r: ServerResult<T>) => (r.ok ? text(r.item) : fail(r.reason));

// 잠긴 프로젝트의 벽. **인증에서 막지 않는다** — mcp-handler 2.1.1의 withMcpAuth는 verifyToken이
// 던진 오류를 삼키고 "Invalid token"으로, undefined면 "No authorization provided"로 바꾼다(2026-09-04 실측,
// dist/index.js:155-163). 401에 사유를 실을 채널이 없어서, 인증에서 잠그면 에이전트는 이유도 모르고
// project_get으로 물어볼 수도 없다. 그래서 인증은 통과시키고 여기서 사유와 함께 거부한다 —
// 읽기(project_get·backlog·board)는 열어 두고 상태를 바꾸는 도구만 막는다.
const guardLocked = async (deps: ToolDeps, projectId: string) => {
  const access = await deps.access(projectId);
  return access.locked ? fail(access.reason) : null;
};

function scope(ctx: Ctx) {
  const extra = ctx.http?.authInfo?.extra;
  const projectId = extra?.projectId, tokenId = extra?.tokenId;
  if (typeof projectId !== "string" || typeof tokenId !== "string") throw new Error("unauthenticated");
  return { projectId, tokenId, actorRef: `token:${tokenId}` };
}

const workspace = z.object({ id: z.string(), path: z.string(), agent: z.string(), verify: z.array(z.string()), knowledge: z.string().nullable(), readOnly: z.array(z.string()) });

export function registerTools(server: McpServer, deps: ToolDeps) {
  // inputSchema를 비워서라도 넣는다 — 콜백 인자 형이 항상 (args, ctx)로 고정된다.
  server.registerTool("project_get", { description: "Project, roster, and workspaces.", inputSchema: z.object({}) }, async (_a, ctx: Ctx) => {
    const { projectId } = scope(ctx);
    // 잠긴 프로젝트에서도 답한다 — 401이 사유를 못 실으므로 사유를 알 수 있는 유일한 창구다.
    const access = await deps.access(projectId);
    const project = await deps.projectGet(projectId);
    return text(access.locked ? { ...project, locked: true, reason: access.reason } : project);
  });
  server.registerTool("project_sync", { description: "Push harness.json.workspaces (and language) to the service. Updates the roster; agent_next serves steps in that language.", inputSchema: z.object({ workspaces: z.array(workspace), language: z.string().optional() }) }, async ({ workspaces, language }, ctx: Ctx) => {
    const { projectId } = scope(ctx);
    const locked = await guardLocked(deps, projectId);
    if (locked) return locked;
    const synced = await deps.projectSync(projectId, workspaces, language);
    return synced.ok ? text({ synced: synced.item }) : fail(synced.reason);
  });
  server.registerTool("backlog_list", { description: "Backlog items with each item's latest board status.", inputSchema: z.object({ includeRemoved: z.boolean().optional() }) }, async ({ includeRemoved }, ctx: Ctx) => {
    const { projectId } = scope(ctx);
    return text(await deps.backlogList(projectId, includeRemoved === true));
  });
  server.registerTool("backlog_get", { description: "One backlog item, full evidence.", inputSchema: z.object({ key: z.string() }) }, async ({ key }, ctx: Ctx) => {
    const { projectId } = scope(ctx);
    const item = await deps.backlogGet(projectId, key);
    return item ? text(item) : fail(`no such item: ${key}`);
  });
  server.registerTool("board_list", { description: "Latest board item per backlog item. open: true → only open ones.", inputSchema: z.object({ open: z.boolean().optional() }) }, async ({ open }, ctx: Ctx) => {
    const { projectId } = scope(ctx);
    return text(await deps.boardList(projectId, open === true));
  });
  server.registerTool("board_get", { description: "Latest board item with its transition history and reports.", inputSchema: z.object({ key: z.string() }) }, async ({ key }, ctx: Ctx) => {
    const { projectId } = scope(ctx);
    const row = await deps.boardGet(projectId, key);
    return row ? text(row) : fail(`no such board item: ${key}`);
  });
  server.registerTool("board_propose", { description: "pm: create a proposed item. Rejected when 2 items are already open, the agent isn't in the roster, the reason is over 150 characters, or the key is already open.", inputSchema: z.object({ key: z.string(), agent: z.string(), reason: z.string() }) }, async (args, ctx: Ctx) => {
    const { projectId, actorRef } = scope(ctx);
    const locked = await guardLocked(deps, projectId);
    if (locked) return locked;
    return unwrap(await deps.propose(projectId, args, actorRef));
  });
  server.registerTool("board_transition", { description: "Agent transitions only: planning → in_review (after plan_submit), implementing → done (after report_submit), → on_hold (result required). Gates are not here.", inputSchema: z.object({ key: z.string(), to: z.string(), result: z.string().optional() }) }, async (args, ctx: Ctx) => {
    const { projectId, actorRef } = scope(ctx);
    const locked = await guardLocked(deps, projectId);
    if (locked) return locked;
    return unwrap(await deps.transition(projectId, args, actorRef));
  });
  server.registerTool("plan_submit", { description: "Record where the plan is (path and commit). Only in planning or in_review — re-call after review edits so the approved commit is recorded.", inputSchema: z.object({ key: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx: Ctx) => {
    const { projectId, actorRef } = scope(ctx);
    const locked = await guardLocked(deps, projectId);
    if (locked) return locked;
    return unwrap(await deps.submitPlan(projectId, args, actorRef));
  });
  server.registerTool("report_submit", { description: "Record where an actor's report is (docs/agents/<actor>/<KEY>.md, commit). Only in in_review, implementing, or done.", inputSchema: z.object({ key: z.string(), actor: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx: Ctx) => {
    const { projectId, actorRef } = scope(ctx);
    const locked = await guardLocked(deps, projectId);
    if (locked) return locked;
    return unwrap(await deps.submitReport(projectId, args, actorRef));
  });
  server.registerTool("validation_record", { description: "main-loop: record a clean validation pass. Only in in_review, 150 characters or fewer.", inputSchema: z.object({ key: z.string(), text: z.string() }) }, async (args, ctx: Ctx) => {
    const { projectId, actorRef } = scope(ctx);
    const locked = await guardLocked(deps, projectId);
    if (locked) return locked;
    return unwrap(await deps.recordValidation(projectId, args, actorRef));
  });
  // 단계 본문은 이 도구로만 나간다(agents/next.ts). 스텁이 "첫 호출은 agent_next"라고 말하는 그 도구다.
  server.registerTool("agent_next", { description: "Your next step. Call without outcome to (re)read the current step; with outcome ok | blocked | failed to finish it and get the next one. Repeat until done: true. A refusal says which board state opens the step.", inputSchema: z.object({ agent: z.string(), key: z.string().optional(), outcome: z.enum(OUTCOMES).optional(), note: z.string().max(NOTE_MAX).optional() }) }, async (args, ctx: Ctx) => {
    const { projectId, tokenId } = scope(ctx);
    return unwrap(await deps.agentNext(projectId, tokenId, args));
  });
}
