import { ProjectListPage } from "@/fsd/pages/project-list";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";

export default async function Page() {
  const { userId } = await requireUser();
  const members = await prisma.projectMember.findMany({
    where: { userId },
    include: { project: { select: { slug: true, name: true, owner: true, repo: true } } },
    orderBy: { project: { createdAt: "asc" } },
  });
  return <ProjectListPage projects={members.map((m) => m.project)} />;
}
