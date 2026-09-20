// REST 세 경로(/api/templates · /api/runbook · /api/project)가 공유하는 주체 판정.
// mcp/tools.ts의 scope()와 같은 갈래다: hs_는 토큰이 프로젝트를 알고, hu_는 슬러그를 인자로 받아
// 호출마다 ownerUserId로 인가한다(owner-tools.ts:38·guard.ts:15-20과 같은 술어).
//
// 세 경로가 각자 토큰 파싱을 복제하던 모양을 여기로 모은다 — hu_ 분기가 붙으면서 복제본이
// 조용히 갈릴 여지가 세 배가 되기 때문이다.
//
// **hu_ 갈래는 선택이다.** findUserTokenByHash·projectFor를 주입하지 않은 호출자에게는
// hu_가 존재하지 않는 것처럼 동작한다(makeVerifyToken의 두 번째 인자와 같은 규약) —
// 그래서 기존 주입 시험이 한 줄도 바뀌지 않고 통과한다.
import { hashToken, parseBearer } from "@harness/core/token.mjs";
import { NOT_YOURS, PROJECT_REQUIRED } from "./scope-copy";

export type RestTokenDeps = {
  findTokenByHash(hash: string): Promise<{ projectId: string; revokedAt: Date | null } | null>;
  findUserTokenByHash?(hash: string): Promise<{ userId: string; revokedAt: Date | null } | null>;
  projectFor?(slug: string, userId: string): Promise<string | null>;
};

export type RestScope = { ok: true; projectId: string } | { ok: false; status: 401 | 403; reason: string };

// 슬러그는 경로마다 다른 곳에서 온다 — 쿼리 문자열(templates·project) 또는 본문(runbook).
// 꺼내는 일은 호출부가 하고, 판정은 여기가 한다.
export async function resolveRestScope(
  deps: RestTokenDeps,
  authorizationHeader: string | null,
  slug: string | null,
): Promise<RestScope> {
  // 첫 가지는 기존 경로 그대로다 — hs_의 동작이 한 줄도 바뀌지 않는다.
  const agentPlain = parseBearer(authorizationHeader);
  if (agentPlain) {
    const row = await deps.findTokenByHash(hashToken(agentPlain));
    if (!row || row.revokedAt) return { ok: false, status: 401, reason: "invalid or revoked token" };
    return { ok: true, projectId: row.projectId };
  }

  const findUser = deps.findUserTokenByHash;
  const projectFor = deps.projectFor;
  // 접두가 hu_가 아니거나 hu_를 받지 않는 배포면 여기서 끝난다 — DB를 건드리지 않는다.
  const userPlain = findUser && projectFor ? parseBearer(authorizationHeader, "user") : null;
  if (!userPlain) return { ok: false, status: 401, reason: "bearer token required" };

  const userRow = await findUser!(hashToken(userPlain));
  if (!userRow || userRow.revokedAt) return { ok: false, status: 401, reason: "invalid or revoked token" };
  // 토큰은 멀쩡하지만 가리킬 프로젝트가 없다. 고치는 법을 문장이 들고 있다(A-8의 전환 경로).
  if (slug === null) return { ok: false, status: 401, reason: PROJECT_REQUIRED };

  const projectId = await projectFor!(slug, userRow.userId);
  // 없는 슬러그와 남의 프로젝트를 같은 답으로 돌려준다 — 존재 여부를 흘리지 않는다(guard.ts:14).
  if (projectId === null) return { ok: false, status: 403, reason: NOT_YOURS };
  return { ok: true, projectId };
}

// 사람만 식별한다. 프로젝트를 **아직 만들기 전**인 경로(POST /api/projects)가 쓴다.
//
// resolveRestScope를 확장하지 않는 이유가 둘이다.
// 1. 그쪽은 반환 계약이 `{ projectId }`라 프로젝트가 없는 호출을 표현할 수 없고,
//    슬러그가 없으면 PROJECT_REQUIRED로 떨어진다(위 :46) — 등록 경로에는 정확히 반대다.
// 2. **hs_를 받으면 안 된다.** 프로젝트 토큰으로 새 프로젝트를 만드는 것은 말이 안 되고,
//    resolveRestScope는 hs_를 첫 가지로 통과시킨다. 여기서는 hu_만 통과한다.
export type UserScope = { ok: true; userId: string } | { ok: false; status: 401; reason: string };

export async function resolveUserScope(
  findUserTokenByHash: (hash: string) => Promise<{ userId: string; revokedAt: Date | null } | null>,
  authorizationHeader: string | null,
): Promise<UserScope> {
  const plain = parseBearer(authorizationHeader, "user");
  // hs_·ho_·형식 오류·헤더 없음이 모두 여기로 떨어진다. DB는 건드리지 않는다.
  if (!plain) return { ok: false, status: 401, reason: "user token required" };
  const row = await findUserTokenByHash(hashToken(plain));
  if (!row || row.revokedAt) return { ok: false, status: 401, reason: "invalid or revoked token" };
  return { ok: true, userId: row.userId };
}
