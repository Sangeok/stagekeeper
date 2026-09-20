// src/app/api/project/route.ts — /harness:init이 harness.json 초안의 project 블록을 받아가는 곳.
// route는 배선만 한다. 인증·조회는 @/server/project-identity에 있다
// (system-overview.md: "Route Handler와 page는 직접 정책을 재구현하지 않고 src/server를 호출한다").
// Route Handler는 기본적으로 캐시되지 않는다 — 토큰마다 응답이 갈리므로 그대로 둔다.
// 응답: { project: { owner, repo, branch, name } }. language는 담지 않는다 —
// 그 값을 harness.json으로 옮기면 /api/templates가 ?lang=ko로 404를 준다.
// 언어 질의가 없으므로 404 상태도 없다: 401(토큰) · 403(선택되지 않음)뿐이다.
import { projectIdentityFor } from "@/server/project-identity";

export async function GET(request: Request) {
  const result = await projectIdentityFor(request.headers.get("authorization"));
  return result.ok
    ? Response.json({ project: result.project })
    : Response.json({ error: result.reason }, { status: result.status });
}
