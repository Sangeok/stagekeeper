// src/app/api/templates/route.ts — /harness:init이 템플릿을 받아가는 곳.
// route는 배선만 한다. 인증·조회는 @/server/templates에 있다
// (system-overview.md: "Route Handler와 page는 직접 정책을 재구현하지 않고 src/server를 호출한다").
// Route Handler는 기본적으로 캐시되지 않는다 — 토큰마다 응답이 갈리므로 그대로 둔다.
// 응답: { templates: { <path>: <body> }, entitlement: { plan, agents } } — 생성기는 templates 키가 없으면 중단한다.
import { templatesFor } from "@/server/templates";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const language = params.get("lang") ?? "en";
  const authorizationHeader = request.headers.get("authorization");
  // ?project=<slug>는 hu_ 전용이다 — hs_는 토큰이 프로젝트를 알고 있어 이 값을 보지 않는다.
  const result = await templatesFor(authorizationHeader, language, params.get("project"));
  return result.ok
    ? Response.json({ templates: result.templates, entitlement: result.entitlement })
    : Response.json({ error: result.reason }, { status: result.status });
}
