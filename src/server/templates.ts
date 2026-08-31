// templates.ts — 에이전트·규약 템플릿 배포. 원문은 DB에 있고 플러그인에는 없다(공개 저장소 노출 방지).
// 토큰 검증은 MCP와 같은 규칙이지만 AuthInfo가 필요 없어 여기서 직접 한다.
import "server-only";
import { hashToken, parseBearer } from "@harness/core/token.mjs";
import { prisma } from "@/server/db";

export type TemplateResult =
  | { ok: true; templates: Record<string, string> }
  | { ok: false; status: 401 | 403 | 404; reason: string };

export async function templatesFor(authorization: string | null, lang: string): Promise<TemplateResult> {
  const plain = parseBearer(authorization);
  if (!plain) return { ok: false, status: 401, reason: "bearer token required" };

  const token = await prisma.projectToken.findUnique({
    where: { hash: hashToken(plain) },
    select: { revokedAt: true },
  });
  if (!token || token.revokedAt) return { ok: false, status: 401, reason: "invalid or revoked token" };

  // 구독 검사 자리. Subscription이 생기면 만료를 403 + 결제 안내로 돌린다 — 배선은 여기 하나뿐이다.
  const rows = await prisma.template.findMany({ where: { lang }, select: { path: true, body: true } });
  if (!rows.length) return { ok: false, status: 404, reason: `no templates for language: ${lang}` };

  return { ok: true, templates: Object.fromEntries(rows.map((r) => [r.path, r.body])) };
}
