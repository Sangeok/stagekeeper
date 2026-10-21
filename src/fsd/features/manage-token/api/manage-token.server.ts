"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { issueProjectToken, issueProjectOwnerToken } from "@/server/tokens/api.server";
import { renameProjectToken } from "@/server/tokens/api";

export async function issueToken(slug: string, label: string, expiresAt: string | null = null): Promise<ActionResult<{ token: string }>> {
  const { projectId, userId } = await requireProjectOwner(slug);
  const result = await issueProjectToken({ projectId, userId, label, expiresAt });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug, "/tokens"));
  return success(result.item);
}

export async function revokeToken(slug: string, tokenId: string): Promise<void> {
  const { projectId } = await requireProjectOwner(slug);
  if (typeof tokenId !== "string" || !tokenId.trim()) throw new Error("Invalid token ID.");
  await prisma.projectToken.updateMany({ where: { id: tokenId, projectId }, data: { revokedAt: new Date() } });
  revalidatePath(projectPath(slug, "/tokens"));
}

export async function issueOwnerToken(slug: string, label: string, expiresAt: string | null = null): Promise<ActionResult<{ token: string }>> {
  const { projectId, userId } = await requireProjectOwner(slug);
  const result = await issueProjectOwnerToken({ projectId, userId, label, expiresAt });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug, "/tokens"));
  return success(result.item);
}

export async function revokeOwnerToken(slug: string, tokenId: string): Promise<void> {
  const { projectId, userId } = await requireProjectOwner(slug);
  if (typeof tokenId !== "string" || !tokenId.trim()) throw new Error("Invalid token ID.");
  await prisma.ownerToken.updateMany({ where: { id: tokenId, projectId, userId }, data: { revokedAt: new Date() } });
  revalidatePath(projectPath(slug, "/tokens"));
}

export async function renameToken(slug: string, tokenId: string, label: string): Promise<ActionResult<null>> {
  const { projectId, userId } = await requireProjectOwner(slug);
  if (typeof tokenId !== "string" || !tokenId.trim()) return failure("Token not found.");
  const result = await renameProjectToken(prisma, { userId, projectId, tokenId, label, kind: "agent" });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug, "/tokens"));
  return success(null);
}

export async function renameOwnerToken(slug: string, tokenId: string, label: string): Promise<ActionResult<null>> {
  const { projectId, userId } = await requireProjectOwner(slug);
  if (typeof tokenId !== "string" || !tokenId.trim()) return failure("Token not found.");
  const result = await renameProjectToken(prisma, { userId, projectId, tokenId, label, kind: "owner" });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug, "/tokens"));
  return success(null);
}
