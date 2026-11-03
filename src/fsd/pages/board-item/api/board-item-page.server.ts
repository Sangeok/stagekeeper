import "server-only";
import type { ComponentProps } from "react";
import { historyCutoff } from "@harness/core/plans/entitlement.mjs";
import { readSelectionDecision } from "@harness/core/pipeline/work-selection.mjs";
import { prisma } from "@/server/db";
import { loadPipelinesView, loadItemPipelineView, loadPipelineChanges } from "@/server/pipeline/api";
import { getWithHistory, hasHistoryBefore } from "@/server/pipeline/api.server";
import { planForProject, projectAccess, loadProjectRepository } from "@/server/projects/api.server";
import { toItemDocs } from "../model/item-docs";
import type { BoardItemPage } from "../ui/board-item-page";

type BoardItemPageData = Pick<ComponentProps<typeof BoardItemPage>, "item" | "pipelineChoices" | "canWrite">;

export async function loadBoardItemPage(projectId: string, key: string): Promise<BoardItemPageData | null> {
  const access = await projectAccess(projectId);
  const cutoff = historyCutoff(await planForProject(projectId), new Date());
  const [project, row] = await Promise.all([loadProjectRepository(projectId), getWithHistory(projectId, key, cutoff)]);
  if (!row) return null;
  const [pipeline, view, changes] = await Promise.all([
    loadItemPipelineView(prisma, projectId, row.id), loadPipelinesView(prisma, projectId),
    loadPipelineChanges(prisma, projectId, row.events.map(event => event.note)),
  ]);
  const truncated = cutoff !== null && (await hasHistoryBefore(projectId, row.id, cutoff));
  return {
    canWrite: access.available,
    pipelineChoices: view.pipelines.filter(choice => choice.runnable !== null && choice.id !== pipeline.pipelineId).map(({ id, name }) => ({ id, name })),
    item: {
      id: row.id,
      pipeline,
      key: row.backlogItem.key,
      title: row.backlogItem.title,
      area: row.backlogItem.area,
      agent: row.agent,
      status: row.status,
      reason: row.reason,
      selectionDecision: readSelectionDecision(row.selectionDecision),
      results: row.results,
      validation: row.validation,
      proposedOn: row.proposedOn,
      acceptedAt: row.acceptedAt,
      acceptanceFailure: row.acceptanceFailures[0] ?? null,
      updatedAt: row.updatedAt.toISOString(),
      docs: toItemDocs(row, project),
      events: row.events.map(event => ({ id: event.id, at: event.at, actor: event.actor, channel: event.channel, from: event.from, to: event.to, note: event.note, pipelineChange: event.note ? changes[event.note] ?? null : null })),
      reports: row.reports.map(report => ({ id: report.id, at: report.at, actor: report.actor, path: report.path, commit: report.commit,
        isAcceptance: report.isAcceptance, acceptedAt: row.acceptedAt })),
      repo: project,
      historyTruncated: truncated,
    },
  };
}
