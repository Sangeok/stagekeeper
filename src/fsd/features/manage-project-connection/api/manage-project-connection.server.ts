import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROJECT_LAYOUT_REVALIDATE_PATH } from "@/fsd/shared/routes/project";
import { projectsPath } from "@/fsd/shared/routes/projects";
import { requireUser } from "@/server/auth/guard";
import { loadProjectAvailability } from "@/server/project-availability";
import { disconnectProject, reconnectProject } from "@/server/project-connection";
import { projectConnectionWritesEnabled } from "@/server/project-connection-config";
import type { ProjectConnectionAction, ProjectConnectionModel, ProjectConnectionState } from "../model/project-connection-state";

const inputSchema = z.object({ targetProjectId: z.string().min(1), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) });

export async function loadProjectConnection(userId: string): Promise<ProjectConnectionModel> {
  const view = await loadProjectAvailability(userId);
  return { plan: view.plan, limit: view.limit, version: view.version, connectedCount: view.connectedCount, projects: view.projects, writesEnabled: projectConnectionWritesEnabled() };
}

export async function disconnectRepository(input: Parameters<ProjectConnectionAction>[0]): Promise<ProjectConnectionState> {
  "use server";
  const { userId } = await requireUser();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", reason: "Invalid repository connection request." };
  const result = await disconnectProject({ targetProjectId: parsed.data.targetProjectId, expectedVersion: parsed.data.expectedVersion, userId });
  if (result.status === "error") return { status: "error", reason: result.reason };
  if (result.status === "stale") return { status: "stale" };
  revalidatePath(projectsPath());
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return { status: "success" };
}

export async function reconnectRepository(input: Parameters<ProjectConnectionAction>[0]): Promise<ProjectConnectionState> {
  "use server";
  const { userId } = await requireUser();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", reason: "Invalid repository connection request." };
  const result = await reconnectProject({ targetProjectId: parsed.data.targetProjectId, expectedVersion: parsed.data.expectedVersion, userId });
  if (result.status === "error") return { status: "error", reason: result.reason };
  if (result.status === "stale") return { status: "stale" };
  revalidatePath(projectsPath());
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return { status: "success" };
}
