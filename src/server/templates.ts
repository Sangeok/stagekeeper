// DB 연결은 서버 전용으로 유지하고, 인증·접근·조회 흐름은 templates-query.ts에서 DB 없이 검증한다.
import "server-only";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { findUserTokenByHash, projectForUser } from "@/server/user-scope-query";
import { makeTemplatesFor } from "./templates-query";

export type { TemplateResult } from "./templates-query";

export const templatesFor = makeTemplatesFor({
  findTokenByHash: (hash) => prisma.projectToken.findUnique({
    where: { hash },
    select: { revokedAt: true, projectId: true },
  }),
  // hu_ 갈래. 이 둘을 주지 않으면 hu_는 존재하지 않는 것처럼 거부된다(rest-scope.ts).
  findUserTokenByHash,
  projectFor: projectForUser,
  projectAccess,
  findTemplatesByLanguage: (language) => prisma.template.findMany({
    where: { lang: language },
    select: { path: true, body: true },
  }),
});
