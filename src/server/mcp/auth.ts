// auth.ts — withMcpAuth의 verifyToken. 토큰 조회를 주입받아 DB 없이 테스트한다.
// 두 검증기는 서로의 토큰을 받지 않는다 — parseBearer의 접두 검사가 표를 조회하기 전에 거른다.
import type { AuthInfo } from "@modelcontextprotocol/server";
import { hashToken, parseBearer } from "@harness/core/token.mjs";

export type TokenRow = { id: string; projectId: string; revokedAt: Date | null } | null;
export type OwnerTokenRow = { id: string; projectId: string; userId: string; revokedAt: Date | null } | null;

export function makeVerifyToken(findByHash: (hash: string) => Promise<TokenRow>) {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    const plain = parseBearer(bearer ? `Bearer ${bearer}` : null);
    if (!plain) return undefined;
    const row = await findByHash(hashToken(plain));
    if (!row || row.revokedAt) return undefined;
    return { token: plain, scopes: ["agent"], clientId: row.projectId, extra: { projectId: row.projectId, tokenId: row.id } };
  };
}

// 소유자 토큰(ho_). extra에 userId가 실린다 — 게이트 이벤트의 actorId가 웹과 같은 사람이 되게.
export function makeVerifyOwnerToken(findByHash: (hash: string) => Promise<OwnerTokenRow>) {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    const plain = parseBearer(bearer ? `Bearer ${bearer}` : null, "owner");
    if (!plain) return undefined;
    const row = await findByHash(hashToken(plain));
    if (!row || row.revokedAt) return undefined;
    return { token: plain, scopes: ["owner"], clientId: row.projectId, extra: { projectId: row.projectId, userId: row.userId, ownerTokenId: row.id } };
  };
}
