import { discardItem, humanTransition, loadInboxItems } from "@/fsd/features/review-gate/index.server";
import { ProjectInboxPage } from "@/fsd/pages/project-inbox";
import { requireMember } from "@/server/auth/guard";

// 어떤 항목이 결재함에 오르는지, 카드 모델이 무엇인지, 그걸 만들려면 무엇을 읽어야 하는지는
// 전부 review-gate가 소유한다 — 여기는 인가하고 넘기기만 한다.
export default async function Page({ params }: PageProps<"/p/[slug]/inbox">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);
  const items = await loadInboxItems(projectId);

  return (
    <ProjectInboxPage
      items={items}
      now={new Date().toISOString()}
      transition={humanTransition.bind(null, slug)}
      discard={discardItem.bind(null, slug)}
    />
  );
}
