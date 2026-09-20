// 주체 판정 → 프로젝트 접근 → 프로젝트 정체. DB 작업을 주입받아 인증 실패 시 조회가 차단되는지 검증한다.
// `/harness:init`이 harness.json 초안의 project 블록을 만들 때 쓴다 — 사용자가 웹 생성 폼에 이미 넣은 값이다.
// **language는 담지 않는다.** Project.language의 기본값은 "ko"인데(schema.prisma) 시드된 템플릿은 en뿐이고
// /api/templates에는 fallback이 없다 — 그 값을 harness.json으로 옮기면 첫 연결이 404로 깨진다.
//
// hu_에서는 이 경로의 뜻이 뒤집힌다: hs_는 "이 토큰은 어느 프로젝트냐"를 묻고,
// hu_는 ?project=<slug>로 "이 프로젝트를 확인해 달라"를 묻는다. 첫 연결에는 슬러그가 없으므로
// 그 경로는 C(git remote 기반 조회·등록)가 채운다.
import { resolveRestScope, type RestTokenDeps } from "./rest-scope";
import type { ProjectAccess } from "./entitlement";
import { OWNERSHIP_UNAVAILABLE_REASON, repositoryOwner } from "./project-access-query";

// slug는 harness.json의 project.slug가 된다 — hu_ 호출이 프로젝트를 지목하는 유일한 값이다(A-8).
export type ProjectIdentity = { owner: string; repo: string; branch: string; name: string; slug: string };

export type ProjectIdentityResult =
  | { ok: true; project: ProjectIdentity }
  | { ok: false; status: 401 | 403; reason: string };

export type ProjectIdentityDeps = RestTokenDeps & {
  projectAccess(projectId: string): Promise<ProjectAccess>;
  findProjectIdentity(projectId: string): Promise<{ repoOwner: string | null; repo: string; branch: string; name: string; slug: string } | null>;
};

type ProjectIdentityFor = (authorizationHeader: string | null, project?: string | null) => Promise<ProjectIdentityResult>;

export function makeProjectIdentityFor(deps: ProjectIdentityDeps): ProjectIdentityFor {
  return async function projectIdentityFor(authorizationHeader, project = null) {
    // 주체 판정은 rest-scope.ts 한 곳이다 — hs_(hs_ 접두)가 첫 가지라 기존 동작이 그대로다.
    // hu_를 받지 않는 주입에서는 hu_가 존재하지 않는 것처럼 동작한다.
    const scope = await resolveRestScope(deps, authorizationHeader, project);
    if (!scope.ok) return scope;

    const access = await deps.projectAccess(scope.projectId);
    // 토큰 인증은 성공했다. 선택되지 않은 프로젝트는 403으로 거부하며 사유를 보존한다 —
    // templates·runbook과 같은 가족이다(invariants.md "선택되지 않은 프로젝트의 연결은 보존한다").
    if (!access.available) {
      return { ok: false, status: 403, reason: access.reason };
    }

    const row = await deps.findProjectIdentity(scope.projectId);
    // access가 통과했으면 소유권은 이미 확인됐다. 그 사이에 사라진 경우만 여기로 온다.
    if (!row) {
      return { ok: false, status: 403, reason: OWNERSHIP_UNAVAILABLE_REASON };
    }

    return {
      ok: true,
      project: { owner: repositoryOwner(row.repoOwner), repo: row.repo, branch: row.branch, name: row.name, slug: row.slug },
    };
  };
}
