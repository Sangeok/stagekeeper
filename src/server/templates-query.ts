// 토큰 → 프로젝트 접근 → 템플릿 조회. DB 작업을 주입받아 인증 실패 시 조회가 차단되는지 검증한다.
// 배포할 본문(에이전트 스텁·플랜별 에이전트·Free runbook)은 deliverable이 결정한다.
import { deliverable } from "@harness/core/deliver.mjs";
import { hashToken, parseBearer } from "@harness/core/token.mjs";
import type { Plan, ProjectAccess } from "./entitlement";

export type TemplateResult =
  | { ok: true; templates: Record<string, string>; entitlement: { plan: Plan; agents: string[] } }
  | { ok: false; status: 401 | 403 | 404; reason: string };

export type TemplateDeps = {
  findTokenByHash(hash: string): Promise<{ projectId: string; revokedAt: Date | null } | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  findTemplatesByLanguage(language: string): Promise<{ path: string; body: string }[]>;
};

type TemplatesFor = (authorizationHeader: string | null, language: string) => Promise<TemplateResult>;

export function makeTemplatesFor(deps: TemplateDeps): TemplatesFor {
  return async function templatesFor(authorizationHeader, language) {
    const rawToken = parseBearer(authorizationHeader);
    if (!rawToken) {
      return { ok: false, status: 401, reason: "bearer token required" };
    }

    const tokenRecord = await deps.findTokenByHash(hashToken(rawToken));
    if (!tokenRecord || tokenRecord.revokedAt) {
      return { ok: false, status: 401, reason: "invalid or revoked token" };
    }

    const access = await deps.projectAccess(tokenRecord.projectId);
    // 토큰 인증은 성공했다. 플랜 상한으로 잠긴 프로젝트는 403으로 거부하며 사유를 보존한다.
    if (access.locked) {
      return { ok: false, status: 403, reason: access.reason };
    }

    const templateRows = await deps.findTemplatesByLanguage(language);
    if (templateRows.length === 0) {
      return { ok: false, status: 404, reason: `no templates for language: ${language}` };
    }

    return { ok: true, ...deliverable(templateRows, access.plan) };
  };
}
