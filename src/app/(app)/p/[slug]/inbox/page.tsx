import { discardItem, humanTransition } from "@/fsd/features/review-gate/index.server";
import { ProjectInboxPage } from "@/fsd/pages/project-inbox";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";

// 사람이 손댈 수 있는 상태만 결재함에 올린다. 판정은 packages/core의 상태 기계가 한다.
const INBOX_STATUSES = new Set(["proposed", "in_review", "on_hold"]);

export default async function Page({ params }: PageProps<"/p/[slug]/inbox">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);
  const [project, rows] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { owner: true, repo: true, branch: true } }),
    latestBoard(projectId),
  ]);

  const items = rows
    .filter((row) => INBOX_STATUSES.has(row.status))
    .map((row) => ({
      key: row.backlogItem.key,
      title: row.backlogItem.title,
      agent: row.agent,
      status: row.status,
      reason: row.reason,
      results: row.results,
      validation: row.validation,
      planPath: row.planPath,
      planUrl: row.planPath
        ? `https://github.com/${project.owner}/${project.repo}/blob/${project.branch}/${row.planPath}`
        : null,
      updatedAt: row.updatedAt.toISOString(),
    }));

  return (
    <ProjectInboxPage
      items={items}
      transition={humanTransition.bind(null, slug)}
      discard={discardItem.bind(null, slug)}
    />
  );
}
