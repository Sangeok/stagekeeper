import "server-only";
import { recordTokenUsage } from "@/server/tokens/api.server";
import { limitProjectRequest } from "@/server/usage/api.server";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import { findUserTokenByHash } from "@/server/tokens/api.server";
import { projectForUser } from "@/server/projects/api.server";
import { makeRecordRunbook } from "./runbook-handler";
import { readTemplateChannelMode, readTemplateDelivery } from "@/server/templates/api";

export const recordRunbook = makeRecordRunbook({
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
  saveRunbookVersion: async (projectId, version) => {
    await prisma.project.update({ where: { id: projectId }, data: { runbookVersion: version } });
  },
});
