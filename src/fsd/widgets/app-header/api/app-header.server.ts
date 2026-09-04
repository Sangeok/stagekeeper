import "server-only";

import type { PlanId } from "@/fsd/shared/lib/entitlement-copy";
import { prisma } from "@/server/db";
import { planForUser } from "@/server/entitlement";
import type { HeaderProject } from "../ui/app-header";

// 머리가 필요로 하는 값은 머리가 읽는다 — 라우트마다 같은 질의를 되풀이하지 않게.
export async function loadHeaderUser(userId: string): Promise<{ login: string; plan: PlanId }> {
  const [user, plan] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { login: true } }),
    planForUser(userId),
  ]);
  return { ...user, plan };
}

// 프로젝트 전환 목록. 만든 순서가 곧 표시 순서다.
export async function loadHeaderProjects(userId: string): Promise<HeaderProject[]> {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { project: { select: { slug: true, name: true } } },
    orderBy: { project: { createdAt: "asc" } },
  });
  return memberships.map((m) => m.project);
}
