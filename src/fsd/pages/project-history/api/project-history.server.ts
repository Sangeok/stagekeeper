import "server-only";
import { prisma } from "@/server/db";
import { loadPipelineChanges } from "@/server/pipeline/api";
import type { HistoryEventRecord } from "@/server/pipeline/contracts";
import { historyCutoff } from "@harness/core/plans/entitlement.mjs";
import { readHistoryQuery } from "../model/history-navigation";
import type { ProjectHistoryProps } from "../model/history-view";
import { planForProject } from "@/server/projects/api.server";
import { currentRoundIds, hasProjectHistoryBefore, projectHistory, projectHistoryItems } from "@/server/pipeline/api.server";
import { formatHistoryCursor, parseHistoryCursor } from "@/server/pipeline/api";
import { formatHistoryItemCursor, parseHistoryItemCursor } from "@/server/pipeline/api";
import { loadProjectRepository } from "@/server/projects/api.server";

export async function loadProjectHistory({ slug, projectId, searchParams, now }: { slug: string; projectId: string; searchParams: Record<string, string | string[] | undefined>; now: Date }): Promise<ProjectHistoryProps> {
  const cutoff = historyCutoff(await planForProject(projectId), now);
  const query = readHistoryQuery(searchParams);
  const { mode, view } = query;
  if (mode === "items") {
    const before = parseHistoryItemCursor(query.before);
    const [page, truncated, repo] = await Promise.all([
      projectHistoryItems(projectId, { since: cutoff, before }),
      cutoff === null ? false : hasProjectHistoryBefore(projectId, "all", cutoff),
      loadProjectRepository(projectId),
    ]);
    const item = typeof query.item === "string" ? page.rows.find(row => row.key === query.item) : undefined;
    let expanded = null;
    if (item) {
      const itemBefore = parseHistoryCursor(query.itemBefore);
      const [history, currentRounds] = await Promise.all([
        projectHistory(projectId, { key: item.key, view: "all", since: cutoff, before: itemBefore }),
        currentRoundIds(projectId, [item.key]),
      ]);
      expanded = { key: item.key, events: await withPipelineNames(projectId, history.rows.filter(row => row.source === "event")),
        reports: history.rows.filter(row => row.source === "report"), currentRounds,
        nextCursor: history.next === null ? null : formatHistoryCursor(history.next), hasBefore: itemBefore !== null };
    }
    return { slug, mode: "items", items: page.rows, repo, expanded,
      before: before === null ? null : formatHistoryItemCursor(before), hasBefore: before !== null,
      nextCursor: page.next === null ? null : formatHistoryItemCursor(page.next), historyTruncated: truncated };
  }
  const before = parseHistoryCursor(query.before);
  const [page, truncated, repo] = await Promise.all([
    projectHistory(projectId, { view, since: cutoff, before }),
    cutoff === null ? false : hasProjectHistoryBefore(projectId, view, cutoff),
    loadProjectRepository(projectId),
  ]);
  const currentRounds = await currentRoundIds(projectId, page.rows.map(row => row.key));
  return { slug, mode: "events", view, repo, currentRounds,
    events: await withPipelineNames(projectId, page.rows.filter(row => row.source === "event")), reports: page.rows.filter(row => row.source === "report"),
    nextCursor: page.next === null ? null : formatHistoryCursor(page.next), hasBefore: before !== null, historyTruncated: truncated };
}

async function withPipelineNames(projectId: string, events: HistoryEventRecord[]): Promise<HistoryEventRecord[]> {
  const changes = await loadPipelineChanges(prisma, projectId, events.map(event => event.note));
  return events.map(event => ({ ...event, pipelineChange: event.note ? changes[event.note] ?? null : null }));
}
