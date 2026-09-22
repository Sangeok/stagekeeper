// 주체 판정 → 프로젝트 접근 → 템플릿 조회. DB 작업을 주입받아 인증 실패 시 조회가 차단되는지 검증한다.
// 주체 판정은 rest-scope.ts가 한다 — hs_는 토큰이 프로젝트를 알고, hu_는 ?project=<slug>로 받는다.
// 배포할 본문(에이전트 스텁·플랜별 보고 에이전트)은 deliverable이 결정한다. 런북은 한 판이고,
// 옛 `CLAUDE.runbook.free.md` 행이 DB에 남아 있어도 deliverable이 걸러낸다.
import { deliverable } from "@harness/core/deliver.mjs";
import type { Plan, ProjectAccess } from "./entitlement";
import { resolveRestScope, type RestTokenDeps } from "./rest-scope";

export type TemplateResult =
  | { ok: true; templates: Record<string, string>; entitlement: { plan: Plan; agents: string[] } }
  | { ok: false; status: 401 | 403 | 404; reason: string };

export type TemplateDeps = RestTokenDeps & {
  projectAccess(projectId: string): Promise<ProjectAccess>;
  findTemplatesByLanguage(language: string): Promise<{ path: string; body: string }[]>;
};

// project는 hu_ 전용이다. hs_는 토큰이 이미 알고 있으므로 넘겨도 무시된다 — 기존 호출이 그대로 통한다.
type TemplatesFor = (
  authorizationHeader: string | null,
  language: string,
  project?: string | null,
) => Promise<TemplateResult>;

export function makeTemplatesFor(deps: TemplateDeps): TemplatesFor {
  return async function templatesFor(authorizationHeader, language, project = null) {
    const scope = await resolveRestScope(deps, authorizationHeader, project);
    if (!scope.ok) return scope;

    const access = await deps.projectAccess(scope.projectId);
    // 토큰 인증은 성공했다. 선택되지 않은 프로젝트는 403으로 거부하며 사유를 보존한다.
    if (!access.available) {
      return { ok: false, status: 403, reason: access.reason };
    }

    const templateRows = await deps.findTemplatesByLanguage(language);
    if (templateRows.length === 0) {
      return { ok: false, status: 404, reason: `no templates for language: ${language}` };
    }

    return { ok: true, ...deliverable(templateRows, access.plan) };
  };
}
