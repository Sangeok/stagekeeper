// DB 연결은 서버 전용으로 유지하고, 인증·접근·조회 흐름은 project-identity-query.ts에서 DB 없이 검증한다.
import "server-only";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { findUserTokenByHash, projectForUser } from "@/server/user-scope-query";
import { makeProjectIdentityFor } from "./project-identity-query";

export type { ProjectIdentity, ProjectIdentityResult } from "./project-identity-query";

export const projectIdentityFor = makeProjectIdentityFor({
  findTokenByHash: (hash) => prisma.projectToken.findUnique({
    where: { hash },
    select: { revokedAt: true, projectId: true },
  }),
  // hu_ 갈래. 이 둘을 주지 않으면 hu_는 존재하지 않는 것처럼 거부된다(rest-scope.ts).
  findUserTokenByHash,
  projectFor: projectForUser,
  projectAccess,
  // 정체에 필요한 다섯 열만 읽는다 — PROJECT_GET_SELECT(project-query.ts)는 workspaces까지 읽는다.
  // readProjectFactsIn의 select를 넓히지 않는 이유: 그 함수는 planForProject와 게이트 판정이 공유한다.
  findProjectIdentity: (projectId) => prisma.project.findUnique({
    where: { id: projectId },
    select: { repoOwner: true, repo: true, branch: true, name: true, slug: true },
  }),
});
