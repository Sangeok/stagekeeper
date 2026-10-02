import { usageSnapshot } from "@harness/core/usage-window.mjs";
import type { Prisma } from "@/generated/prisma/client";
import { normalizePlan, READ_OPTIONS, type Plan, type TransactionHost } from "./project-access-query";
import type { UsageLimitFailure } from "./result";
import { readDatabaseClockIn } from "./database-clock";

export type AccountUsage =
  | { kind: "limited"; percent: number; resetAt: string | null }
  | { kind: "unlimited" }
  | { kind: "unavailable" };
export type AccountUsageSnapshot = { plan: Plan; usage: AccountUsage };

export async function readAccountUsageIn(tx: Prisma.TransactionClient, userId: string, at?: Date): Promise<ReturnType<typeof usageSnapshot> & { plan: Plan }> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: {
    usageWindowStartedAt: true, usageRunCount: true, subscription: { select: { plan: true } },
  } });
  const plan = normalizePlan(user.subscription?.plan);
  return { ...usageSnapshot(plan, user.usageWindowStartedAt, user.usageRunCount, at ?? await readDatabaseClockIn(tx)), plan };
}

export function usageLimitFailure(snapshot: ReturnType<typeof usageSnapshot>): UsageLimitFailure | null {
  if (!snapshot.reached) return null;
  if (snapshot.resetAt === null) throw new Error("Usage reset unavailable");
  const resetAt = snapshot.resetAt.toISOString();
  return { ok: false, code: "USAGE_LIMIT_REACHED", resetAt, reason: `Usage limit reached. New runs are available at ${resetAt}.` };
}

export async function readProjectUsageCapIn(tx: Prisma.TransactionClient, projectId: string): Promise<UsageLimitFailure | null> {
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerUserId: true } });
  return usageLimitFailure(await readAccountUsageIn(tx, project.ownerUserId));
}

export async function readAccountUsage(client: TransactionHost, userId: string): Promise<AccountUsageSnapshot> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const snapshot = await readAccountUsageIn(tx, userId);
    return { plan: snapshot.plan, usage: snapshot.percent === null
      ? { kind: "unlimited" }
      : { kind: "limited", percent: snapshot.percent, resetAt: snapshot.resetAt?.toISOString() ?? null } };
  }, READ_OPTIONS);
}
