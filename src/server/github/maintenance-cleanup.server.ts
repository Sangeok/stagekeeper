import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

const BATCH_SIZE = 500;
const MAX_ROUNDS = 40;
const RUN_BUDGET_MS = 60_000;

type CleanupCounts = { attemptsDeleted: number; deliveriesDeleted: number; connectionsExpired: number };
type CleanupResult = CleanupCounts & { cleanupComplete: boolean; cleanupBatches: number };
type Batch = { counter: keyof CleanupCounts; query: Prisma.Sql; pending: Prisma.Sql };

function connectionBatch(now: Date, expiresAt: Prisma.Sql, extra: Prisma.Sql): Batch {
  const predicate = Prisma.sql`"accessToken" IS NOT NULL AND ${expiresAt} <= ${now} ${extra}`;
  return {
    counter: "connectionsExpired",
    pending: Prisma.sql`EXISTS (SELECT 1 FROM "GitHubConnection" WHERE ${predicate})`,
    query: Prisma.sql`
      WITH expired AS (
        SELECT "userId" FROM "GitHubConnection" WHERE ${predicate}
        ORDER BY ${expiresAt} LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED
      ), stopped AS (
        UPDATE "GitHubConnection" AS connection
        SET "revision" = connection."revision" + 1, "tokenVersion" = connection."tokenVersion" + 1,
            "revokedAt" = ${now}, "updatedAt" = ${now}, "accessToken" = NULL, "refreshToken" = NULL,
            "accessExpiresAt" = NULL, "refreshExpiresAt" = NULL, "refreshLeaseId" = NULL, "refreshLeaseExpiresAt" = NULL
        FROM expired WHERE connection."userId" = expired."userId" RETURNING connection."userId"
      ), cancelled AS (
        UPDATE "GitHubConnectAttempt" SET "status" = 'cancelled', "draft" = NULL, "verifier" = NULL
        WHERE "userId" IN (SELECT "userId" FROM stopped)
      ), forgotten AS (
        DELETE FROM "GitHubInstallation" WHERE "userId" IN (SELECT "userId" FROM stopped)
      )
      SELECT count(*)::int AS count FROM stopped`,
  };
}

function cleanupBatches(now: Date): Batch[] {
  return [
    {
      counter: "attemptsDeleted",
      pending: Prisma.sql`EXISTS (SELECT 1 FROM "GitHubConnectAttempt" WHERE "expiresAt" <= ${now})`,
      query: Prisma.sql`
        WITH expired AS (
          SELECT "id" FROM "GitHubConnectAttempt" WHERE "expiresAt" <= ${now}
          ORDER BY "expiresAt" LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED
        ), deleted AS (
          DELETE FROM "GitHubConnectAttempt" USING expired WHERE "GitHubConnectAttempt"."id" = expired."id" RETURNING 1
        ) SELECT count(*)::int AS count FROM deleted`,
    },
    {
      counter: "deliveriesDeleted",
      pending: Prisma.sql`EXISTS (SELECT 1 FROM "GitHubWebhookDelivery" WHERE "expiresAt" <= ${now})`,
      query: Prisma.sql`
        WITH expired AS (
          SELECT "id" FROM "GitHubWebhookDelivery" WHERE "expiresAt" <= ${now}
          ORDER BY "expiresAt" LIMIT ${BATCH_SIZE} FOR UPDATE SKIP LOCKED
        ), deleted AS (
          DELETE FROM "GitHubWebhookDelivery" USING expired WHERE "GitHubWebhookDelivery"."id" = expired."id" RETURNING 1
        ) SELECT count(*)::int AS count FROM deleted`,
    },
    connectionBatch(now, Prisma.sql`"refreshExpiresAt"`, Prisma.empty),
    connectionBatch(now, Prisma.sql`"refreshLeaseExpiresAt"`, Prisma.sql`AND "refreshLeaseId" IS NOT NULL`),
  ];
}

async function boundedQuery<T>(client: PrismaClient, query: Prisma.Sql): Promise<T> {
  return client.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('statement_timeout', '2000', true), set_config('lock_timeout', '500', true)`;
    return tx.$queryRaw<T>(query);
  }, { maxWait: 1000, timeout: 5000 });
}

export async function cleanupExpiredConnections(client: PrismaClient, input: { now: Date; monotonicNow?: () => number }): Promise<CleanupResult> {
  const clock = input.monotonicNow ?? (() => performance.now());
  const deadline = clock() + RUN_BUDGET_MS;
  const batches = cleanupBatches(input.now);
  const counts: CleanupCounts = { attemptsDeleted: 0, deliveriesDeleted: 0, connectionsExpired: 0 };
  let pending = batches;
  let cleanupBatchesRun = 0;
  for (let round = 0; round < MAX_ROUNDS && pending.length && clock() < deadline; round++) {
    const next: Batch[] = [];
    for (const batch of pending) {
      if (clock() >= deadline) break;
      const [result] = await boundedQuery<{ count: number }[]>(client, batch.query);
      counts[batch.counter] += result.count;
      cleanupBatchesRun++;
      if (result.count === BATCH_SIZE) next.push(batch);
    }
    pending = next;
  }
  const [remaining] = await boundedQuery<{ pending: boolean }[]>(client,
    Prisma.sql`SELECT (${Prisma.join(batches.map(batch => batch.pending), " OR ")}) AS pending`);
  return { ...counts, cleanupComplete: !remaining.pending, cleanupBatches: cleanupBatchesRun };
}
