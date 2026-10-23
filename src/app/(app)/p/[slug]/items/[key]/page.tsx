import { notFound } from "next/navigation";
import { historyCutoff } from "@harness/core/plans/entitlement.mjs";
import { prisma } from "@/server/db";
import { loadPipelinesView, loadItemPipelineView, loadPipelineChanges } from "@/server/pipeline/api";
import { changeItemPipeline } from "@/fsd/features/change-item-pipeline/index.server";
import { humanTransition, retryAcceptance } from "@/fsd/features/review-gate/index.server";
import { BoardItemPage, toItemDocs } from "@/fsd/pages/board-item";
import { requireProjectOwner } from "@/server/auth/guard";
import { planForProject, projectAccess } from "@/server/projects/api.server";
import { getWithHistory, hasHistoryBefore } from "@/server/pipeline/api.server";
import { loadProjectRepository } from "@/server/projects/api.server";

export default async function Page({ params }: PageProps<"/p/[slug]/items/[key]">) {
  const { slug, key } = await params;
  const { projectId } = await requireProjectOwner(slug);
  const access = await projectAccess(projectId);
  const cutoff = historyCutoff(await planForProject(projectId), new Date());
  const [project, row] = await Promise.all([loadProjectRepository(projectId), getWithHistory(projectId, key, cutoff)]);
  if (!row) notFound();
  const [pipeline, view, changes] = await Promise.all([
    loadItemPipelineView(prisma, projectId, row.id), loadPipelinesView(prisma, projectId),
    loadPipelineChanges(prisma, projectId, row.events.map(event => event.note)),
  ]);
  const truncated = cutoff !== null && (await hasHistoryBefore(projectId, row.id, cutoff));

  return (
    <BoardItemPage
      slug={slug}
      changePipeline={changeItemPipeline.bind(null, slug)}
      pipelineChoices={view.pipelines.filter(choice => choice.runnable !== null && choice.id !== pipeline.pipelineId).map(({ id, name }) => ({ id, name }))}
      retryAcceptance={retryAcceptance.bind(null, slug)}
      canWrite={access.available}
      item={{
        id: row.id,
        pipeline,
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
        events: row.events.map((e) => ({ id: e.id, at: e.at, actor: e.actor, channel: e.channel, from: e.from, to: e.to, note: e.note, pipelineChange: e.note ? changes[e.note] ?? null : null })),
        reports: row.reports.map((r) => ({ id: r.id, at: r.at, actor: r.actor, path: r.path, commit: r.commit,
          isAcceptance: r.isAcceptance, acceptedAt: row.acceptedAt })),
        repo: project,
        historyTruncated: truncated,
      }}
      transition={humanTransition.bind(null, slug)}
    />
  );
}
