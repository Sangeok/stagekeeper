// 에이전트 토큰 스코프의 MCP 도구. 스펙 §5가 계약이다.
// 게이트·반려·백로그 편집·토큰 발급 도구는 여기 없다(D8) — 웹 전용이며 등록 자체가 없다.
import type { McpServer } from "@modelcontextprotocol/server";
import { NOTE_MAX, OUTCOMES, REVISION_MAX, type NextInput, type NextOutput } from "@/server/agents/next";
import type { ProjectAccess } from "@/server/entitlement";
import type { ServerResult } from "@/server/result";
import { NOT_YOURS, PROJECT_REQUIRED } from "@/server/scope-copy";
import { validateWorkspaceSemantics } from "@harness/core/workspaces.mjs";
import type { BacklogView, BacklogWithStatusView } from "./views";
export type { BacklogView, BacklogWithStatusView } from "./views";
import { z } from "zod";

export const AGENT_TOOL_NAMES = [
  "project_get", "project_sync", "backlog_list", "backlog_get", "board_list", "board_get",
  "board_propose", "board_transition", "plan_submit", "report_submit", "validation_record", "agent_next", "pipeline_next",
] as const;

export type WorkspaceInput = { id: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] };

// 에이전트가 JSON으로 받는 최소 계약. Prisma 행은 이보다 넓고, 넓은 쪽은 좁은 쪽에 대입된다 —
// 그래서 여기에 적힌 필드가 board.ts의 select/include에서 빠지면 deps.ts가 컴파일에서 걸린다.
// 예전에는 전부 unknown이라, 쿼리에서 필드가 사라져도 타입은 아무 말이 없고 프로토콜만 조용히
// 깨졌다. Prisma 타입을 직접 import하지 않는 건 inbox-item.ts의 BoardRow와 같은 이유다.
export type ProjectView = {
  id: string; slug: string; name: string; owner: string; repo: string; branch: string; language: string;
  executorKind: string; commandIssue: number | null; runbookVersion: string | null; createdAt: Date;
  workspaces: { id: string; projectId: string; wsId: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] }[];
};
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
  submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string; runId?: string }, actorRef: string): Promise<ServerResult<unknown>>;
  recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string): Promise<ServerResult<unknown>>;
  // userScoped는 한도 집계의 분모에만 쓴다(A-10) — hu_는 한 토큰이 여러 프로젝트에 걸친다.
  agentNext(projectId: string, tokenId: string, input: NextInput, userScoped: boolean): Promise<ServerResult<NextOutput>>;
  // §D.1 — 런 보장 → 지연 전진(board.advancePipeline) → run.nextFor. key 없음이면 { head, items }.
  // runbook = 부르는 세션의 CLAUDE.md에 적힌 판. key 없는 개요의 표류 판정에만 쓴다(runbook.ts runbookStale).
  pipelineNext(projectId: string, key: string | undefined, runbook?: string): Promise<ServerResult<unknown>>;
  access(projectId: string): Promise<ProjectAccess>;
  // hu_ 전용. 슬러그가 그 사용자의 프로젝트일 때만 id를 준다 — guard.ts:17·owner-deps.ts:19와 같은 쿼리.
  projectFor(slug: string, userId: string): Promise<string | null>;
};

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (reason: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: reason }) }], isError: true });
const unwrap = <T,>(r: ServerResult<T>) => (r.ok ? text(r.item) : fail(r.reason));

// 인증은 유지해야 project_get으로 복구 방법을 안내할 수 있다.
const guardUnavailable = async (deps: ToolDeps, projectId: string) => {
  const access = await deps.access(projectId);
  return !access.available ? fail(access.reason) : null;
};

// 거부 문구는 product-copy.md §12가 단일 출처이고, 코드 쪽 출처는 scope-copy.ts다 —
// REST 세 경로(rest-scope.ts)가 같은 판정에 같은 문장을 쓴다. 여기서 다시 내보내는 것은
// 이 모듈에서 가져다 쓰던 호출자를 그대로 두기 위해서다.
export { NOT_YOURS, PROJECT_REQUIRED };

type Scoped =
  | { ok: true; projectId: string; tokenId: string; actorRef: string; userScoped: boolean }
  | { ok: false; reason: string };

// 프로젝트를 정하는 유일한 자리. hs_는 토큰이 알고(기존 경로 — 분기의 첫 가지라 동작이 그대로다),
// hu_는 인자로 받아 호출마다 ownerUserId로 인가한다(owner-tools.ts:38과 같은 판정).
// **미인증은 계속 throw한다** — 주체가 아예 없다는 뜻이고 tools.test.mjs가 그걸 단언한다.
// "내 것이 아니다"는 throw가 아니라 fail()이다: 섞으면 남의 프로젝트가 500이 된다.
async function scope(args: { project?: unknown }, ctx: Ctx, deps: ToolDeps): Promise<Scoped> {
  const extra = ctx.http?.authInfo?.extra;
  const tokenId = extra?.tokenId;
  if (typeof tokenId !== "string") throw new Error("unauthenticated");
  if (typeof extra?.projectId === "string") {
    return { ok: true, projectId: extra.projectId, tokenId, actorRef: `token:${tokenId}`, userScoped: false };
  }
  if (typeof extra?.userId !== "string") throw new Error("unauthenticated");
  if (typeof args?.project !== "string") return { ok: false, reason: PROJECT_REQUIRED };
  const projectId = await deps.projectFor(args.project, extra.userId);
  if (projectId === null) return { ok: false, reason: NOT_YOURS };
  return { ok: true, projectId, tokenId, actorRef: `token:${tokenId}`, userScoped: true };
}

