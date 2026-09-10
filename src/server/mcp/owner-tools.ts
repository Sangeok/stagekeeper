// owner-tools.ts — 소유자 토큰 스코프의 MCP 도구. 에이전트 서버(tools.ts)와 **다른 엔드포인트**(/api/mcp/owner)에 산다.
// 그쪽 등록 집합은 그대로다 — tools.test.mjs의 WEB_ONLY 가드(불변식 4)가 계속 "게이트 도구 없음"을 단언한다.
// 여기 도구는 `gate_approve` 하나다 — 그래프의 어느 게이트든 연다. 되돌리기·보류·재개·Reopen·폐기·백로그 편집·토큰 발급은 여전히 웹 전용이다.
import { allowsSessionApprovals } from "@harness/core/entitlement.mjs";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ProjectAccess } from "@/server/entitlement";
import type { PipelineNext } from "@/server/pipeline/run-rules";
import type { ServerResult } from "@/server/result";
import { z } from "zod";

export const OWNER_TOOL_NAMES = ["gate_approve"] as const;

export type OwnerToolDeps = {
  // 게이트를 연 뒤의 행과 다음 일(pipeline_next와 같은 모양) — 런북 단계 번호는 없다. 런북에 번호가 없다.
  gate(projectId: string, userId: string, input: { key: string; gate: string; planCommit?: string }): Promise<ServerResult<{ item: { agent: string; status: string }; next: PipelineNext }>>;
  access(projectId: string): Promise<ProjectAccess>;
  // 지금 이 사람이 이 프로젝트의 멤버인가. 토큰 행의 userId는 발급 시점의 사실이라 호출마다 다시 본다 — 웹의 requireMember와 같은 판정.
  member(projectId: string, userId: string): Promise<boolean>;
};

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (reason: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: reason }) }], isError: true });

function scope(ctx: Ctx) {
  const extra = ctx.http?.authInfo?.extra;
  const projectId = extra?.projectId, userId = extra?.userId;
  if (typeof projectId !== "string" || typeof userId !== "string") throw new Error("unauthenticated");
  return { projectId, userId };
}

export function registerOwnerTools(server: McpServer, deps: OwnerToolDeps) {
  server.registerTool("gate_approve", {
    description: "Owner only: open the gate the item is waiting at — pass the gate id from pipeline_next (before-plan, before-implement, before-verify, before-accept, before-doc-audit, before-scout). before-implement needs a validation record and the planCommit from board_get. Returns the item and next — act on next in the same turn. Send back, hold, reopen, and discard stay web only.",
    inputSchema: z.object({ key: z.string(), gate: z.string(), planCommit: z.string().optional() }),
  }, async (args, ctx: Ctx) => {
    const { projectId, userId } = scope(ctx);
    // 인가는 목적지에서, 호출마다. 토큰이 살아 있어도 멤버가 아니면 거부 — 웹 게이트가 requireMember를 매번 부르는 것과 같다.
    if (!(await deps.member(projectId, userId))) return fail("not a member of this project — the owner token no longer opens gates here; revoke it on the Tokens tab");
    // 잠금·플랜은 인증이 아니라 도구 층에서 — tools.ts의 guardLocked와 같은 이유(401은 사유를 못 싣는다).
    const access = await deps.access(projectId);
    if (access.locked) return fail(access.reason);
    if (!allowsSessionApprovals(access.plan)) return fail(`session approvals are not on the ${access.plan} plan — approve in the Inbox, or upgrade the plan`);
    const r = await deps.gate(projectId, userId, args);
    if (!r.ok) return fail(r.reason);
    return text(r.item);
  });
}
