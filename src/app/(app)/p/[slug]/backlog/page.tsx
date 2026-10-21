import { addBacklogItem, removeBacklogItem, updateBacklogItem } from "@/fsd/features/edit-backlog/index.server";
import { proposeItem } from "@/fsd/features/propose-item/index.server";
import { ProjectBacklogPage } from "@/fsd/pages/project-backlog";
import { readBacklogQuery } from "@/fsd/shared/routes/project";
import { requireProjectOwner } from "@/server/auth/guard";
import { projectAccess } from "@/server/projects/api.server";
import { prisma } from "@/server/db";
import { loadProjectRoster } from "@/server/projects/api";
import { routePipeline } from "@harness/core/pipeline.mjs";
import { loadPipelinesView } from "@/server/pipeline/api";
import { backlogWithStatus } from "@/server/pipeline/api.server";

export default async function Page({ params, searchParams }: PageProps<"/p/[slug]/backlog">) {
  const { slug } = await params;
  const query = await searchParams;
  const { projectId } = await requireProjectOwner(slug);

  const { includeRemoved, editKey } = readBacklogQuery(query);
  const [items, roster, view] = await Promise.all([
    backlogWithStatus(projectId, includeRemoved),
    loadProjectRoster(prisma, projectId),
    loadPipelinesView(prisma, projectId),
  ]);
  const access = await projectAccess(projectId);
  const editing = items.find((item) => item.key === editKey);

  return (
    <ProjectBacklogPage
      slug={slug}
      canWrite={access.available}
      includeRemoved={includeRemoved}
      rows={items.map(({ key, title, area, source, status, removedAt, type, addedBy, removedReason }) => ({ key, title, area, source, status, removedAt, type, addedBy, removedReason }))}
      editing={editing ? {
        item: { key: editing.key, title: editing.title, area: editing.area, source: editing.source, type: editing.type },
        update: updateBacklogItem.bind(null, slug, editing.key),
      } : undefined}
      add={addBacklogItem.bind(null, slug)}
      remove={removeBacklogItem.bind(null, slug)}
      propose={proposeItem.bind(null, slug)}
      roster={roster}
      pipelines={view.pipelines.filter(pipeline => pipeline.runnable !== null).map(({ id, name }) => ({ id, name }))}
      preselected={Object.fromEntries(items.map(item => [item.key, routePipeline(item.type, view.rules, view.pipelines.find(pipeline => pipeline.isDefault)!.id)]))}
    />
  );
}
