// src/app/api/templates/route.ts — /harness:init이 템플릿을 받아가는 곳.
// route는 배선만 한다. 인증·조회는 @/server/templates에 있다
// (system-overview.md: "Route Handler와 page는 직접 정책을 재구현하지 않고 src/server를 호출한다").
// Route Handler는 기본적으로 캐시되지 않는다 — 토큰마다 응답이 갈리므로 그대로 둔다.
import { templatesFor } from "@/server/templates";

export async function GET(request: Request) {
  const lang = new URL(request.url).searchParams.get("lang") ?? "en";
  const result = await templatesFor(request.headers.get("authorization"), lang);
  return result.ok
    ? Response.json(result.templates)
    : Response.json({ error: result.reason }, { status: result.status });
}
