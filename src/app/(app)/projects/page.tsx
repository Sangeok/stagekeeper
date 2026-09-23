import { ProjectListPage } from "@/fsd/pages/project-list";
import { loadProjectListPage } from "@/fsd/pages/project-list/index.server";
import { selectProject } from "@/fsd/features/select-project-for-use/index.server";
import { AppHeader } from "@/fsd/widgets/app-header";
import { requireUser } from "@/server/auth/guard";

export default async function Page() {
  const { userId } = await requireUser();
  const model = await loadProjectListPage(userId);
  return <><AppHeader login={model.login} plan={model.plan} /><ProjectListPage model={model} action={selectProject} /></>;
}
