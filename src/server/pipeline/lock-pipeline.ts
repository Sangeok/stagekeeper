import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { Plan } from "@harness/core/entitlement.mjs";
import { allowsPipelineEdit, PIPELINE_EDIT_PLAN_GATE } from "@harness/core/pipeline.mjs";
import { readProjectAccessIn } from "@/server/projects/api";

export class PipelineRejection extends Error {}

export function rethrowPipelineConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010") {
    const adapter = error.meta?.driverAdapterError;
    const cause = adapter !== null && typeof adapter === "object" && "cause" in adapter ? adapter.cause : undefined;
    const sqlState = cause !== null && typeof cause === "object" && "originalCode" in cause ? cause.originalCode : error.meta?.code;
    if (sqlState === "40001" || sqlState === "40P01") {
      throw new Prisma.PrismaClientKnownRequestError(error.message, { code: "P2034", clientVersion: error.clientVersion, meta: error.meta });
    }
  }
  throw error;
}

export type PipelineWriteContext = {
  tx: Prisma.TransactionClient;
  projectId: string;
  ownerUserId: string;
  plan: Plan;
};

export async function withPipelineWrite<Result>(
  client: PrismaClient,
  projectId: string,
  userId: string | undefined,
  work: (context: PipelineWriteContext) => Promise<Result>,
): Promise<Result> {
  return client.$transaction(async (tx) => {
    const initial = await tx.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true } });
    if (!initial) throw new PipelineRejection("Project not found.");
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${initial.ownerUserId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true } });
    if (!project || project.ownerUserId !== initial.ownerUserId || (userId !== undefined && project.ownerUserId !== userId)) {
      throw new PipelineRejection("Project not found.");
    }
    const access = await readProjectAccessIn(tx, projectId);
    if (!access.available) throw new PipelineRejection(access.reason);
    return work({ tx, projectId, ownerUserId: project.ownerUserId, plan: access.plan });
  }, { timeout: 15_000 });
}

export function requirePipelineEdit(plan: Plan): void {
  if (!allowsPipelineEdit(plan)) throw new PipelineRejection(PIPELINE_EDIT_PLAN_GATE);
}
