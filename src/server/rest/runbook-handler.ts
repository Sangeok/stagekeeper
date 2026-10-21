import { isRunbookVersion } from "@harness/core/runbook.mjs";
import { resolveRestScope, type RestTokenDeps } from "./scope";
import type { ProjectAccess } from "@/server/projects/contracts";
import type { RequestRateFailure } from "@/server/result";
import type { RestRateFailure } from "./response";

export type RunbookResult = { ok: true } | { ok: false; status: 400 | 401 | 403; reason: string; code?: never } | RestRateFailure;

export type RunbookDeps = RestTokenDeps & {
  requestLimit(projectId: string): Promise<RequestRateFailure | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  saveRunbookVersion(projectId: string, version: string): Promise<void>;
};

const fieldOf = (body: unknown, key: "version" | "project"): string | null => {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
};

const versionOf = (body: unknown): string | null => {
  const value = fieldOf(body, "version");
  return isRunbookVersion(value) ? value : null;
};

const projectOf = (body: unknown): string | null => {
  const value = fieldOf(body, "project");
  return value !== null && value.length > 0 ? value : null;
};

type RecordRunbook = (authorizationHeader: string | null, body: unknown) => Promise<RunbookResult>;

export function makeRecordRunbook(deps: RunbookDeps): RecordRunbook {
  return async function recordRunbook(authorizationHeader, body) {
    const scope = await resolveRestScope(deps, authorizationHeader, projectOf(body));
    if (!scope.ok) return scope;

    const access = await deps.projectAccess(scope.projectId);
    if (!access.available) return { ok: false, status: 403, reason: access.reason };

    const limited = await deps.requestLimit(scope.projectId);
    if (limited) return { ...limited, status: 429 };
    const version = versionOf(body);
    if (version === null) return { ok: false, status: 400, reason: "version must be 12 lowercase hex characters" };

    await deps.saveRunbookVersion(scope.projectId, version);
    return { ok: true };
  };
}
