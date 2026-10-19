import type { PrismaClient } from "@/generated/prisma/client";

export async function projectForUser(slug: string, userId: string, db: PrismaClient): Promise<string | null> {
  const row = await db.project.findFirst({ where: { slug, ownerUserId: userId }, select: { id: true } });
  return row?.id ?? null;
}
