import { ProjectHistoryPage } from "@/fsd/pages/project-history";
import { loadProjectHistory } from "@/fsd/pages/project-history/index.server";
import { requireProjectOwner } from "@/server/auth/guard";

export default async function Page({ params, searchParams }: PageProps<"/p/[slug]/history">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);
  const props = await loadProjectHistory({ slug, projectId, searchParams: await searchParams, now: new Date() });
  return <ProjectHistoryPage {...props} />;
}
