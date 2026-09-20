// hu_(사용자 토큰)가 프로젝트를 지목할 때 쓰는 두 조회. MCP(mcp/deps.ts)와 REST 세 경로가
// 같은 술어를 써야 하므로 한 곳에 둔다 — 네 군데에 같은 쿼리를 베끼면 그중 하나가 조용히 갈린다.
import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

// guard.ts:17·owner-deps.ts:19와 같은 술어. 없는 슬러그와 남의 프로젝트를 같은 null로 답한다 —
// 호출부가 그 null을 하나의 문장(NOT_YOURS)으로 바꾸므로 존재 여부가 새지 않는다.
export async function projectForUser(slug: string, userId: string, db: PrismaClient = prisma): Promise<string | null> {
  const row = await db.project.findFirst({ where: { slug, ownerUserId: userId }, select: { id: true } });
  return row?.id ?? null;
}

// 평문은 어디에도 저장하지 않는다 — 해시로만 찾는다(projectToken·ownerToken과 같은 규약).
// id까지 싣는다: MCP 검증기는 그 값을 tokenId·clientId로 쓰고(auth.ts), REST는 쓰지 않는다.
// 남는 열 하나가 두 벌의 쿼리보다 낫다 — 갈릴 자리가 없어진다.
export function findUserTokenByHash(hash: string, db: PrismaClient = prisma) {
  return db.userToken.findUnique({ where: { hash }, select: { id: true, revokedAt: true, userId: true } });
}
