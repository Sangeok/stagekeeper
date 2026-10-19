import type { PrismaClient } from "@/generated/prisma/client";

export function findUserTokenByHash(hash: string, db: PrismaClient) {
  return db.userToken.findUnique({ where: { hash }, select: { id: true, revokedAt: true, expiresAt: true, userId: true } });
}
