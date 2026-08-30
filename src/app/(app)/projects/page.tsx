import { ProjectListPage } from "@/fsd/pages/project-list";
import { AppHeader } from "@/fsd/widgets/app-header";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";

export default async function Page() {
  const { userId } = await requireUser();
  const [user, members] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { login: true } }),
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
