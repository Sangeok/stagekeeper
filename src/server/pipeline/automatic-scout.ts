import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { slotAgent } from "@harness/core/pipeline/pipeline.mjs";
import { readProjectAccessIn } from "@/server/projects/api";
import type { ServerResult } from "@/server/result";

type ScoutSettingInput = { projectId: string; userId: string; enabled: boolean };

export async function hasActiveLegacyScoutSlot(db: Prisma.TransactionClient, projectId: string): Promise<boolean> {
  const items = await db.boardItem.findMany({
    where: { projectId, discardedAt: null }, distinct: ["backlogItemId"], orderBy: { proposedOn: "desc" },
    select: { status: true, run: { select: { node: true, closedAt: true, version: { select: { format: true } } } } },
  });
  return items.some(({ status, run }) => status !== "on_hold" && run !== null && run.closedAt === null
    && run.version.format === null && slotAgent(run.node) === "feature-scout");
}

export async function setAutomaticScout(client: PrismaClient, input: ScoutSettingInput): Promise<ServerResult<boolean>> {
  if (typeof input.enabled !== "boolean") return { ok: false, reason: "Choose whether automatic scouting is on or off." };
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
    const project = await tx.project.findUnique({ where: { id: input.projectId }, select: { ownerUserId: true } });
    if (project?.ownerUserId !== input.userId) return { ok: false, reason: "Project not found." };
    const access = await readProjectAccessIn(tx, input.projectId);
    if (!access.available) return { ok: false, reason: access.reason };
    await tx.project.update({ where: { id: input.projectId }, data: { autoScoutEnabled: input.enabled } });
    if (!input.enabled && !await hasActiveLegacyScoutSlot(tx, input.projectId)) {
      await tx.agentRun.updateMany({
        where: { projectId: input.projectId, agent: "feature-scout", key: null, pipelineRunId: null, pipelineEntryId: null, closedAt: null },
        data: { closedAt: new Date() },
      });
    }
    return { ok: true, item: input.enabled };
  }, { timeout: 15_000 });
}
