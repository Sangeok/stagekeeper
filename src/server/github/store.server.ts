import "server-only";
import type { GitHubConnectAttempt, Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Attempt, Store } from "./contracts";

function attemptRecord(row: GitHubConnectAttempt | null): Attempt | null {
  return row && (row.kind === "authorization" || row.kind === "installation") ? { ...row, kind: row.kind } : null;
}

function stoppedConnection(now: Date) {
  return { revision: { increment: 1 }, tokenVersion: { increment: 1 }, revokedAt: now, accessToken: null, refreshToken: null,
    accessExpiresAt: null, refreshExpiresAt: null, refreshLeaseId: null, refreshLeaseExpiresAt: null };
}

async function lockConnection(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "userId" FROM "GitHubConnection" WHERE "userId" = ${userId} FOR UPDATE`;
}

export function createGitHubStore(client: PrismaClient): Store {
  return {
    connection: userId => client.gitHubConnection.findUnique({ where: { userId } }),
    beginAttempt: (attempt, githubId) => client.$transaction(async tx => {
      await tx.gitHubConnection.upsert({ where: { userId: attempt.userId }, create: { userId: attempt.userId, githubId }, update: {} });
      await lockConnection(tx, attempt.userId);
      const connection = await tx.gitHubConnection.findUniqueOrThrow({ where: { userId: attempt.userId } });
      await tx.gitHubConnectAttempt.updateMany({ where: { userId: attempt.userId, browserHash: attempt.browserHash },
        data: { status: "superseded", draft: null, verifier: null } });
      const row = await tx.gitHubConnectAttempt.create({ data: { ...attempt, expectedRevision: connection.revision } });
      return { ...attempt, expectedRevision: row.expectedRevision };
    }),
    claimAttempt: input => client.$transaction(async tx => {
      const where = { stateHash: input.stateHash, userId: input.userId, browserHash: input.browserHash, kind: input.kind,
        status: "pending", expiresAt: { gt: input.now } };
      const claimed = await tx.gitHubConnectAttempt.updateMany({ where, data: { status: "exchanging" } });
      if (claimed.count !== 1) return null;
      return attemptRecord(await tx.gitHubConnectAttempt.findUnique({ where: { stateHash: input.stateHash } }));
    }),
    finishAuthorization: input => client.$transaction(async tx => {
      await lockConnection(tx, input.attempt.userId);
      const connection = await tx.gitHubConnection.findUnique({ where: { userId: input.attempt.userId } });
      if (!connection || connection.revision !== input.attempt.expectedRevision) return false;
      const revision = connection.revision + 1;
      const consumed = await tx.gitHubConnectAttempt.updateMany({ where: { id: input.attempt.id, status: "exchanging", expiresAt: { gt: input.now } },
        data: { status: "consumed", outcome: "authorized", verifier: null, expectedRevision: revision, ...(input.installationAttempt ? { draft: null } : {}) } });
      if (consumed.count !== 1) return false;
      await tx.gitHubConnection.update({ where: { userId: connection.userId }, data: { revision, tokenVersion: { increment: 1 },
        ...input.credentials, revokedAt: null, refreshLeaseId: null, refreshLeaseExpiresAt: null } });
      await tx.gitHubInstallation.deleteMany({ where: { userId: connection.userId } });
      if (input.installationIds.length) await tx.gitHubInstallation.createMany({ data: input.installationIds.map(installationId => ({ userId: connection.userId, installationId })), skipDuplicates: true });
      if (input.installationAttempt) await tx.gitHubConnectAttempt.create({ data: { ...input.installationAttempt, expectedRevision: revision } });
      return true;
    }),
    finishInstallation: input => client.$transaction(async tx => {
      await lockConnection(tx, input.attempt.userId);
      const connection = await tx.gitHubConnection.findUnique({ where: { userId: input.attempt.userId } });
      if (!connection || connection.revokedAt || !connection.accessToken || connection.revision !== input.attempt.expectedRevision) return false;
      const revision = connection.revision + 1;
      const consumed = await tx.gitHubConnectAttempt.updateMany({ where: { id: input.attempt.id, status: "exchanging", expiresAt: { gt: input.now } },
        data: { status: "consumed", outcome: "installed", verifier: null, expectedRevision: revision } });
      if (consumed.count !== 1) return false;
      await tx.gitHubConnection.update({ where: { userId: connection.userId }, data: { revision } });
      await tx.gitHubInstallation.upsert({ where: { userId_installationId: { userId: connection.userId, installationId: input.installationId } },
        create: { userId: connection.userId, installationId: input.installationId }, update: {} });
      return true;
    }),
    async failAttempt(id, outcome) {
      const result = await client.gitHubConnectAttempt.updateMany({ where: { id, status: "exchanging" }, data: { status: "failed", verifier: null, outcome } });
      if (result.count) console.info("github repository connection", { outcome });
    },
    draft: async (userId, browserHash, now, flowId) => attemptRecord(await client.gitHubConnectAttempt.findFirst({
      where: { userId, browserHash, ...(flowId ? { flowId } : {}), expiresAt: { gt: now }, status: { in: ["pending", "exchanging", "consumed", "failed"] } }, orderBy: { createdAt: "desc" },
    })),
    async acknowledge(input) {
      await client.gitHubConnectAttempt.updateMany({ where: { id: input.id, userId: input.userId, browserHash: input.browserHash, expectedRevision: input.generation }, data: { draft: null } });
    },
    async cancel(input) {
      const attempt = await client.gitHubConnectAttempt.findFirst({ where: { id: input.id, userId: input.userId, browserHash: input.browserHash }, select: { flowId: true } });
      if (!attempt) return;
      await client.gitHubConnectAttempt.updateMany({ where: { flowId: attempt.flowId, userId: input.userId, browserHash: input.browserHash },
        data: { status: "cancelled", draft: null, verifier: null } });
      console.info("github repository connection", { outcome: "cancelled" });
    },
    async claimRefresh(input) {
      const result = await client.gitHubConnection.updateMany({ where: { userId: input.connection.userId, revision: input.connection.revision,
        tokenVersion: input.connection.tokenVersion, revokedAt: null, refreshLeaseId: null },
        data: { refreshLeaseId: input.leaseId, refreshLeaseExpiresAt: input.expiresAt } });
      return result.count === 1;
    },
    async finishRefresh(input) {
      const result = await client.gitHubConnection.updateMany({ where: { userId: input.connection.userId, revision: input.connection.revision,
        tokenVersion: input.connection.tokenVersion, refreshLeaseId: input.leaseId, revokedAt: null },
        data: { ...input.credentials, tokenVersion: { increment: 1 }, refreshLeaseId: null, refreshLeaseExpiresAt: null } });
      return result.count === 1;
    },
    stop: (userId, revision, now, fence) => client.$transaction(async tx => {
      await lockConnection(tx, userId);
      const result = await tx.gitHubConnection.updateMany({ where: { userId, revision, ...(fence ? { tokenVersion: fence.tokenVersion } : {}),
        ...(fence?.refreshLeaseId === undefined ? {} : { refreshLeaseId: fence.refreshLeaseId }) }, data: stoppedConnection(now) });
      if (result.count !== 1) return false;
      await tx.gitHubConnectAttempt.updateMany({ where: { userId }, data: { status: "cancelled", draft: null, verifier: null } });
      await tx.gitHubInstallation.deleteMany({ where: { userId } });
      return true;
    }),
    rememberInstallations: (userId, revision, ids) => client.$transaction(async tx => {
      await lockConnection(tx, userId);
      const connection = await tx.gitHubConnection.findUnique({ where: { userId } });
      if (!connection || connection.revokedAt || connection.revision !== revision) return false;
      if (ids.length) await tx.gitHubInstallation.createMany({ data: ids.map(installationId => ({ userId, installationId })), skipDuplicates: true });
      return true;
    }),
    async applyWebhook(input) {
      try {
        await client.$transaction(async tx => {
          await tx.gitHubWebhookDelivery.create({ data: { id: input.deliveryId, expiresAt: input.expiresAt } });
          const connections = input.githubId
            ? await tx.gitHubConnection.findMany({ where: { githubId: input.githubId }, orderBy: { userId: "asc" } })
            : input.installationId ? await tx.gitHubConnection.findMany({ where: { installations: { some: { installationId: input.installationId } } }, orderBy: { userId: "asc" } }) : [];
          for (const connection of connections) {
            await lockConnection(tx, connection.userId);
            await tx.gitHubConnection.update({ where: { userId: connection.userId }, data: input.githubId ? stoppedConnection(input.now) : { revision: { increment: 1 } } });
            await tx.gitHubConnectAttempt.updateMany({ where: { userId: connection.userId }, data: { status: "cancelled", draft: null, verifier: null } });
            if (input.githubId) await tx.gitHubInstallation.deleteMany({ where: { userId: connection.userId } });
          }
        });
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "P2002")) throw error;
      }
    },
  };
}
