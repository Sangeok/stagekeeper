import "server-only";
import { prisma } from "@/server/db";
import { normalizePlan, readProjectAccess, readProjectPlanIn, READ_OPTIONS, type Plan, type ProjectAccess } from "./project-access-query";

export type { Plan, ProjectAccess } from "./project-access-query";

export async function planForUser(userId: string): Promise<Plan> {
  const row = await prisma.subscription.findUnique({ where: { userId }, select: { plan: true } });
  return normalizePlan(row?.plan);
}

export async function planForProject(projectId: string): Promise<Plan> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return readProjectPlanIn(tx, projectId);
  }, READ_OPTIONS);
}

export async function projectAccess(projectId: string): Promise<ProjectAccess> {
  const access = await readProjectAccess(prisma, projectId);
  if (!access.available) console.info(`project-availability:${access.code}`, { projectId });
  return access;
}
