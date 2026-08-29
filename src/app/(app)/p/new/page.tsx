import { NewProjectForm } from "@/fsd/features/create-project";
import { createProject } from "@/fsd/features/create-project/index.server";
import { requireUser } from "@/server/auth/guard";
import { mcpUrl } from "@/server/public-url";

export default async function Page() {
  await requireUser();
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">새 프로젝트</h1>
      <NewProjectForm action={createProject} mcpUrl={mcpUrl()} />
    </main>
  );
}
