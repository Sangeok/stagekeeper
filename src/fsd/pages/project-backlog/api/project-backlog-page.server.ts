import "server-only";
import type { ComponentProps } from "react";
import { routePipeline } from "@harness/core/pipeline/pipeline.mjs";
import type { BacklogQuery } from "@/fsd/shared/routes/project";
import { prisma } from "@/server/db";
import { loadProjectRoster } from "@/server/projects/api";
import { projectAccess } from "@/server/projects/api.server";
import { loadPipelinesView } from "@/server/pipeline/api";
import { backlogWithStatus } from "@/server/pipeline/api.server";
import type { ProjectBacklogPage } from "../ui/project-backlog-page";

type PageProps = ComponentProps<typeof ProjectBacklogPage>;
type BacklogPageData = Pick<PageProps, "rows" | "roster" | "pipelines" | "preselected" | "canWrite"> & {
  editingItem: NonNullable<PageProps["editing"]>["item"] | undefined;
};

export async function loadProjectBacklogPage(projectId: string, query: BacklogQuery): Promise<BacklogPageData> {
  const [items, roster, view] = await Promise.all([
    backlogWithStatus(projectId, query.includeRemoved),
    loadProjectRoster(prisma, projectId),
    loadPipelinesView(prisma, projectId),
  ]);
  const access = await projectAccess(projectId);
  const editing = items.find(item => item.key === query.editKey);
  return {
    canWrite: access.available,
    rows: items.map(({ key, title, area, source, status, removedAt, type, addedBy, removedReason }) => ({ key, title, area, source, status, removedAt, type, addedBy, removedReason })),
    editingItem: editing ? { key: editing.key, title: editing.title, area: editing.area, source: editing.source, type: editing.type } : undefined,
    roster,
    pipelines: view.pipelines.filter(pipeline => pipeline.runnable !== null).map(({ id, name }) => ({ id, name })),
    preselected: Object.fromEntries(items.map(item => [item.key, routePipeline(item.type, view.rules, view.pipelines.find(pipeline => pipeline.isDefault)!.id)])),
  };
}
