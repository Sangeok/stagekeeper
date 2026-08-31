import { AppHeader, ProjectTabs } from "@/fsd/widgets/app-header";
import { loadHeaderProjects, loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { TurnBanner, TurnBar, pendingCount } from "@/fsd/widgets/turn-banner";
import { loadTurn } from "@/fsd/widgets/turn-banner/index.server";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";

// 탭 셸 + 턴 배너. 인가는 각 page와 서버 액션이 자기 requireMember로 한다.
// 배너·머리의 읽기는 각 위젯의 server adapter가 소유한다 — 여기는 조합만 한다.
export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const { userId, projectId } = await requireMember(slug);

  const [project, user, projects, turn] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { slug: true, name: true } }),
    loadHeaderUser(userId),
    loadHeaderProjects(userId),
    loadTurn(projectId),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <TurnBar turn={turn} />
      <AppHeader login={user.login} project={project} projects={projects} />
      <ProjectTabs slug={slug} pendingCount={pendingCount(turn)} />
      <main className="mx-auto flex w-full max-w-[800px] flex-1 flex-col gap-8 px-5 pt-9 pb-14">
        <TurnBanner turn={turn} slug={slug} />
        {children}
      </main>
    </div>
  );
}
