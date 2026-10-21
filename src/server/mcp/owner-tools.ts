import { allowsSessionApprovals } from "@harness/core/entitlement.mjs";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ProjectAccess } from "@/server/projects/contracts";
import type { PipelineNext } from "@/server/pipeline/contracts";
import type { ServerResult } from "@/server/result";
import { failureBody, type ServerFailure, type RequestRateFailure } from "@/server/result";
import { z } from "zod";

export const OWNER_TOOL_NAMES = ["gate_approve"] as const;

export type OwnerToolDeps = {
  requestLimit(projectId: string): Promise<RequestRateFailure | null>;
  gate(projectId: string, userId: string, input: { key: string; gate: string; planCommit?: string; gateEntry?: { runId: string; entryId: string } }): Promise<ServerResult<{ item: { agent: string; status: string }; next: PipelineNext }>>;
  access(projectId: string): Promise<ProjectAccess>;
  owner(projectId: string, userId: string): Promise<boolean>;
};

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (failure: string | ServerFailure) => ({ content: [{ type: "text" as const, text: JSON.stringify(typeof failure === "string" ? { error: failure } : failureBody(failure)) }], isError: true });

function scope(ctx: Ctx) {
  const extra = ctx.http?.authInfo?.extra;
  const projectId = extra?.projectId, userId = extra?.userId;
  if (typeof projectId !== "string" || typeof userId !== "string") throw new Error("unauthenticated");
  return { projectId, userId };
}

export function registerOwnerTools(server: McpServer, deps: OwnerToolDeps) {
  server.registerTool("gate_approve", {
    description: "Owner only: open the gate the item is waiting at — pass the gate id from pipeline_next (before-plan, before-implement, before-verify, before-accept, before-doc-audit, before-scout). before-implement needs a validation record and the planCommit from board_get. Returns the item and next — act on next in the same turn. Send back, hold, reopen, and discard stay web only. If next advice fails after approval, the error says the gate approval was recorded. Call pipeline_next with the item key; do not retry gate_approve.",
    inputSchema: z.object({ key: z.string(), gate: z.string(), planCommit: z.string().optional(), gateEntry: z.object({ runId: z.string(), entryId: z.string() }).optional() }),
  }, async (args, ctx: Ctx) => {
    const { projectId, userId } = scope(ctx);
    if (!(await deps.owner(projectId, userId))) return fail("not the owner of this project");
    const access = await deps.access(projectId);
    if (!access.available) return fail(access.reason);
    if (!allowsSessionApprovals(access.plan)) return fail(`session approvals are not on the ${access.plan} plan — approve in the Inbox, or upgrade the plan`);
    const limited = await deps.requestLimit(projectId);
    if (limited) return fail(limited);
    const r = await deps.gate(projectId, userId, args);
    if (!r.ok) return fail(r);
    return text(r.item);
  });
}
