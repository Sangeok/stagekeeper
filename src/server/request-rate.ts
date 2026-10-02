import "server-only";
import { prisma } from "./db";
import { consumeProjectRequestBudget, consumeRequestBudget } from "./request-rate-limit";
import type { RequestRateFailure } from "./result";

export function limitProjectRequest(projectId: string): Promise<RequestRateFailure | null> {
  return consumeProjectRequestBudget(prisma, projectId);
}
export function limitAccountRequest(userId: string): Promise<RequestRateFailure | null> {
  return consumeRequestBudget(prisma, userId, null);
}
