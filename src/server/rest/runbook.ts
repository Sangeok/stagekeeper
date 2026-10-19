// DB 연결은 서버 전용으로 유지하고, 인증·검증 흐름은 runbook-handler.ts에서 DB 없이 검증한다
// (templates.ts와 같은 갈래).
import "server-only";
import { recordTokenUsage } from "@/server/tokens/api.server";
import { limitProjectRequest } from "@/server/usage/api.server";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import { findUserTokenByHash } from "@/server/tokens/api.server";
import { projectForUser } from "@/server/projects/api.server";
import { makeRecordRunbook } from "./runbook-handler";

export const recordRunbook = makeRecordRunbook({
  requestLimit: limitProjectRequest,
  findTokenByHash: (hash) => prisma.projectToken.findUnique({
    where: { hash },
    select: { id: true, revokedAt: true, expiresAt: true, projectId: true },
  }),
  // hu_ 갈래. 이 둘을 주지 않으면 hu_는 존재하지 않는 것처럼 거부된다(rest/scope.ts).
  findUserTokenByHash,
  recordTokenUsage,
  projectFor: projectForUser,
  projectAccess,
  saveRunbookVersion: async (projectId, version) => {
    await prisma.project.update({ where: { id: projectId }, data: { runbookVersion: version } });
  },
});
