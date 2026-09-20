// 토큰 → 프로젝트 접근 → 프로젝트 정체. DB 작업을 주입받아 인증 실패 시 조회가 차단되는지 검증한다.
// `/harness:init`이 harness.json 초안의 project 블록을 만들 때 쓴다 — 사용자가 웹 생성 폼에 이미 넣은 값이다.
// **language는 담지 않는다.** Project.language의 기본값은 "ko"인데(schema.prisma) 시드된 템플릿은 en뿐이고
// /api/templates에는 fallback이 없다 — 그 값을 harness.json으로 옮기면 첫 연결이 404로 깨진다.
import { hashToken, parseBearer } from "@harness/core/token.mjs";
import type { ProjectAccess } from "./entitlement";
import { OWNERSHIP_UNAVAILABLE_REASON, repositoryOwner } from "./project-access-query";

export type ProjectIdentity = { owner: string; repo: string; branch: string; name: string };

export type ProjectIdentityResult =
  | { ok: true; project: ProjectIdentity }
  | { ok: false; status: 401 | 403; reason: string };

export type ProjectIdentityDeps = {
  findTokenByHash(hash: string): Promise<{ projectId: string; revokedAt: Date | null } | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  findProjectIdentity(projectId: string): Promise<{ repoOwner: string | null; repo: string; branch: string; name: string } | null>;
};

type ProjectIdentityFor = (authorizationHeader: string | null) => Promise<ProjectIdentityResult>;

export function makeProjectIdentityFor(deps: ProjectIdentityDeps): ProjectIdentityFor {
  return async function projectIdentityFor(authorizationHeader) {
    // parseBearer는 기본 kind가 "agent"다 — hs_ 접두만 통과하므로 소유자 토큰(ho_)은 여기서 떨어진다.
    // kind를 넘기지 않는다: "owner"를 넘기면 에이전트 토큰이 거부되고 소유자 토큰이 통과한다.
    const rawToken = parseBearer(authorizationHeader);
    if (!rawToken) {
      return { ok: false, status: 401, reason: "bearer token required" };
    }

    const tokenRecord = await deps.findTokenByHash(hashToken(rawToken));
    if (!tokenRecord || tokenRecord.revokedAt) {
      return { ok: false, status: 401, reason: "invalid or revoked token" };
    }

    const access = await deps.projectAccess(tokenRecord.projectId);
    // 토큰 인증은 성공했다. 선택되지 않은 프로젝트는 403으로 거부하며 사유를 보존한다 —
    // templates·runbook과 같은 가족이다(invariants.md "선택되지 않은 프로젝트의 연결은 보존한다").
    if (!access.available) {
      return { ok: false, status: 403, reason: access.reason };
    }

    const row = await deps.findProjectIdentity(tokenRecord.projectId);
    // access가 통과했으면 소유권은 이미 확인됐다. 그 사이에 사라진 경우만 여기로 온다.
    if (!row) {
      return { ok: false, status: 403, reason: OWNERSHIP_UNAVAILABLE_REASON };
    }

    return {
      ok: true,
      project: { owner: repositoryOwner(row.repoOwner), repo: row.repo, branch: row.branch, name: row.name },
    };
  };
}
