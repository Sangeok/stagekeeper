import { notFound } from "next/navigation";
import { BoardItemPage, type ItemDoc } from "@/fsd/pages/board-item";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { getWithHistory } from "@/server/pipeline/board";

export default async function Page({ params }: PageProps<"/p/[slug]/items/[key]">) {
  const { slug, key } = await params;
  const { projectId } = await requireMember(slug);
  const [project, row] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { owner: true, repo: true, branch: true } }),
    getWithHistory(projectId, key),
  ]);
  if (!row) notFound();

  const blob = (path: string) => `https://github.com/${project.owner}/${project.repo}/blob/${project.branch}/${path}`;
  const docs: ItemDoc[] = [];
  if (row.planPath) docs.push({ label: "Plan", path: row.planPath, href: blob(row.planPath) });
  for (const report of row.reports) {
    docs.push({ label: `${report.actor} report`, path: report.path, href: blob(report.path) });
  }

  return (
    <BoardItemPage
      item={{
        key: row.backlogItem.key,
        title: row.backlogItem.title,
        area: row.backlogItem.area,
        agent: row.agent,
        status: row.status,
        reason: row.reason,
        results: row.results,
        validation: row.validation,
        proposedOn: row.proposedOn,
        docs,
        events: row.events.map((e) => ({ at: e.at, actor: e.actor, from: e.from, to: e.to, note: e.note })),
      }}
    />
  );
}
