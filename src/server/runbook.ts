// DB 연결은 서버 전용으로 유지하고, 인증·검증 흐름은 runbook-query.ts에서 DB 없이 검증한다
// (templates.ts와 같은 갈래).
import "server-only";
import { RUNBOOK_TEMPLATE, isRunbookVersion, runbookIsStale } from "@harness/core/runbook.mjs";
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
//
// reported = 부르는 세션이 자기 CLAUDE.md에서 읽어 넘긴 판. 모양이 맞으면 그것으로만 판정한다 — 저장값은
// "마지막으로 init한 곳"의 판이라 브랜치마다 다른 CLAUDE.md를 가리지 못한다. 넘겨받은 판은 저장하지 않는다:
// 브랜치마다 다를 수 있는 값을 프로젝트 하나에 쓰면 같은 문제가 다시 생긴다. 없거나 모양이 틀리면
// 판을 적지 않은 옛 런북의 세션이므로 저장값으로 판정한다(docs/proposals/active/init-any-branch.md C-3).
export async function runbookStale(projectId: string, db: PrismaClient = prisma, reported?: string): Promise<boolean> {
  const rows = await db.template.findMany({ where: { path: RUNBOOK_TEMPLATE }, select: { body: true } });
  const bodies = rows.map((row) => row.body);
  if (isRunbookVersion(reported)) return runbookIsStale(reported, bodies);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { runbookVersion: true } });
  return runbookIsStale(project?.runbookVersion ?? null, bodies);
}
