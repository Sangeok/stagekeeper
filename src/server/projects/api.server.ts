import "server-only";
import { prisma } from "../db";
import { projectForUser as queryProjectForUser } from "./owner-query";
import { loadProjectRepository as repositoryQuery } from "./repository-query";
import { registerWebProject as registerWeb } from "./registration-service";

export { disconnectProject } from "./connection";
export { loadProjectAvailability } from "./availability";
export { loadProjectConnection } from "./availability";
export { planForProject } from "./entitlement";
export { planForUser } from "./entitlement";
export { projectAccess } from "./entitlement";
export { reconnectProject } from "./connection";
export { selectProjectForUse } from "./availability";

export function projectForUser(slug: string, userId: string): ReturnType<typeof queryProjectForUser> {
  return queryProjectForUser(slug, userId, prisma);
}

export function loadProjectRepository(projectId: string): ReturnType<typeof repositoryQuery> {
  return repositoryQuery(prisma, projectId);
}

export function registerWebProject(input: Parameters<typeof registerWeb>[1]): ReturnType<typeof registerWeb> {
  return registerWeb(prisma, input);
}
