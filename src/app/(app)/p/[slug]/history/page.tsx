import { historyCutoff } from "@harness/core/entitlement.mjs";
import { ProjectHistoryPage, readHistoryQuery } from "@/fsd/pages/project-history";
import { requireProjectOwner } from "@/server/auth/guard";
import { planForProject } from "@/server/entitlement";
import { currentRoundIds, hasProjectHistoryBefore, projectHistory, projectHistoryItems } from "@/server/pipeline/board";
import { formatHistoryCursor, parseHistoryCursor } from "@/server/pipeline/history-page";
import { formatHistoryItemCursor, parseHistoryItemCursor } from "@/server/pipeline/history-items";
import { loadProjectRepository } from "@/server/project";

export default async function Page({ params, searchParams }: PageProps<"/p/[slug]/history">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);
  const cutoff = historyCutoff(await planForProject(projectId), new Date());
  const query = readHistoryQuery(await searchParams);
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
      expanded = { key: item.key, events: history.rows.filter(row => row.source === "event"),
        reports: history.rows.filter(row => row.source === "report"), currentRounds,
        nextCursor: history.next === null ? null : formatHistoryCursor(history.next), hasBefore: itemBefore !== null };
    }
    return <ProjectHistoryPage slug={slug} mode="items" items={page.rows} repo={repo} expanded={expanded}
      before={before === null ? null : formatHistoryItemCursor(before)} hasBefore={before !== null}
      nextCursor={page.next === null ? null : formatHistoryItemCursor(page.next)} historyTruncated={truncated} />;
  }
  const before = parseHistoryCursor(query.before);
  const [page, truncated, repo] = await Promise.all([
    projectHistory(projectId, { view, since: cutoff, before }),
    cutoff === null ? false : hasProjectHistoryBefore(projectId, view, cutoff),
    loadProjectRepository(projectId),
  ]);
  const currentRounds = await currentRoundIds(projectId, page.rows.map(row => row.key));
  return <ProjectHistoryPage slug={slug} mode="events" view={view} repo={repo} currentRounds={currentRounds}
    events={page.rows.filter(row => row.source === "event")}
    reports={page.rows.filter(row => row.source === "report")}
    nextCursor={page.next === null ? null : formatHistoryCursor(page.next)}
    hasBefore={before !== null} historyTruncated={truncated} />;
}
