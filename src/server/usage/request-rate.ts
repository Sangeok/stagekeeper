import "server-only";
import { prisma } from "@/server/db";
import { consumeProjectRequestBudget, consumeRequestBudget } from "./request-rate-service";
import type { RequestRateFailure } from "@/server/result";

export function limitProjectRequest(projectId: string): Promise<RequestRateFailure | null> {
  return consumeProjectRequestBudget(prisma, projectId);
}
export function limitAccountRequest(userId: string): Promise<RequestRateFailure | null> {
  return consumeRequestBudget(prisma, userId, null);
}
