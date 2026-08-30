import { AppHeader, ProjectTabs } from "@/fsd/widgets/app-header";
import { TurnBanner, TurnBar, deriveTurn, pendingCount } from "@/fsd/widgets/turn-banner";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";

// 탭 셸 + 턴 배너. 인가는 각 page와 서버 액션이 자기 requireMember로 한다.
// 배너는 모든 탭 위에 있어야 하므로 여기서 보드를 한 번 읽는다(page의 읽기와 별개 — 캐시 통합은 후속).
export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const { userId, projectId } = await requireMember(slug);

  const [project, user, memberships, rows, tokenCount, workspaceCount, backlogCount] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { slug: true, name: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { login: true } }),
    prisma.projectMember.findMany({
      where: { userId },
      select: { project: { select: { slug: true, name: true } } },
      orderBy: { project: { createdAt: "asc" } },
    }),
    latestBoard(projectId),
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.backlogItem.count({ where: { projectId, removedAt: null } }),
  ]);

  const turn = deriveTurn(
    rows.map((r) => ({ key: r.backlogItem.key, status: r.status, agent: r.agent, validation: r.validation })),
    { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, backlogCount },
  );

  return (
    <div className="flex flex-1 flex-col">
      <TurnBar turn={turn} />
      <AppHeader login={user.login} project={project} projects={memberships.map((m) => m.project)} />
      <ProjectTabs slug={slug} inboxCount={pendingCount(turn)} />
      <main className="mx-auto flex w-full max-w-[800px] flex-1 flex-col gap-8 px-5 pt-9 pb-14">
        <TurnBanner turn={turn} slug={slug} />
        {children}
      </main>
    </div>
  );
}
