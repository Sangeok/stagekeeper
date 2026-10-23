import "server-only";

import type { Plan } from "@harness/core/plans/entitlement.mjs";
import { prisma } from "@/server/db";
import { planForUser } from "@/server/projects/api.server";
import type { HeaderProject } from "../ui/app-header";

export async function loadHeaderUser(userId: string): Promise<{ login: string; plan: Plan }> {
  const [user, plan] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { login: true } }),
    planForUser(userId),
  ]);
  return { login: user.login, plan };
}

export async function loadHeaderProjects(userId: string): Promise<HeaderProject[]> {
  return prisma.project.findMany({ where: { ownerUserId: userId, disconnectedAt: null }, select: { slug: true, name: true }, orderBy: { createdAt: "asc" } });
}
