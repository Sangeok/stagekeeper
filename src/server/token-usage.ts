import "server-only";
import { prisma } from "./db";
import { makeRecordTokenUsage } from "./token-usage-query";

export const recordTokenUsage = makeRecordTokenUsage(prisma);
