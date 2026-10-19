import "server-only";
import { prisma } from "@/server/db";
import { makeRecordTokenUsage } from "./usage-recorder";

export const recordTokenUsage = makeRecordTokenUsage(prisma);
