// owner-deps.ts — OwnerToolDeps의 Prisma 구현 + 소유자 토큰 검증 바인딩. 도구 본문은 owner-tools.ts, 저장 규칙은 pipeline/board.ts.
import "server-only";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import * as board from "@/server/pipeline/board";
import { makeVerifyOwnerToken } from "./auth";
import type { OwnerToolDeps } from "./owner-tools";

export const prismaOwnerToolDeps: OwnerToolDeps = {
  // 세션 채널의 게이트. 화면이 없으므로 CAS 토큰은 방금 읽은 row.updatedAt이다 — 읽기와 쓰기 사이에
  // 보드가 움직였으면 board.gate가 stale로 거부한다(§C.7).
  gate: async (projectId, userId, input) => {
    const row = await board.latestRowFor(projectId, input.key);
    if (!row) return { ok: false as const, reason: `no such board item: ${input.key}` };
    return board.gate(projectId, input, { actor: "human", actorRef: userId, channel: "session", expectedUpdatedAt: row.updatedAt });
  },
  access: (projectId) => projectAccess(projectId),
  // ProjectMember의 복합 키(@@id([projectId, userId]) → projectId_userId). 행이 있으면 멤버다 — role은 묻지 않는다(웹 requireMember와 같다).
  member: async (projectId, userId) =>
    (await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { userId: true } })) !== null,
};

export const verifyOwnerToken = makeVerifyOwnerToken((hash) =>
  prisma.ownerToken.findUnique({ where: { hash }, select: { id: true, projectId: true, userId: true, revokedAt: true } }),
);
