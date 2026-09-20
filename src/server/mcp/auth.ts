// auth.ts — withMcpAuth의 verifyToken. 토큰 조회를 주입받아 DB 없이 테스트한다.
// 두 검증기는 서로의 토큰을 받지 않는다 — parseBearer의 접두 검사가 표를 조회하기 전에 거른다.
import type { AuthInfo } from "@modelcontextprotocol/server";
import { hashToken, parseBearer } from "@harness/core/token.mjs";

export type TokenRow = { id: string; projectId: string; revokedAt: Date | null } | null;
export type OwnerTokenRow = { id: string; projectId: string; userId: string; revokedAt: Date | null } | null;
export type UserTokenRow = { id: string; userId: string; revokedAt: Date | null } | null;

// 에이전트 서버는 두 자격을 받는다. hs_는 프로젝트를 알고, hu_는 사람만 안다 —
// 프로젝트는 도구 인자로 오고 scope()가 호출마다 ownerUserId로 인가한다.
// 접두가 먼저 갈리므로 표 조회는 해당하는 한 곳만 간다. ho_는 어느 쪽 파싱도 통과하지 못한다.
export function makeVerifyToken(
  findByHash: (hash: string) => Promise<TokenRow>,
  findUserByHash?: (hash: string) => Promise<UserTokenRow>,
) {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    const header = bearer ? `Bearer ${bearer}` : null;
    const plain = parseBearer(header);
    if (plain) {
      const row = await findByHash(hashToken(plain));
      if (!row || row.revokedAt) return undefined;
      return { token: plain, scopes: ["agent"], clientId: row.projectId, extra: { projectId: row.projectId, tokenId: row.id } };
    }
    // hu_. clientId는 프로젝트가 없으므로 토큰 id다 — 소비자는 없지만 값을 비워 두지 않는다(A-2).
    const userPlain = findUserByHash ? parseBearer(header, "user") : null;
    if (!userPlain) return undefined;
    const userRow = await findUserByHash!(hashToken(userPlain));
    if (!userRow || userRow.revokedAt) return undefined;
    return { token: userPlain, scopes: ["agent"], clientId: userRow.id, extra: { userId: userRow.userId, tokenId: userRow.id } };
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
