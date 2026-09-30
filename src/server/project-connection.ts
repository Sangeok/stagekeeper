import "server-only";
import { prisma } from "./db";
import { projectConnectionWritesEnabled } from "./project-connection-config";
import * as service from "./project-connection-service";

const disabled: service.ProjectConnectionResult = { status: "error", code: "disabled", reason: "Repository connection changes are temporarily unavailable." };

export async function disconnectProject(input: service.ProjectConnectionInput): Promise<service.ProjectConnectionResult> {
  return projectConnectionWritesEnabled() ? service.disconnectProject(prisma, input) : disabled;
}

export async function reconnectProject(input: service.ProjectConnectionInput): Promise<service.ProjectConnectionResult> {
  return projectConnectionWritesEnabled() ? service.reconnectProject(prisma, input) : disabled;
}
