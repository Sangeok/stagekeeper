import "server-only";
import { prisma } from "@/server/db";
import * as service from "./connection-service";

export async function disconnectProject(input: service.ProjectConnectionInput): Promise<service.ProjectConnectionResult> {
  return service.disconnectProject(prisma, input);
}

export async function reconnectProject(input: service.ProjectConnectionInput): Promise<service.ProjectConnectionResult> {
  return service.reconnectProject(prisma, input);
}
