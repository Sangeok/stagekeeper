import { NewProjectForm } from "@/fsd/features/create-project";
import { createProject, loadRepositoryPickerState } from "@/fsd/features/create-project/index.server";
import { AppHeader } from "@/fsd/widgets/app-header";
import { loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { requireUser } from "@/server/auth/guard";
import { mcpUrl } from "@/server/public-url";

export default async function Page() {
  const { userId } = await requireUser();
  const user = await loadHeaderUser(userId);
  const picker = await loadRepositoryPickerState(userId, user.login);
  return (
    <>
      <AppHeader login={user.login} plan={user.plan} />
      <main className="mx-auto flex w-full max-w-[800px] flex-col gap-8 px-5 pt-9 pb-14">
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <NewProjectForm key={userId} action={createProject} mcpUrl={mcpUrl()} defaultOwner={user.login} {...picker} />
      </main>
    </>
  );
}
