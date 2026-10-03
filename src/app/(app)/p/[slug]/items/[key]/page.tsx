import { notFound } from "next/navigation";
import { historyCutoff } from "@harness/core/entitlement.mjs";
import { humanTransition, retryAcceptance } from "@/fsd/features/review-gate/index.server";
import { BoardItemPage, toItemDocs } from "@/fsd/pages/board-item";
import { requireProjectOwner } from "@/server/auth/guard";
import { planForProject, projectAccess } from "@/server/entitlement";
import { getWithHistory, hasHistoryBefore } from "@/server/pipeline/board";
import { loadProjectRepository } from "@/server/project";

export default async function Page({ params }: PageProps<"/p/[slug]/items/[key]">) {
  const { slug, key } = await params;
  const { projectId } = await requireProjectOwner(slug);
  // 이력 창은 플랜이 정한다. 저장은 전부 하고 조회만 자른다 — 잘린 경우에만 화면이 그 사실을 알린다.
  const access = await projectAccess(projectId);
  const cutoff = historyCutoff(await planForProject(projectId), new Date());
  const [project, row] = await Promise.all([loadProjectRepository(projectId), getWithHistory(projectId, key, cutoff)]);
  if (!row) notFound();
  const truncated = cutoff !== null && (await hasHistoryBefore(projectId, row.id, cutoff));

  return (
    <BoardItemPage
      slug={slug}
      retryAcceptance={retryAcceptance.bind(null, slug)}
      canWrite={access.available}
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
        acceptedAt: row.acceptedAt,
        acceptanceFailure: row.acceptanceFailures[0] ?? null,
        updatedAt: row.updatedAt.toISOString(),
        docs: toItemDocs(row, project),
        events: row.events.map((e) => ({ id: e.id, at: e.at, actor: e.actor, channel: e.channel, from: e.from, to: e.to, note: e.note })),
        reports: row.reports.map((r) => ({ id: r.id, at: r.at, actor: r.actor, path: r.path, commit: r.commit,
          isAcceptance: r.isAcceptance, acceptedAt: row.acceptedAt })),
        repo: project,
        historyTruncated: truncated,
      }}
      transition={humanTransition.bind(null, slug)}
    />
  );
}
