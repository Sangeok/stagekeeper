import "server-only";
import { recordTokenUsage } from "@/server/tokens/api.server";
import { limitProjectRequest } from "@/server/usage/api.server";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import * as board from "@/server/pipeline/api.server";
import { nextFor } from "@/server/pipeline/api";
import { makeVerifyOwnerToken } from "./auth";
import { createOwnerGate } from "./owner-gate";
import type { OwnerToolDeps } from "./owner-tools";

export const prismaOwnerToolDeps: OwnerToolDeps = {
  requestLimit: limitProjectRequest,
  gate: createOwnerGate({ latestRow: board.latestRowFor, gate: board.gate, advice: (projectId, key) => nextFor(prisma, projectId, key) }),
  access: (projectId) => projectAccess(projectId),
  owner: async (projectId, userId) =>
    (await prisma.project.findFirst({ where: { id: projectId, ownerUserId: userId }, select: { id: true } })) !== null,
};

export const verifyOwnerToken = makeVerifyOwnerToken((hash) =>
  prisma.ownerToken.findUnique({ where: { hash }, select: { id: true, projectId: true, userId: true, revokedAt: true, expiresAt: true } }),
  recordTokenUsage,
);
