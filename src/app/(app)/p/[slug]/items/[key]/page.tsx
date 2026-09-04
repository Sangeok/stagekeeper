import { notFound } from "next/navigation";
import { historyCutoff } from "@harness/core/entitlement.mjs";
import { BoardItemPage, toItemDocs } from "@/fsd/pages/board-item";
import { requireMember } from "@/server/auth/guard";
import { planForProject } from "@/server/entitlement";
import { getWithHistory, hasHistoryBefore } from "@/server/pipeline/board";
import { loadRepoRef } from "@/server/project";

export default async function Page({ params }: PageProps<"/p/[slug]/items/[key]">) {
  const { slug, key } = await params;
  const { projectId } = await requireMember(slug);
  // 이력 창은 플랜이 정한다. 저장은 전부 하고 조회만 자른다 — 잘린 경우에만 화면이 그 사실을 알린다.
  const cutoff = historyCutoff(await planForProject(projectId), new Date());
  const [project, row] = await Promise.all([loadRepoRef(projectId), getWithHistory(projectId, key, cutoff)]);
  if (!row) notFound();
  const truncated = cutoff !== null && (await hasHistoryBefore(projectId, key, cutoff));

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
        historyTruncated: truncated,
      }}
    />
  );
}
