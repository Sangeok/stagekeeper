import { toInboxItems } from "@/fsd/features/review-gate";
import { discardItem, humanTransition } from "@/fsd/features/review-gate/index.server";
import { ProjectInboxPage } from "@/fsd/pages/project-inbox";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { latestBoardWithEvents } from "@/server/pipeline/board";

// 어떤 항목이 결재함에 오르는지와 카드 모델은 review-gate가 소유한다 — 여기는 읽고 넘기기만.
export default async function Page({ params }: PageProps<"/p/[slug]/inbox">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);
  const [project, rows] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { owner: true, repo: true, branch: true } }),
    latestBoardWithEvents(projectId),
  ]);

  const items = toInboxItems(rows, project);

  return (
    <ProjectInboxPage
      items={items}
      now={new Date().toISOString()}
      transition={humanTransition.bind(null, slug)}
      discard={discardItem.bind(null, slug)}
    />
  );
}
