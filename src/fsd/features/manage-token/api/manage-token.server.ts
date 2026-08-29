"use server";
import { revalidatePath } from "next/cache";
import { newToken } from "@harness/core/token.mjs";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";

// 평문은 이 반환값에만 존재한다. 서비스는 sha256 해시만 저장한다.
export async function issueToken(slug: string, label: string): Promise<{ token: string }> {
  const { projectId } = await requireMember(slug);
  const { plain, hash } = newToken();
  await prisma.projectToken.create({ data: { projectId, hash, label: label.trim() || "token" } });
  revalidatePath(`/p/${slug}/tokens`);
  return { token: plain };
}

export async function revokeToken(slug: string, tokenId: string): Promise<void> {
  const { projectId } = await requireMember(slug);
  await prisma.projectToken.updateMany({ where: { id: tokenId, projectId }, data: { revokedAt: new Date() } });
  revalidatePath(`/p/${slug}/tokens`);
}
