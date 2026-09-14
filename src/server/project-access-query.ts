import { DEFAULT_PLAN, isPlan } from "@harness/core/entitlement.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type Plan = "free" | "pro" | "max";
export type ProjectAccess =
  | { plan: Plan; available: true }
  | { plan: Plan; available: false; code: "not-selected" | "integrity"; reason: string };
export const NOT_SELECTED_REASON = "This project is not selected for use. Open Stagekeeper → Projects and choose “Use this project”.";
export const OWNERSHIP_UNAVAILABLE_REASON = "Project ownership is unavailable.";
export const READ_OPTIONS = { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30000 } as const;
export type TransactionHost = Pick<PrismaClient, "$transaction">;

export function normalizePlan(value: unknown): Plan {
  return isPlan(value) ? value as Plan : DEFAULT_PLAN;
}

export class ProjectIntegrityError extends Error {
  constructor() { super(OWNERSHIP_UNAVAILABLE_REASON); this.name = "ProjectIntegrityError"; }
}

export function repositoryOwner(value: string | null): string {
  if (value === null) throw new ProjectIntegrityError();
  return value;
}

async function readProjectFactsIn(db: Prisma.TransactionClient, projectId: string) {
  return db.project.findUnique({
    where: { id: projectId },
    select: { ownerUserId: true, repoOwner: true, available: true, ownerUser: { select: { subscription: { select: { plan: true } } } } },
  });
}

export async function readProjectPlanIn(db: Prisma.TransactionClient, projectId: string): Promise<Plan> {
  const project = await readProjectFactsIn(db, projectId);
  if (!project?.ownerUserId || !project.ownerUser || project.repoOwner === null) throw new ProjectIntegrityError();
  return normalizePlan(project.ownerUser.subscription?.plan);
}

export async function readProjectAccess(client: TransactionHost, projectId: string): Promise<ProjectAccess> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const project = await readProjectFactsIn(tx, projectId);
    if (!project?.ownerUserId || !project.ownerUser || project.repoOwner === null) {
      return { plan: DEFAULT_PLAN, available: false, code: "integrity", reason: OWNERSHIP_UNAVAILABLE_REASON };
    }
    const plan = normalizePlan(project.ownerUser.subscription?.plan);
    return project.available ? { plan, available: true } : { plan, available: false, code: "not-selected", reason: NOT_SELECTED_REASON };
  }, READ_OPTIONS);
}
