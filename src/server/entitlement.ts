// entitlement.ts — "이 프로젝트는 누구의 플랜을 따르나"의 배선. 판정 규칙(상한·잠김 순서·에이전트 집합)은
// packages/core/entitlement.mjs 하나가 갖고, 여기는 그 함수에 넣을 행을 DB에서 찾아 올 뿐이다.
// 플랜은 사용자에 붙고(Subscription, 행 없음 = free) 프로젝트는 소유자(ProjectMember.role = "owner")의 플랜을 따른다.
import "server-only";
import { DEFAULT_PLAN, activeProjectIds, capReason, isPlan, limitsFor } from "@harness/core/entitlement.mjs";
import { prisma } from "@/server/db";

export type Plan = "free" | "pro" | "max";
export type Limits = ReturnType<typeof limitsFor>;
export type ProjectAccess = { plan: Plan; locked: false } | { plan: Plan; locked: true; reason: string };

export async function planForUser(userId: string): Promise<Plan> {
  const row = await prisma.subscription.findUnique({ where: { userId }, select: { plan: true } });
  // 알 수 없는 값(스크립트 밖에서 손으로 넣은 행)은 free로 본다 — 상한을 잘못 여는 쪽보다 닫는 쪽이 싸다.
  return row && isPlan(row.plan) ? (row.plan as Plan) : DEFAULT_PLAN;
}

async function ownerOf(projectId: string): Promise<string | null> {
  const owner = await prisma.projectMember.findFirst({ where: { projectId, role: "owner" }, select: { userId: true } });
  return owner?.userId ?? null;
}

export async function planForProject(projectId: string): Promise<Plan> {
  const userId = await ownerOf(projectId);
  return userId ? planForUser(userId) : DEFAULT_PLAN;
}

export async function limitsForProject(projectId: string): Promise<Limits> {
  return limitsFor(await planForProject(projectId));
}

// 잠김: 소유자가 가진 프로젝트를 createdAt 순으로 세어 플랜 상한 밖이면 잠긴다. 행은 그대로 — 플랜을 올리면 다시 열린다.
export async function projectAccess(projectId: string): Promise<ProjectAccess> {
  const userId = await ownerOf(projectId);
  if (!userId) return { plan: DEFAULT_PLAN, locked: false };
  const plan = await planForUser(userId);
  const owned = await prisma.projectMember.findMany({
    where: { userId, role: "owner" },
    select: { project: { select: { id: true, createdAt: true } } },
  });
  if (activeProjectIds(owned.map((m) => m.project), plan).has(projectId)) return { plan, locked: false };
  return { plan, locked: true, reason: `${capReason(plan, "projects")}; this project is locked` };
}
