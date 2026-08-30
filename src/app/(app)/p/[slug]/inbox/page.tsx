import { discardItem, humanTransition } from "@/fsd/features/review-gate/index.server";
import { ProjectInboxPage } from "@/fsd/pages/project-inbox";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { latestBoardWithEvents } from "@/server/pipeline/board";

// 사람이 손댈 수 있는 상태만 결재함에 올린다. 판정은 packages/core의 상태 기계가 한다.
// 순서: 파이프라인 깊은 것부터 — 게이트②(in_review) → 게이트①(proposed) → 보류.
const INBOX_ORDER: Record<string, number> = { in_review: 0, proposed: 1, on_hold: 2 };

export default async function Page({ params }: PageProps<"/p/[slug]/inbox">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);
  const [project, rows] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { owner: true, repo: true, branch: true } }),
    latestBoardWithEvents(projectId),
  ]);

  const items = rows
    .filter((row) => row.status in INBOX_ORDER)
    .sort((a, b) => (INBOX_ORDER[a.status] ?? 9) - (INBOX_ORDER[b.status] ?? 9))
    .map((row) => {
      // 이벤트는 최신순. 지금 status로 바뀐 전이(검증 기록 같은 same-status 이벤트는 제외)의 시각.
      const became = row.events.find((e) => e.to === row.status && e.from !== e.to);
      const held = row.status === "on_hold" ? row.events.find((e) => e.to === "on_hold") : undefined;
      return {
        key: row.backlogItem.key,
        title: row.backlogItem.title,
        area: row.backlogItem.area,
        agent: row.agent,
        status: row.status,
        reason: row.reason,
        results: row.results,
        validation: row.validation,
        planPath: row.planPath,
        planUrl: row.planPath
          ? `https://github.com/${project.owner}/${project.repo}/blob/${project.branch}/${row.planPath}`
          : null,
        planCommit: row.planCommit,
        proposedOn: row.proposedOn.toISOString(),
        statusSince: (became?.at ?? row.updatedAt).toISOString(),
        heldFrom: held?.from ?? null,
        updatedAt: row.updatedAt.toISOString(),
      };
    });

  return (
    <ProjectInboxPage
      items={items}
      now={new Date().toISOString()}
      transition={humanTransition.bind(null, slug)}
      discard={discardItem.bind(null, slug)}
    />
  );
}
