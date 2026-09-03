// templates.ts — 에이전트·규약 템플릿 배포. 원문은 DB에 있고 플러그인에는 없다(공개 저장소 노출 방지).
// 파일로 나가는 것은 스텁(첫 단계 앞까지)뿐이다 — 단계 본문은 agent_next가 한 번에 하나씩 준다.
// 무엇을 내려줄지(스텁 자르기·플랜 밖 에이전트 제외·Free runbook)는 packages/core/deliver.mjs 하나가 정하고,
// 여기는 토큰 → 프로젝트 → 플랜을 찾아 그 함수에 넣는다. 토큰 검증은 MCP와 같은 규칙이지만 AuthInfo가 필요 없어 직접 한다.
import "server-only";
import { deliverable } from "@harness/core/deliver.mjs";
import { hashToken, parseBearer } from "@harness/core/token.mjs";
import { prisma } from "@/server/db";
import { projectAccess, type Plan } from "@/server/entitlement";

export type TemplateResult =
  | { ok: true; templates: Record<string, string>; entitlement: { plan: Plan; agents: string[] } }
  | { ok: false; status: 401 | 403 | 404; reason: string };

export async function templatesFor(authorization: string | null, lang: string): Promise<TemplateResult> {
  const plain = parseBearer(authorization);
  if (!plain) return { ok: false, status: 401, reason: "bearer token required" };

  const token = await prisma.projectToken.findUnique({
    where: { hash: hashToken(plain) },
    select: { revokedAt: true, projectId: true },
  });
  if (!token || token.revokedAt) return { ok: false, status: 401, reason: "invalid or revoked token" };

  // 잠긴 프로젝트(플랜 상한 밖)는 MCP와 같이 401 + 사유 — 플랜을 올리면 같은 토큰으로 다시 열린다.
  const access = await projectAccess(token.projectId);
  if (access.locked) return { ok: false, status: 401, reason: access.reason };

  const rows = await prisma.template.findMany({ where: { lang }, select: { path: true, body: true } });
  if (!rows.length) return { ok: false, status: 404, reason: `no templates for language: ${lang}` };

  return { ok: true, ...deliverable(rows, access.plan) };
}
