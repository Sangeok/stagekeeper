// 주체 판정 → 프로젝트 접근 → 런북 판 기록. DB 작업을 주입받아 인증 실패가 쓰기를 막는지 DB 없이 검증한다
// (templates-query.ts와 같은 모양 — 두 경로가 같은 주체 판정을 쓴다).
// hu_는 프로젝트를 **본문**으로 받는다: 이 경로에는 쿼리 문자열이 없고, route는 배선만 하므로
// 꺼내는 일도 여기서 한다(versionOf와 같은 자리).
import { isRunbookVersion } from "@harness/core/runbook.mjs";
import { resolveRestScope, type RestTokenDeps } from "./rest-scope";
import type { ProjectAccess } from "./entitlement";

export type RunbookResult = { ok: true } | { ok: false; status: 400 | 401 | 403; reason: string };

export type RunbookDeps = RestTokenDeps & {
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
  // 모양 규칙은 개요의 runbook 입력과 같은 것을 쓴다(packages/core/runbook.mjs).
  return isRunbookVersion(value) ? value : null;
};

// hu_ 전용. 빈 문자열은 슬러그가 아니므로 없는 것으로 친다 — PROJECT_REQUIRED가 고치는 법을 말한다.
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
    // 선택되지 않은 프로젝트는 템플릿도 못 받는다. 받지도 못한 판을 기록으로 남기지 않는다.
    if (!access.available) return { ok: false, status: 403, reason: access.reason };

    const version = versionOf(body);
    if (version === null) return { ok: false, status: 400, reason: "version must be 12 lowercase hex characters" };

    await deps.saveRunbookVersion(scope.projectId, version);
    return { ok: true };
  };
}
