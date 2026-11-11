import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { MaintenanceResult, Vault } from "./contracts";
import { createGitHubStore } from "./store.server";
import { cleanupExpiredConnections } from "./maintenance-cleanup.server";

export async function maintainConnections(client: PrismaClient, input: { now: Date; vault: Vault | null; rotate: boolean }): Promise<MaintenanceResult> {
  if (input.rotate && !input.vault) throw new Error("GitHub vault configuration required for rotation");
  const result = { ...await cleanupExpiredConnections(client, input), credentialsRotated: 0 };
  if (!input.rotate) return result;
  const store = createGitHubStore(client);
  let after = "";
  for (;;) {
    const rows = await client.gitHubConnection.findMany({ where: { userId: { gt: after } }, orderBy: { userId: "asc" }, take: 100 });
    if (!rows.length) break;
    for (const row of rows) {
      after = row.userId;
      if (row.accessToken && (row.refreshExpiresAt && row.refreshExpiresAt <= input.now || row.refreshLeaseId && row.refreshLeaseExpiresAt && row.refreshLeaseExpiresAt <= input.now)) {
        if (await store.stop(row.userId, row.revision, input.now, { tokenVersion: row.tokenVersion })) result.connectionsExpired++;
        continue;
      }
      if (!input.vault || !row.accessToken || !row.refreshToken) continue;
      const accessToken = input.vault.seal(input.vault.open(row.accessToken, `access:${row.userId}`), `access:${row.userId}`);
      const refreshToken = input.vault.seal(input.vault.open(row.refreshToken, `refresh:${row.userId}`), `refresh:${row.userId}`);
      const changed = await client.gitHubConnection.updateMany({ where: { userId: row.userId, revision: row.revision, tokenVersion: row.tokenVersion,
        accessToken: row.accessToken, refreshToken: row.refreshToken }, data: { accessToken, refreshToken } });
      result.credentialsRotated += changed.count;
    }
  }
  if (input.vault) {
    const vault = input.vault;
    let afterAttempt = "";
    for (;;) {
      const rows = await client.gitHubConnectAttempt.findMany({ where: { id: { gt: afterAttempt } }, orderBy: { id: "asc" }, take: 100 });
      if (!rows.length) break;
      for (const row of rows) {
        afterAttempt = row.id;
        const draft = row.draft ? vault.seal(vault.open(row.draft, `draft:${row.userId}:${row.id}`), `draft:${row.userId}:${row.id}`) : null;
        const verifier = row.verifier ? vault.seal(vault.open(row.verifier, `verifier:${row.userId}:${row.id}`), `verifier:${row.userId}:${row.id}`) : null;
        await client.gitHubConnectAttempt.updateMany({ where: { id: row.id, draft: row.draft, verifier: row.verifier }, data: { draft, verifier } });
      }
    }
  }
  return result;
}
