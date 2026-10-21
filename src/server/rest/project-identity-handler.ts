import { resolveRestScope, type RestTokenDeps } from "./scope";
import type { ProjectAccess } from "@/server/projects/contracts";
import type { RequestRateFailure } from "@/server/result";
import type { RestRateFailure } from "./response";
import { OWNERSHIP_UNAVAILABLE_REASON, repositoryOwner } from "@/server/projects/api";

export type ProjectIdentity = { owner: string; repo: string; branch: string; name: string; slug: string };

export type ProjectIdentityResult =
  | { ok: true; project: ProjectIdentity }
  | { ok: false; status: 401 | 403; reason: string; code?: never } | RestRateFailure;

export type ProjectIdentityDeps = RestTokenDeps & {
  requestLimit(projectId: string): Promise<RequestRateFailure | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  findProjectIdentity(projectId: string): Promise<{ repoOwner: string | null; repo: string; branch: string; name: string; slug: string } | null>;
};

type ProjectIdentityFor = (authorizationHeader: string | null, project?: string | null) => Promise<ProjectIdentityResult>;

export function makeProjectIdentityFor(deps: ProjectIdentityDeps): ProjectIdentityFor {
  return async function projectIdentityFor(authorizationHeader, project = null) {
    const scope = await resolveRestScope(deps, authorizationHeader, project);
    if (!scope.ok) return scope;

    const access = await deps.projectAccess(scope.projectId);
    if (!access.available) {
      return { ok: false, status: 403, reason: access.reason };
    }

    const limited = await deps.requestLimit(scope.projectId);
    if (limited) return { ...limited, status: 429 };
    const row = await deps.findProjectIdentity(scope.projectId);
    if (!row) {
      return { ok: false, status: 403, reason: OWNERSHIP_UNAVAILABLE_REASON };
    }

    return {
      ok: true,
      project: { owner: repositoryOwner(row.repoOwner), repo: row.repo, branch: row.branch, name: row.name, slug: row.slug },
    };
  };
}
