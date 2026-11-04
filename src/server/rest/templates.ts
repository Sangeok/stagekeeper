import "server-only";
import { recordTokenUsage } from "@/server/tokens/api.server";
import { limitProjectRequest } from "@/server/usage/api.server";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import { findUserTokenByHash } from "@/server/tokens/api.server";
import { projectForUser } from "@/server/projects/api.server";
import { makeTemplatesFor } from "./templates-handler";
import { readTemplateChannelMode, readTemplateDelivery } from "@/server/templates/api";

export const templatesFor = makeTemplatesFor({
  templateMode: () => readTemplateChannelMode(prisma),
  readRelease: input => readTemplateDelivery(prisma, input),
  requestLimit: limitProjectRequest,
  findTokenByHash: (hash) => prisma.projectToken.findUnique({
    where: { hash },
    select: { id: true, revokedAt: true, expiresAt: true, projectId: true },
  }),
  findUserTokenByHash,
  recordTokenUsage,
  projectFor: projectForUser,
  projectAccess,
  findTemplatesByLanguage: (language) => prisma.template.findMany({
    where: { lang: language },
    select: { path: true, body: true },
  }),
});
