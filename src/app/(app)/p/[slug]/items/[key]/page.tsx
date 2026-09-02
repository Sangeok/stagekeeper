import { notFound } from "next/navigation";
import { BoardItemPage, toItemDocs } from "@/fsd/pages/board-item";
import { requireMember } from "@/server/auth/guard";
import { getWithHistory } from "@/server/pipeline/board";
import { loadRepoRef } from "@/server/project";

export default async function Page({ params }: PageProps<"/p/[slug]/items/[key]">) {
  const { slug, key } = await params;
  const { projectId } = await requireMember(slug);
  const [project, row] = await Promise.all([loadRepoRef(projectId), getWithHistory(projectId, key)]);
  if (!row) notFound();

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
        docs: toItemDocs(row, project),
        events: row.events.map((e) => ({ at: e.at, actor: e.actor, from: e.from, to: e.to, note: e.note })),
      }}
    />
  );
}
