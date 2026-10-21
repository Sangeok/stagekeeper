import { hashToken, parseBearer } from "@harness/core/token.mjs";
import { isTokenActive } from "@harness/core/token-validity.mjs";
import { tryRecordTokenUsage } from "@/server/tokens/api";
import { type TokenUsageRecorder } from "@/server/tokens/contracts";
import { NOT_YOURS, PROJECT_REQUIRED } from "@/server/projects/api";

export type RestTokenDeps = {
  findTokenByHash(hash: string): Promise<{ id: string; projectId: string; revokedAt: Date | null; expiresAt: Date | null } | null>;
  findUserTokenByHash?(hash: string): Promise<{ id: string; userId: string; revokedAt: Date | null; expiresAt: Date | null } | null>;
  projectFor?(slug: string, userId: string): Promise<string | null>;
  recordTokenUsage?: TokenUsageRecorder;
};

export type RestScope = { ok: true; projectId: string; tokenId: string } | { ok: false; status: 401 | 403; reason: string };

export async function resolveRestScope(
  deps: RestTokenDeps,
  authorizationHeader: string | null,
  slug: string | null,
): Promise<RestScope> {

  const agentPlain = parseBearer(authorizationHeader);
  if (agentPlain) {
    const row = await deps.findTokenByHash(hashToken(agentPlain));
    const at = new Date();
    if (!row || !isTokenActive(row, at)) return { ok: false, status: 401, reason: "invalid or revoked token" };
    await tryRecordTokenUsage(deps.recordTokenUsage, "agent", row.id, at);
    return { ok: true, projectId: row.projectId, tokenId: row.id };
  }

  const findUser = deps.findUserTokenByHash;
  const projectFor = deps.projectFor;
  const userPlain = findUser && projectFor ? parseBearer(authorizationHeader, "user") : null;
  if (!userPlain) return { ok: false, status: 401, reason: "bearer token required" };

  const userRow = await findUser!(hashToken(userPlain));
  const at = new Date();
  if (!userRow || !isTokenActive(userRow, at)) return { ok: false, status: 401, reason: "invalid or revoked token" };
  await tryRecordTokenUsage(deps.recordTokenUsage, "user", userRow.id, at);
  if (slug === null) return { ok: false, status: 401, reason: PROJECT_REQUIRED };

  const projectId = await projectFor!(slug, userRow.userId);
  if (projectId === null) return { ok: false, status: 403, reason: NOT_YOURS };
  return { ok: true, projectId, tokenId: userRow.id };
}

export type UserScope = { ok: true; userId: string } | { ok: false; status: 401; reason: string };

export async function resolveUserScope(
  findUserTokenByHash: (hash: string) => Promise<{ id: string; userId: string; revokedAt: Date | null; expiresAt: Date | null } | null>,
  authorizationHeader: string | null,
  recordUsage?: TokenUsageRecorder,
): Promise<UserScope> {
  const plain = parseBearer(authorizationHeader, "user");
  if (!plain) return { ok: false, status: 401, reason: "user token required" };
  const row = await findUserTokenByHash(hashToken(plain));
  const at = new Date();
  if (!row || !isTokenActive(row, at)) return { ok: false, status: 401, reason: "invalid or revoked token" };
  await tryRecordTokenUsage(recordUsage, "user", row.id, at);
  return { ok: true, userId: row.userId };
}
