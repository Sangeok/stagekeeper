import { toBoardSections } from "@/fsd/entities/board-item";
import { toReportDoc, type ReportDoc } from "@/fsd/entities/report";
import { discardItem, humanTransition } from "@/fsd/features/review-gate/index.server";
import { ProjectBoardPage, buildBriefing } from "@/fsd/pages/project-board";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";

export default async function Page({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);

  const [rows, workspaces, reportRows] = await Promise.all([
    latestBoard(projectId),
    prisma.workspace.findMany({ where: { projectId }, select: { agent: true }, orderBy: { wsId: "asc" } }),
    prisma.report.findMany({ where: { boardItem: { projectId } }, select: { actor: true, path: true } }),
  ]);

  const reports = new Map<string, ReportDoc[]>();
  for (const row of reportRows) {
    const list = reports.get(row.actor) ?? [];
    list.push(toReportDoc(row));
    reports.set(row.actor, list);
  }

  const roster = workspaces.map((w) => w.agent);
  const briefing = buildBriefing(toBoardSections(rows), new Date(), roster);
  const updatedAt = Object.fromEntries(rows.map((r) => [r.backlogItem.key, r.updatedAt.toISOString()]));

  return (
    <ProjectBoardPage
      briefing={briefing}
      reports={reports}
      actions={{
        updatedAt,
        transition: humanTransition.bind(null, slug),
        discard: discardItem.bind(null, slug),
      }}
    />
  );
}
