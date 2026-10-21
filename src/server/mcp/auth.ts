import type { AuthInfo } from "@modelcontextprotocol/server";
import { hashToken, parseBearer } from "@harness/core/token.mjs";
import { isTokenActive } from "@harness/core/token-validity.mjs";
import { tryRecordTokenUsage } from "@/server/tokens/api";
import { type TokenUsageRecorder } from "@/server/tokens/contracts";

export type TokenRow = { id: string; projectId: string; revokedAt: Date | null; expiresAt: Date | null } | null;
export type OwnerTokenRow = { id: string; projectId: string; userId: string; revokedAt: Date | null; expiresAt: Date | null } | null;
export type UserTokenRow = { id: string; userId: string; revokedAt: Date | null; expiresAt: Date | null } | null;
type TokenVerifier = (request: Request, bearer?: string) => Promise<AuthInfo | undefined>;

async function findCredential<T>(lookup: (hash: string) => Promise<T>, hash: string): Promise<T> {
  try {
    return await lookup(hash);
  } catch {
    throw new Error("Token credential lookup failed");
  }
}

export function makeVerifyToken(
  findByHash: (hash: string) => Promise<TokenRow>,
  findUserByHash?: (hash: string) => Promise<UserTokenRow>,
  recordUsage?: TokenUsageRecorder,
): TokenVerifier {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    const header = bearer ? `Bearer ${bearer}` : null;
    const plain = parseBearer(header);
    if (plain) {
      const row = await findCredential(findByHash, hashToken(plain));
      const at = new Date();
      if (!row || !isTokenActive(row, at)) return undefined;
      await tryRecordTokenUsage(recordUsage, "agent", row.id, at);
      return { token: plain, scopes: ["agent"], clientId: row.projectId, extra: { projectId: row.projectId, tokenId: row.id } };
    }
    const userPlain = findUserByHash ? parseBearer(header, "user") : null;
    if (!userPlain) return undefined;
    const userRow = await findCredential(findUserByHash!, hashToken(userPlain));
    const at = new Date();
    if (!userRow || !isTokenActive(userRow, at)) return undefined;
    await tryRecordTokenUsage(recordUsage, "user", userRow.id, at);
    return { token: userPlain, scopes: ["agent"], clientId: userRow.id, extra: { userId: userRow.userId, tokenId: userRow.id } };
  };
}

export function makeVerifyOwnerToken(findByHash: (hash: string) => Promise<OwnerTokenRow>, recordUsage?: TokenUsageRecorder): TokenVerifier {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    const plain = parseBearer(bearer ? `Bearer ${bearer}` : null, "owner");
    if (!plain) return undefined;
    const row = await findCredential(findByHash, hashToken(plain));
    const at = new Date();
    if (!row || !isTokenActive(row, at)) return undefined;
    await tryRecordTokenUsage(recordUsage, "owner", row.id, at);
    return { token: plain, scopes: ["owner"], clientId: row.projectId, extra: { projectId: row.projectId, userId: row.userId, ownerTokenId: row.id } };
  };
}
