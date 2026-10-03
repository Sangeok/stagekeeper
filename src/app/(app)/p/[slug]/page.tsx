import { ProjectBoardPage } from "@/fsd/pages/project-board";
import { loadProjectBoard } from "@/fsd/pages/project-board/index.server";
import { requireProjectOwner } from "@/server/auth/guard";

export default async function Page({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);
  const briefing = await loadProjectBoard(projectId, new Date());
  return <ProjectBoardPage slug={slug} briefing={briefing} />;
}
