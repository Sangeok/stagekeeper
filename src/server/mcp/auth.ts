// auth.ts — withMcpAuth의 verifyToken. 토큰 조회를 주입받아 DB 없이 테스트한다.
import type { AuthInfo } from "@modelcontextprotocol/server";
import { hashToken, parseBearer } from "@harness/core/token.mjs";

export type TokenRow = { id: string; projectId: string; revokedAt: Date | null } | null;

export function makeVerifyToken(findByHash: (hash: string) => Promise<TokenRow>) {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    const plain = parseBearer(bearer ? `Bearer ${bearer}` : null);
    if (!plain) return undefined;
    const row = await findByHash(hashToken(plain));
    if (!row || row.revokedAt) return undefined;
    return { token: plain, scopes: ["agent"], clientId: row.projectId, extra: { projectId: row.projectId, tokenId: row.id } };
  };
}
