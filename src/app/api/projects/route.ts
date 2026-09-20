// src/app/api/projects/route.ts — /harness:init이 저장소를 등록하는 곳(C).
// route는 배선만 한다. 인증·검증·트랜잭션은 @/server/project-registration에 있다
// (system-overview.md: "Route Handler와 page는 직접 정책을 재구현하지 않고 src/server를 호출한다").
//
// 201 = 새로 만들었다, 200 = 이미 있던 것을 돌려준다(멱등). init 재실행이 정상 흐름이므로
// 후자가 오류가 아니라는 점이 이 경로의 계약이다.
import { registerProject } from "@/server/project-registration";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await registerProject(request.headers.get("authorization"), body);
  return result.ok
    ? Response.json({ project: result.project }, { status: result.created ? 201 : 200 })
    : Response.json({ error: result.reason }, { status: result.status });
}
