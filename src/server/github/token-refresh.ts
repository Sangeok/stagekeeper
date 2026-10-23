import { randomUUID } from "node:crypto";
import type { Credentials, Dependencies, Result } from "./contracts";
import { failure } from "./failure";

export function sealCredentials(deps: Dependencies, userId: string, credentials: Credentials): Credentials {
  return { ...credentials, accessToken: deps.vault.seal(credentials.accessToken, `access:${userId}`),
    refreshToken: deps.vault.seal(credentials.refreshToken, `refresh:${userId}`) };
}

export async function accessTokenFor(deps: Dependencies, userId: string): Promise<Result<{ token: string; revision: number }>> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const connection = await deps.store.connection(userId);
    if (!connection || connection.revokedAt || !connection.accessToken || !connection.refreshToken) return failure("REAUTH_REQUIRED");
    const now = deps.now();
    if (connection.accessExpiresAt && connection.accessExpiresAt.getTime() > now.getTime() + 30000 && !connection.refreshLeaseId) {
      try {
        return { ok: true, value: { token: deps.vault.open(connection.accessToken, `access:${userId}`), revision: connection.revision } };
      } catch { return failure("UNAVAILABLE"); }
    }
    if (connection.refreshLeaseId) {
      if (!connection.refreshLeaseExpiresAt || connection.refreshLeaseExpiresAt <= now) {
        await deps.store.stop(userId, connection.revision, now, { tokenVersion: connection.tokenVersion });
        return failure("REAUTH_REQUIRED");
      }
      await deps.wait(100);
      continue;
    }
    if (!connection.refreshExpiresAt || connection.refreshExpiresAt <= now) {
      await deps.store.stop(userId, connection.revision, now, { tokenVersion: connection.tokenVersion });
      return failure("REAUTH_REQUIRED");
    }
    let refreshToken: string;
    try { refreshToken = deps.vault.open(connection.refreshToken, `refresh:${userId}`); }
    catch { return failure("UNAVAILABLE"); }
    const leaseId = randomUUID();
    if (!await deps.store.claimRefresh({ connection, leaseId, expiresAt: new Date(now.getTime() + 30000) })) continue;
    const result = await deps.provider.refresh(refreshToken);
    if (!result.ok) {
      await deps.store.stop(userId, connection.revision, deps.now(), { tokenVersion: connection.tokenVersion });
      return failure("REAUTH_REQUIRED");
    }
    let retained = false;
    try {
      retained = deps.enabled() && await deps.store.finishRefresh({ connection, leaseId, credentials: sealCredentials(deps, userId, result.value) });
      return retained ? { ok: true, value: { token: result.value.accessToken, revision: connection.revision } } : failure("STALE_CONNECTION");
    } catch {
      await deps.store.stop(userId, connection.revision, deps.now(), { tokenVersion: connection.tokenVersion });
      return failure("REAUTH_REQUIRED");
    } finally {
      if (!retained) await deps.provider.revoke(result.value.accessToken);
    }
  }
  return failure("UNAVAILABLE");
}
