import { approveGate, discardItem, humanTransition, loadInboxItems } from "@/fsd/features/review-gate/index.server";
import { inboxReadOnlyLabel } from "@/fsd/features/review-gate";
import { ProjectInboxPage } from "@/fsd/pages/project-inbox/index.server";
import { requireProjectOwner } from "@/server/auth/guard";
import { projectAccess } from "@/server/projects/api.server";

export default async function Page({ params }: PageProps<"/p/[slug]/inbox">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);
  const [items, access] = await Promise.all([loadInboxItems(projectId), projectAccess(projectId)]);

  return (
    <ProjectInboxPage
      items={items}
      now={new Date().toISOString()}
      transition={humanTransition.bind(null, slug)}
      approve={approveGate.bind(null, slug)}
      discard={discardItem.bind(null, slug)}
      canWrite={access.available}
      readOnlyLabel={inboxReadOnlyLabel(access)}
    />
  );
}
