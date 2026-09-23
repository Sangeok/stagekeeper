import { addBacklogItem, removeBacklogItem, updateBacklogItem } from "@/fsd/features/edit-backlog/index.server";
import { proposeItem } from "@/fsd/features/propose-item/index.server";
import { ProjectBacklogPage } from "@/fsd/pages/project-backlog";
import { readBacklogQuery } from "@/fsd/shared/routes/project";
import { requireProjectOwner } from "@/server/auth/guard";
import { projectAccess } from "@/server/entitlement";
import { prisma } from "@/server/db";
import { loadProjectRoster } from "@/server/project";
import { backlogWithStatus } from "@/server/pipeline/board";

export default async function Page({ params, searchParams }: PageProps<"/p/[slug]/backlog">) {
  const { slug } = await params;
  const query = await searchParams;
  const { projectId } = await requireProjectOwner(slug);

  // 질의 키와 인코딩은 링크를 만드는 쪽과 같은 모듈에서 온다(shared/routes/project.ts).
  const { includeRemoved, editKey } = readBacklogQuery(query);
  const [items, roster] = await Promise.all([
    backlogWithStatus(projectId, includeRemoved),
    loadProjectRoster(prisma, projectId),
  ]);
  const access = await projectAccess(projectId);
  const editing = items.find((item) => item.key === editKey);

  return (
    <ProjectBacklogPage
      slug={slug}
      canWrite={access.available}
      includeRemoved={includeRemoved}
      rows={items.map(({ key, title, area, source, status, removedAt }) => ({ key, title, area, source, status, removedAt }))}
      editing={editing ? {
        item: { key: editing.key, title: editing.title, area: editing.area, source: editing.source },
        update: updateBacklogItem.bind(null, slug, editing.key),
      } : undefined}
      add={addBacklogItem.bind(null, slug)}
      remove={removeBacklogItem.bind(null, slug)}
      propose={proposeItem.bind(null, slug)}
      roster={roster}
    />
  );
}