const workspace = z.object({ id: z.string(), path: z.string(), agent: z.string(), verify: z.array(z.string()), knowledge: z.string().nullable(), readOnly: z.array(z.string()) });

// hu_가 프로젝트를 지목하는 자리. hs_는 토큰이 알고 있으므로 optional이다 — 기존 호출이 그대로 통한다.
const project = { project: z.string().optional() };

export function registerTools(server: McpServer, deps: ToolDeps) {
  // inputSchema를 비워서라도 넣는다 — 콜백 인자 형이 항상 (args, ctx)로 고정된다.
  server.registerTool("project_get", { description: "Project, roster, and workspaces.", inputSchema: z.object({ ...project }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    // 선택되지 않은 프로젝트에서도 답한다 — 401이 사유를 못 실으므로 사유를 알 수 있는 유일한 창구다.
    const access = await deps.access(projectId);
    if (!access.available && access.code === "integrity") return fail(access.reason);
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
  server.registerTool("board_propose", { description: "pm: create a proposed item. Rejected when 2 items are already open, the agent isn't in the roster, the reason is over 150 characters, or the key is already open.", inputSchema: z.object({ ...project, key: z.string(), agent: z.string(), reason: z.string() }) }, async (args, ctx: Ctx) => {
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
  server.registerTool("plan_submit", { description: "Record where the plan is (path and commit) and move the item to in_review, in one transaction. Only in planning or in_review — re-call after review edits so the approved commit is recorded; a re-call from in_review records the commit and moves nothing.", inputSchema: z.object({ ...project, key: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId, actorRef } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.submitPlan(projectId, args, actorRef));
  });
  server.registerTool("report_submit", { description: "Record where an actor's report is (docs/agents/<actor>/<KEY>.md, commit). Only in in_review, implementing, or done. In done, a main-loop report is the acceptance record.", inputSchema: z.object({ ...project, key: z.string(), actor: z.string(), path: z.string(), commit: z.string(), runId: z.string().optional() }) }, async (args, ctx: Ctx) => {
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
  // 단계 본문은 이 도구로만 나간다(agents/next.ts). 스텁이 "첫 호출은 agent_next"라고 말하는 그 도구다.
  // §D.1 pipeline_next — 항목 하나(key) 또는 열린 항목 전부의 다음 일. 지연 전진을 하므로 선택되지 않은 프로젝트에서는 guardUnavailable로 거부한다.
  server.registerTool("pipeline_next", { description: "Next thing to do — for one item (key) or for every open item (no key): dispatch an agent, wait at a gate, accept, or done. Advances the pipeline cursor where the graph allows. Without a key the answer also carries a runbook field when the runbook version you pass (or, without one, the version the last init reported) is older than the current template.", inputSchema: z.object({ ...project, key: z.string().optional(), runbook: z.string().optional() }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    // runbook의 모양은 여기서 재지 않는다 — 틀린 값 때문에 호출 자체가 실패하면 안 된다. 판정 쪽이 무시한다.
    return unwrap(await deps.pipelineNext(projectId, args.key, args.runbook));
  });
  server.registerTool("agent_next", { description: "Your next step. Call without outcome to (re)read the current step; with outcome ok | blocked | failed to finish it and get the next one, or handoff to record a commit handoff and stay on the step. Every outcome requires the receipt { runId, revision, stepId } returned with the current step. Send it unchanged; stale receipts require a fresh read without outcome. Repeat until done: true. A refusal says which board state opens the step.", inputSchema: z.object({ agent: z.string(), key: z.string().optional(), entry: z.object({ runId: z.string().min(1), entryId: z.string().min(1), slotId: z.string().min(1) }).optional(), agentRunId: z.string().optional(), stepId: z.string().optional(), outcome: z.enum(OUTCOMES).optional(), note: z.string().max(NOTE_MAX).optional(), receipt: z.object({ runId: z.string().min(1), revision: z.number().int().min(0).max(REVISION_MAX), stepId: z.string().min(1) }).optional(), ...project }) }, async (args, ctx: Ctx) => {
    const s = await scope(args, ctx, deps);
    if (!s.ok) return fail(s.reason);
    const { projectId, tokenId, userScoped } = s;
    const unavailable = await guardUnavailable(deps, projectId);
    if (unavailable) return unavailable;
    return unwrap(await deps.agentNext(projectId, tokenId, args, userScoped));
  });
}
