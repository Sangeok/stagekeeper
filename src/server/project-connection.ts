import "server-only";
import { prisma } from "./db";
import * as service from "./project-connection-service";

export async function disconnectProject(input: service.ProjectConnectionInput): Promise<service.ProjectConnectionResult> {
  return service.disconnectProject(prisma, input);
}

export async function reconnectProject(input: service.ProjectConnectionInput): Promise<service.ProjectConnectionResult> {
  return service.reconnectProject(prisma, input);
}
