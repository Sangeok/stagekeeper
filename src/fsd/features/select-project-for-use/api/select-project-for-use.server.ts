import "server-only";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/guard";
import { loadProjectAvailability, selectProjectForUse } from "@/server/project-availability";
import type { ProjectSelectionModel, SelectProjectState } from "../model/select-project-state";

const inputSchema = z.object({ targetProjectId: z.string().min(1), replacementProjectId: z.string().min(1).optional(), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) });

export async function loadProjectSelection(userId: string): Promise<ProjectSelectionModel> {
  const view = await loadProjectAvailability(userId);
  return { plan: view.plan, limit: view.limit, version: view.version, projects: view.projects };
}

export async function useProject(input: unknown): Promise<SelectProjectState> {
  "use server";
  const { userId } = await requireUser();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", reason: "Invalid project selection." };
  const result = await selectProjectForUse({ ...parsed.data, userId });
  if (result.status === "error") {
    if (result.code === "not-found") notFound();
    return { status: "error", reason: result.reason };
  }
  if (result.status === "stale") return { status: "stale" };
  revalidatePath("/projects");
  revalidatePath("/(app)/p/[slug]", "layout");
  return { status: "success" };
}
