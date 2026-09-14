import "server-only";
import { loadProjectAvailability } from "@/server/project-availability";
import type { ProjectListModel } from "../ui/project-list-page";

export async function loadProjectListPage(userId: string): Promise<ProjectListModel> {
  const view = await loadProjectAvailability(userId);
  return { login: view.login, plan: view.plan, version: view.version, limit: view.limit, availableCount: view.availableCount, projects: view.projects, notice: view.notice };
}
