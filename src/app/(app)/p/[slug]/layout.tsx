import { AppHeader, ProjectTabs } from "@/fsd/widgets/app-header";
import { loadHeaderProjects, loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { TurnBanner, TurnBar } from "@/fsd/widgets/turn-banner";
import { loadTurn } from "@/fsd/widgets/turn-banner/index.server";
import { requireMember } from "@/server/auth/guard";
import { projectAccess } from "@/server/entitlement";
import { prisma } from "@/server/db";

// 탭 셸 + 턴 배너. 인가는 각 page와 서버 액션이 자기 requireMember로 한다.
// 배너·머리의 읽기는 각 위젯의 server adapter가 소유한다 — 여기는 조합만 한다.
export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const { userId, projectId } = await requireMember(slug);

  const [project, user, projects, { turn, inboxCount }, access] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { slug: true, name: true } }),
    loadHeaderUser(userId),
    loadHeaderProjects(userId),
    loadTurn(projectId),
    projectAccess(projectId),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <TurnBar turn={turn} />
      <AppHeader login={user.login} project={project} projects={projects} />
      <ProjectTabs slug={slug} pendingCount={inboxCount} />
      <main className="mx-auto flex w-full max-w-[800px] flex-1 flex-col gap-8 px-5 pt-9 pb-14">
        {/* 잠금 배너 한 줄. 화면은 읽기 상태로 남는다 — 쓰기만 requireProjectWrite가 막는다. */}
        {access.locked ? (
          <p className="rounded-lg border border-line bg-field px-3.5 py-2 text-sm text-risk">{access.reason}</p>
        ) : null}
        <TurnBanner turn={turn} slug={slug} />
        {children}
      </main>
    </div>
  );
}
