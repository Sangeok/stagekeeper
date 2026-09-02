import "server-only";
import { prisma } from "@/server/db";

// 저장소 문서 링크를 만들려면 owner·repo·branch가 필요하다. 같은 select를 라우트마다
// 손으로 쓰면 필드가 늘어날 때 한 화면만 고치고 다른 화면의 링크는 낡은 채로 남는다.
// 형은 fsd/entities/board-item의 RepoRef와 구조적으로 같다 — 서버는 FSD를 import할 수 없어
// 타입을 공유하지 않고 모양만 맞춘다.
export async function loadRepoRef(projectId: string): Promise<{ owner: string; repo: string; branch: string }> {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { owner: true, repo: true, branch: true },
  });
}
