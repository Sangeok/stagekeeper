import "server-only";
import { prisma } from "./db";
import * as service from "./project-token-service";
import type { ServerResult } from "./result";

export async function issueProjectToken(input: service.IssueProjectTokenInput): Promise<ServerResult<{ token: string }>> {
  return service.issueProjectToken(prisma, input);
}

export async function issueProjectOwnerToken(input: service.IssueProjectTokenInput): Promise<ServerResult<{ token: string }>> {
  return service.issueProjectOwnerToken(prisma, input);
}
