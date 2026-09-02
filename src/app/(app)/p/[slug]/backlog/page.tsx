import { addBacklogItem, removeBacklogItem, updateBacklogItem } from "@/fsd/features/edit-backlog/index.server";
import { ProjectBacklogPage } from "@/fsd/pages/project-backlog";
import { readBacklogQuery } from "@/fsd/shared/routes/project";
import { requireMember } from "@/server/auth/guard";
import { backlogWithStatus } from "@/server/pipeline/board";

export default async function Page({ params, searchParams }: PageProps<"/p/[slug]/backlog">) {
  const { slug } = await params;
  const query = await searchParams;
  const { projectId } = await requireMember(slug);

  // 질의 키와 인코딩은 링크를 만드는 쪽과 같은 모듈에서 온다(shared/routes/project.ts).
  const { includeRemoved, editKey } = readBacklogQuery(query);
  const items = await backlogWithStatus(projectId, includeRemoved);
  const editing = items.find((item) => item.key === editKey);

  return (
    <ProjectBacklogPage
      slug={slug}
      includeRemoved={includeRemoved}
      rows={items.map(({ key, title, area, status, removedAt }) => ({ key, title, area, status, removedAt }))}
      editing={editing ? { key: editing.key, title: editing.title, area: editing.area, source: editing.source } : undefined}
      add={addBacklogItem.bind(null, slug)}
      update={editKey ? updateBacklogItem.bind(null, slug, editKey) : undefined}
      remove={removeBacklogItem.bind(null, slug)}
    />
  );
}
