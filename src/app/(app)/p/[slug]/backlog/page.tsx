import { addBacklogItem, removeBacklogItem, updateBacklogItem } from "@/fsd/features/edit-backlog/index.server";
import { proposeItem } from "@/fsd/features/propose-item/index.server";
import { ProjectBacklogPage } from "@/fsd/pages/project-backlog";
import { loadProjectBacklogPage } from "@/fsd/pages/project-backlog/index.server";
import { readBacklogQuery } from "@/fsd/shared/routes/project";
import { requireProjectOwner } from "@/server/auth/guard";

export default async function Page({ params, searchParams }: PageProps<"/p/[slug]/backlog">) {
  const { slug } = await params;
  const query = await searchParams;
  const { projectId } = await requireProjectOwner(slug);
  const parsed = readBacklogQuery(query);
  const data = await loadProjectBacklogPage(projectId, parsed);

  return (
    <ProjectBacklogPage
      slug={slug}
      canWrite={data.canWrite}
      includeRemoved={parsed.includeRemoved}
      rows={data.rows}
      editing={data.editingItem ? {
        item: data.editingItem,
        update: updateBacklogItem.bind(null, slug, data.editingItem.key),
      } : undefined}
      add={addBacklogItem.bind(null, slug)}
      remove={removeBacklogItem.bind(null, slug)}
      propose={proposeItem.bind(null, slug)}
      roster={data.roster}
      pipelines={data.pipelines}
      preselected={data.preselected}
    />
  );
}
