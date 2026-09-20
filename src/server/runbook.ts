// DB 연결은 서버 전용으로 유지하고, 인증·검증 흐름은 runbook-query.ts에서 DB 없이 검증한다
// (templates.ts와 같은 갈래).
import "server-only";
import { RUNBOOK_TEMPLATE, runbookIsStale } from "@harness/core/runbook.mjs";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { findUserTokenByHash, projectForUser } from "@/server/user-scope-query";
import { makeRecordRunbook } from "./runbook-query";

export type { RunbookResult } from "./runbook-query";

export const recordRunbook = makeRecordRunbook({
  findTokenByHash: (hash) => prisma.projectToken.findUnique({
    where: { hash },
    select: { revokedAt: true, projectId: true },
  }),
  // hu_ 갈래. 이 둘을 주지 않으면 hu_는 존재하지 않는 것처럼 거부된다(rest-scope.ts).
  findUserTokenByHash,
  projectFor: projectForUser,
  projectAccess,
  saveRunbookVersion: async (projectId, version) => {
    await prisma.project.update({ where: { id: projectId }, data: { runbookVersion: version } });
  },
});

// 이 프로젝트의 저장소에 심긴 런북이 낡았는가. 판정 자체는 packages/core에 있다.
// 언어별 행을 전부 읽는다 — 어느 언어의 현재 원문과도 안 맞으면 낡은 것이다(언어를 저장하지 않는 이유).
export async function runbookStale(projectId: string, db: PrismaClient = prisma): Promise<boolean> {
  const [project, rows] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { runbookVersion: true } }),
    db.template.findMany({ where: { path: RUNBOOK_TEMPLATE }, select: { body: true } }),
  ]);
  return runbookIsStale(project?.runbookVersion ?? null, rows.map((row) => row.body));
}
