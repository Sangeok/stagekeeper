import "server-only";
import { prisma } from "./db";
import { readAccountUsage, type AccountUsageSnapshot } from "./account-usage-query";

export async function accountUsage(userId: string): Promise<AccountUsageSnapshot> {
  return readAccountUsage(prisma, userId);
}
