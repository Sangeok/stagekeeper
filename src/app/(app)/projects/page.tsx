import { ProjectListPage } from "@/fsd/pages/project-list";
import { AppHeader } from "@/fsd/widgets/app-header";
import { loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";

export default async function Page() {
  const { userId } = await requireUser();
  const [user, members] = await Promise.all([
    loadHeaderUser(userId),
    prisma.projectMember.findMany({
      where: { userId },
      include: { project: { select: { slug: true, name: true, owner: true, repo: true } } },
      orderBy: { project: { createdAt: "asc" } },
    }),
  ]);
  return (
    <>
      <AppHeader login={user.login} />
      <ProjectListPage projects={members.map((m) => m.project)} />
    </>
  );
}
