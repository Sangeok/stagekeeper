// owner-deps.ts — OwnerToolDeps의 Prisma 구현 + 소유자 토큰 검증 바인딩. 도구 본문은 owner-tools.ts, 저장 규칙은 pipeline/board.ts.
import "server-only";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import * as board from "@/server/pipeline/board";
import { makeVerifyOwnerToken } from "./auth";
import type { OwnerToolDeps } from "./owner-tools";

export const prismaOwnerToolDeps: OwnerToolDeps = {
  gate: (projectId, userId, input) => board.sessionGate(projectId, input, userId),
  access: (projectId) => projectAccess(projectId),
  // ProjectMember의 복합 키(@@id([projectId, userId]) → projectId_userId). 행이 있으면 멤버다 — role은 묻지 않는다(웹 requireMember와 같다).
  member: async (projectId, userId) =>
    (await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { userId: true } })) !== null,
};

export const verifyOwnerToken = makeVerifyOwnerToken((hash) =>
  prisma.ownerToken.findUnique({ where: { hash }, select: { id: true, projectId: true, userId: true, revokedAt: true } }),
);
