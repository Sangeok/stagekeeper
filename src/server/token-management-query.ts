import type { Prisma } from "@/generated/prisma/client";
import { AvailabilityConflict, lockProjectOwnerIn, withAvailabilityTransaction } from "./project-availability-service";
import { readProjectAccessIn, type TransactionHost } from "./project-access-query";
import type { ServerResult } from "./result";

type RenameProjectTokenInput = { userId: string; projectId: string; tokenId: string; label: string; kind: "agent" | "owner" };

export async function renameProjectToken(client: TransactionHost, input: RenameProjectTokenInput): Promise<ServerResult<null>> {
  if (typeof input.tokenId !== "string" || !input.tokenId.trim()) return { ok: false, reason: "Token not found." };
  if (typeof input.label !== "string" || !input.label.trim()) return { ok: false, reason: "Enter a token name." };
  try {
    return await withAvailabilityTransaction(client, async (tx): Promise<ServerResult<null>> => {
      await lockProjectOwnerIn(tx, input.userId);
      const project = await tx.project.findFirst({ where: { id: input.projectId, ownerUserId: input.userId }, select: { id: true } });
      if (!project) return { ok: false, reason: "Project not found." };
      const access = await readProjectAccessIn(tx, input.projectId);
      if (!access.available) return { ok: false, reason: access.reason };
      const result = input.kind === "owner"
        ? await tx.ownerToken.updateMany({ where: { id: input.tokenId, projectId: input.projectId, userId: input.userId }, data: { label: input.label.trim() } })
        : await tx.projectToken.updateMany({ where: { id: input.tokenId, projectId: input.projectId }, data: { label: input.label.trim() } });
      return result.count === 1 ? { ok: true, item: null } : { ok: false, reason: "Token not found." };
    });
  } catch (error) {
    if (error instanceof AvailabilityConflict) return { ok: false, reason: error.message };
    throw error;
  }
}

export async function renameUserToken(db: Pick<Prisma.TransactionClient, "userToken">, input: { userId: string; tokenId: string; label: string }): Promise<ServerResult<null>> {
  if (typeof input.tokenId !== "string" || !input.tokenId.trim()) return { ok: false, reason: "Token not found." };
  if (typeof input.label !== "string" || !input.label.trim()) return { ok: false, reason: "Enter a token name." };
  const result = await db.userToken.updateMany({ where: { id: input.tokenId, userId: input.userId }, data: { label: input.label.trim() } });
  return result.count === 1 ? { ok: true, item: null } : { ok: false, reason: "Token not found." };
}
