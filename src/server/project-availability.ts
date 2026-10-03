import "server-only";
import { prisma } from "./db";
import * as service from "./project-availability-service";

export async function loadProjectConnection(userId: string, projectId: string): Promise<service.ProjectConnectionView> {
  return service.loadProjectConnection(prisma, userId, projectId);
}

export async function loadProjectAvailability(userId: string): Promise<service.ProjectAvailabilityView> {
  return service.loadProjectAvailability(prisma, userId);
}
export async function selectProjectForUse(input: service.SelectProjectInput): Promise<service.SelectProjectResult> {
  const result = await service.selectProjectForUse(prisma, input);
  console.info(`project-availability:use-project:${result.status}`, { userId: input.userId });
  return result;
}
