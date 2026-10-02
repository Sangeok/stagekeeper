import { REQUEST_LIMITS, requestWindow } from "@harness/core/request-rate.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { TransactionHost } from "./project-access-query";
import type { RequestRateFailure } from "./result";
import { readDatabaseClockIn } from "./database-clock";

type Budget = { scope: "account" | "project"; subjectId: string; ownerUserId: string; projectId: string | null };
type LockedWindow = Budget & { startedAt: Date; count: number };
class RateRollback extends Error {
  constructor(readonly failure: RequestRateFailure) { super("Request budget unavailable"); }
}

async function lockWindowIn(tx: Prisma.TransactionClient, budget: Budget): Promise<LockedWindow> {
  await tx.$executeRaw`INSERT INTO "RequestRateWindow" ("scope", "subjectId", "ownerUserId", "projectId", "startedAt", "count")
    VALUES (${budget.scope}, ${budget.subjectId}, ${budget.ownerUserId}, ${budget.projectId}, TIMESTAMP '1970-01-01', 0)
    ON CONFLICT ("scope", "subjectId") DO NOTHING`;
  const [row] = await tx.$queryRaw<LockedWindow[]>`SELECT * FROM "RequestRateWindow"
    WHERE "scope" = ${budget.scope} AND "subjectId" = ${budget.subjectId} FOR UPDATE`;
  if (!row || row.ownerUserId !== budget.ownerUserId || row.projectId !== budget.projectId) throw new Error("Request budget integrity unavailable");
  return row;
}

export async function consumeRequestBudget(client: TransactionHost, ownerUserId: string, projectId: string | null): Promise<RequestRateFailure | null> {
  try {
    return await client.$transaction(async (tx) => {
      // Every contender takes account then project; clock_timestamp is read only after both locks.
      const locked = [await lockWindowIn(tx, { scope: "account", subjectId: ownerUserId, ownerUserId, projectId: null })];
      if (projectId !== null) locked.push(await lockWindowIn(tx, { scope: "project", subjectId: projectId, ownerUserId, projectId }));
      const at = await readDatabaseClockIn(tx);
      const windows = locked.map((row) => ({ row, window: requestWindow(row.startedAt, row.count, at) }));
      const exhausted = windows.filter(({ row, window }) => window.count >= REQUEST_LIMITS[row.scope]);
      if (exhausted.length) {
        const retryAfterSec = Math.max(1, ...exhausted.map(({ window }) => Math.ceil((window.endsAt.getTime() - at.getTime()) / 1000)));
        throw new RateRollback({ ok: false, code: "RATE_LIMITED", retryAfterSec,
          reason: `Request limit reached. Retry after ${retryAfterSec} seconds.` });
      }
      for (const { row, window } of windows) await tx.requestRateWindow.update({
        where: { scope_subjectId: { scope: row.scope, subjectId: row.subjectId } },
        data: { startedAt: window.startedAt, count: window.count + 1 },
      });
      return null;
    }, { timeout: 15_000 });
  } catch (error) {
    if (error instanceof RateRollback) {
      console.info("request-rate:limited");
      return error.failure;
    }
    throw error;
  }
}

export async function consumeProjectRequestBudget(client: Pick<PrismaClient, "project" | "$transaction">, projectId: string): Promise<RequestRateFailure | null> {
  const owner = await client.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerUserId: true } });
  return consumeRequestBudget(client, owner.ownerUserId, projectId);
}
