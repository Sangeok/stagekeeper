import "server-only";
import { recordTokenUsage } from "@/server/tokens/api.server";
import { limitProjectRequest } from "@/server/usage/api.server";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import { findUserTokenByHash } from "@/server/tokens/api.server";
import { projectForUser } from "@/server/projects/api.server";
import { runRunnerOp } from "@/server/runners/api.server";
import { makeRunnerRequest } from "./runner-handler";

export const runnerRequest = makeRunnerRequest({
  requestLimit: limitProjectRequest,
  findTokenByHash: (hash) => prisma.projectToken.findUnique({
    where: { hash },
    select: { id: true, revokedAt: true, expiresAt: true, projectId: true },
  }),
  findUserTokenByHash,
  recordTokenUsage,
  projectFor: projectForUser,
  projectAccess,
  runnerOp: runRunnerOp,
});
