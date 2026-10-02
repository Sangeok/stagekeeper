import { allowsSessionApprovals, OWNER_TOKEN_PLAN_GATE } from "@harness/core/entitlement.mjs";
import { newToken } from "@harness/core/token.mjs";
import { parseTokenExpiry } from "@harness/core/token-validity.mjs";
import { readProjectAccessIn, type TransactionHost } from "./project-access-query";
import { AvailabilityConflict, lockProjectOwnerIn, withAvailabilityTransaction } from "./project-availability-service";
import type { ServerResult } from "./result";

export type IssueProjectTokenInput = { userId: string; projectId: string; label: string; expiresAt?: string | null };

export async function issueProjectToken(client: TransactionHost, input: IssueProjectTokenInput): Promise<ServerResult<{ token: string }>> {
  return issue(client, input, "agent");
}

export async function issueProjectOwnerToken(client: TransactionHost, input: IssueProjectTokenInput): Promise<ServerResult<{ token: string }>> {
  return issue(client, input, "owner");
}

async function issue(client: TransactionHost, input: IssueProjectTokenInput, kind: "agent" | "owner"): Promise<ServerResult<{ token: string }>> {
  if (typeof input.userId !== "string" || !input.userId.trim() || typeof input.projectId !== "string" || !input.projectId.trim() || typeof input.label !== "string") {
    return { ok: false, reason: "Invalid project token request." };
  }
  try {
    return await withAvailabilityTransaction(client, async (tx): Promise<ServerResult<{ token: string }>> => {
      await lockProjectOwnerIn(tx, input.userId);
      const project = await tx.project.findFirst({ where: { id: input.projectId, ownerUserId: input.userId }, select: { id: true } });
      if (!project) return { ok: false, reason: "Project not found." };
      const access = await readProjectAccessIn(tx, project.id);
      if (!access.available) return { ok: false, reason: access.reason };
      if (kind === "owner" && !allowsSessionApprovals(access.plan)) return { ok: false, reason: OWNER_TOKEN_PLAN_GATE };
      const at = new Date();
      let expiresAt: Date | null;
      try { expiresAt = parseTokenExpiry(input.expiresAt, at); }
      catch { return { ok: false, reason: "Choose a future expiry in UTC, or leave it blank for no expiry." }; }
      const { plain, hash } = newToken(kind);
      const data = { projectId: project.id, hash, label: input.label.trim() || (kind === "owner" ? "session" : "token"), usageTrackingStartedAt: at, expiresAt };
      if (kind === "owner") await tx.ownerToken.create({ data: { ...data, userId: input.userId } });
      else await tx.projectToken.create({ data });
      return { ok: true, item: { token: plain } };
    });
  } catch (error) {
    if (error instanceof AvailabilityConflict) return { ok: false, reason: error.message };
    throw error;
  }
}
