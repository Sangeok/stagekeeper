import { toBoardSections } from "@/fsd/entities/board-item";
import { ProjectBoardPage, buildBriefing } from "@/fsd/pages/project-board";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";

export default async function Page({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);

  const [rows, workspaces] = await Promise.all([
    latestBoard(projectId),
    prisma.workspace.findMany({ where: { projectId }, select: { agent: true }, orderBy: { wsId: "asc" } }),
  ]);

  const roster = workspaces.map((w) => w.agent);
  const briefing = buildBriefing(toBoardSections(rows), new Date(), roster);

  return <ProjectBoardPage slug={slug} briefing={briefing} />;
}
