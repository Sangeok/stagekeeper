// DB 연결은 서버 전용으로 유지하고, 인증·접근·조회 흐름은 templates-query.ts에서 DB 없이 검증한다.
import "server-only";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { makeTemplatesFor } from "./templates-query";

export type { TemplateResult } from "./templates-query";

export const templatesFor = makeTemplatesFor({
  findTokenByHash: (hash) => prisma.projectToken.findUnique({
    where: { hash },
    select: { revokedAt: true, projectId: true },
  }),
  projectAccess,
  findTemplatesByLanguage: (language) => prisma.template.findMany({
    where: { lang: language },
    select: { path: true, body: true },
  }),
});
