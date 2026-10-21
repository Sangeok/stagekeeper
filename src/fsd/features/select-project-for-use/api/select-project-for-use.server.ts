import "server-only";
import { revalidatePath } from "next/cache";
import { PROJECT_LAYOUT_REVALIDATE_PATH } from "@/fsd/shared/routes/project";
import { projectsPath } from "@/fsd/shared/routes/projects";
import { requireUser } from "@/server/auth/guard";
import { loadProjectAvailability, selectProjectForUse } from "@/server/projects/api.server";
import type { ProjectSelectionModel, SelectProjectState } from "../model/select-project-state";

import { inputSchema, type SelectProjectInput } from "../model/select-project-input";

export async function loadProjectSelection(userId: string): Promise<ProjectSelectionModel> {
  const view = await loadProjectAvailability(userId);
  return { plan: view.plan, limit: view.limit, version: view.version, availableCount: view.availableCount, projects: view.projects.filter((p) => p.disconnectedAt === null) };
}

export async function selectProject(input: SelectProjectInput): Promise<SelectProjectState> {
  "use server";
  const { userId } = await requireUser();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", reason: "Invalid project selection." };
  const result = await selectProjectForUse({ ...parsed.data, userId });
  if (result.status === "error") return { status: "error", reason: result.reason };
  if (result.status === "stale") return { status: "stale" };
  revalidatePath(projectsPath());
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return { status: "success" };
}
