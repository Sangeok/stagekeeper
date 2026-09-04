import { activeProjectIds } from "@harness/core/entitlement.mjs";
import { ProjectListPage } from "@/fsd/pages/project-list";
import { AppHeader } from "@/fsd/widgets/app-header";
import { loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForUser } from "@/server/entitlement";

export default async function Page() {
  const { userId } = await requireUser();
  const [user, members, plan] = await Promise.all([
    loadHeaderUser(userId),
    prisma.projectMember.findMany({
      where: { userId },
      include: { project: { select: { id: true, slug: true, name: true, owner: true, repo: true, createdAt: true } } },
      orderBy: { project: { createdAt: "asc" } },
    }),
    planForUser(userId),
  ]);
  // 잠김은 **소유한** 프로젝트에만 걸린다 — 남의 프로젝트에 멤버로 들어간 행은 그 소유자의 플랜을 따르고
  // 여기서 판단하지 않는다. 활성 집합의 정의(createdAt 오름차순 앞 N개)는 core 하나에 있다.
  const owned = members.filter((m) => m.role === "owner").map((m) => m.project);
  const active = activeProjectIds(owned, plan);
  const isLocked = (m: (typeof members)[number]) => m.role === "owner" && !active.has(m.project.id);
  return (
    <>
      <AppHeader login={user.login} />
      <ProjectListPage projects={members.map((m) => ({ ...m.project, locked: isLocked(m) }))} />
    </>
  );
}
