import { NewProjectForm } from "@/fsd/features/create-project";
import { createProject } from "@/fsd/features/create-project/index.server";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { listPublicRepos } from "@/server/github";
import { mcpUrl } from "@/server/public-url";

export default async function Page() {
  const { userId } = await requireUser();
  // 로그인한 GitHub 계정을 owner 기본값으로 준다 — 이미 아는 값을 다시 묻지 않는다.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { login: true } });
  const repos = await listPublicRepos(user.login);
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">New project</h1>
      <NewProjectForm action={createProject} mcpUrl={mcpUrl()} defaultOwner={user.login} repos={repos} />
    </main>
  );
}
