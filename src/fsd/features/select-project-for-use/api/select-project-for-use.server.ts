import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROJECT_LAYOUT_REVALIDATE_PATH } from "@/fsd/shared/routes/project";
import { projectsPath } from "@/fsd/shared/routes/projects";
import { requireUser } from "@/server/auth/guard";
import { loadProjectAvailability, selectProjectForUse } from "@/server/project-availability";
import type { ProjectSelectionModel, SelectProjectState } from "../model/select-project-state";

const inputSchema = z.object({ targetProjectId: z.string().min(1), replacementProjectId: z.string().min(1).optional(), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) });

export async function loadProjectSelection(userId: string): Promise<ProjectSelectionModel> {
  const view = await loadProjectAvailability(userId);
  return { plan: view.plan, limit: view.limit, version: view.version, availableCount: view.availableCount, projects: view.projects };
}

export async function selectProject(input: z.input<typeof inputSchema>): Promise<SelectProjectState> {
  "use server";
  const { userId } = await requireUser();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", reason: "Invalid project selection." };
  const result = await selectProjectForUse({ ...parsed.data, userId });
  // not-found도 값으로 돌려준다 — 대체할 프로젝트가 없을 때도 이 코드가 나오므로 라우트 전체 404는 틀린 표면이다.
  if (result.status === "error") return { status: "error", reason: result.reason };
  if (result.status === "stale") return { status: "stale" };
  revalidatePath(projectsPath());
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return { status: "success" };
}
