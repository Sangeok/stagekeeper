import "server-only";
import { runnerFacts } from "@/fsd/widgets/turn-banner/index.server";
import { loadProjectAvailability } from "@/server/projects/api.server";
import { readRunnerSummaries } from "@/server/runners/api.server";
import type { ProjectListModel } from "../ui/project-list-page";

export async function loadProjectListPage(userId: string): Promise<ProjectListModel> {
  const view = await loadProjectAvailability(userId);
  const runners = await readRunnerSummaries(view.projects.map((p) => p.id));
  return { login: view.login, plan: view.plan, version: view.version, limit: view.limit, availableCount: view.availableCount, connectedCount: view.connectedCount,
    projects: view.projects.map((p) => { const runner = runners.get(p.id); return runner === undefined ? p : { ...p, runner: runnerFacts(runner) }; }),
    notice: view.notice };
}
