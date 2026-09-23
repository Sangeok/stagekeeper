import "server-only";
import { repositoryOwner } from "./project-access-query";
import { prisma } from "@/server/db";
import type { PrismaClient } from "@/generated/prisma/client";

// 저장소 문서 링크를 만들려면 owner·repo·branch가 필요하다. 같은 select를 라우트마다
// 손으로 쓰면 필드가 늘어날 때 한 화면만 고치고 다른 화면의 링크는 낡은 채로 남는다.
// 형은 fsd/entities/board-item의 RepoRef와 구조적으로 같다 — 서버는 FSD를 import할 수 없어
// 타입을 공유하지 않고 모양만 맞춘다.
export async function loadProjectRepository(projectId: string): Promise<{ owner: string; repo: string; branch: string }> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { repoOwner: true, repo: true, branch: true },
  });
  return { owner: repositoryOwner(project.repoOwner), repo: project.repo, branch: project.branch };
}

// 프로젝트의 로스터 — 워크스페이스 에이전트를 wsId 순으로. 순서가 뜻이다: 첫째가 기본 담당자이고
// (propose-button), 라벨은 이 순서로 이어 붙는다(entities/pipeline labels). 클라이언트를 인자로 받는 것은
// createNextDeps(db)가 주입된 클라이언트로 읽어야 하기 때문이다 — 라우트는 prisma를 넘긴다.
export async function loadProjectRoster(db: Pick<PrismaClient, "workspace">, projectId: string): Promise<string[]> {
  const rows = await db.workspace.findMany({ where: { projectId }, orderBy: { wsId: "asc" }, select: { agent: true } });
  return rows.map((w) => w.agent);
}
