import "server-only";
import { loadProjectConnection as loadConnection } from "@/server/projects/api.server";
import type { ProjectConnectionTarget, ProjectConnectionSummary } from "../model/project-connection-state";

export async function loadProjectConnection(userId: string, projectId: string): Promise<{ target: ProjectConnectionTarget | null; summary: ProjectConnectionSummary }> {
  return loadConnection(userId, projectId);
}
