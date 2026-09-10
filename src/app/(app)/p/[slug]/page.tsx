import { ProjectBoardPage, buildBriefing } from "@/fsd/pages/project-board";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";
import { currentVersion } from "@/server/pipeline/run";
import { isGateId } from "@harness/core/pipeline.mjs";

export default async function Page({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);

  const [rows, workspaces, runs, version] = await Promise.all([
    latestBoard(projectId),
    prisma.workspace.findMany({ where: { projectId }, select: { agent: true }, orderBy: { wsId: "asc" } }),
    prisma.pipelineRun.findMany({ where: { closedAt: null, boardItem: { projectId } }, select: { boardItemId: true, node: true } }),
    currentVersion(prisma, projectId),
  ]);
  const cursor = new Map(runs.map((r) => [r.boardItemId, r.node]));

  const roster = workspaces.map((w) => w.agent);
  const briefing = buildBriefing(
    rows.map((r) => { const at = cursor.get(r.id) ?? null; return { ...r, gate: at !== null && isGateId(at) ? at : null }; }),
    new Date(), roster, version.nodes,
  );

  return <ProjectBoardPage slug={slug} briefing={briefing} />;
}
