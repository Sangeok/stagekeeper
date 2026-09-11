// 토큰 → 프로젝트 접근 → 런북 판 기록. DB 작업을 주입받아 인증 실패가 쓰기를 막는지 DB 없이 검증한다
// (templates-query.ts와 같은 모양 — 두 경로가 같은 토큰을 쓴다).
import { hashToken, parseBearer } from "@harness/core/token.mjs";
import type { ProjectAccess } from "./entitlement";

export type RunbookResult = { ok: true } | { ok: false; status: 400 | 401 | 403; reason: string };

export type RunbookDeps = {
  findTokenByHash(hash: string): Promise<{ projectId: string; revokedAt: Date | null } | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  saveRunbookVersion(projectId: string, version: string): Promise<void>;
};

// runbookVersion이 내는 모양 그대로. 여기서 막지 않으면 아무 문자열이나 열에 앉아 영원히 "현재"가 된다.
const VERSION = /^[0-9a-f]{12}$/;

const versionOf = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as { version?: unknown }).version;
  return typeof value === "string" && VERSION.test(value) ? value : null;
};

type RecordRunbook = (authorizationHeader: string | null, body: unknown) => Promise<RunbookResult>;

export function makeRecordRunbook(deps: RunbookDeps): RecordRunbook {
  return async function recordRunbook(authorizationHeader, body) {
    const rawToken = parseBearer(authorizationHeader);
    if (!rawToken) return { ok: false, status: 401, reason: "bearer token required" };

    const tokenRecord = await deps.findTokenByHash(hashToken(rawToken));
    if (!tokenRecord || tokenRecord.revokedAt) return { ok: false, status: 401, reason: "invalid or revoked token" };

    const access = await deps.projectAccess(tokenRecord.projectId);
    // 잠긴 프로젝트는 템플릿도 못 받는다. 받지도 못한 판을 기록으로 남기지 않는다.
    if (access.locked) return { ok: false, status: 403, reason: access.reason };

    const version = versionOf(body);
    if (version === null) return { ok: false, status: 400, reason: "version must be 12 lowercase hex characters" };

    await deps.saveRunbookVersion(tokenRecord.projectId, version);
    return { ok: true };
  };
}
