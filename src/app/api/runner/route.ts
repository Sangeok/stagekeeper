// 실행기(1단계 /harness:watch, 2단계 상주 실행기)가 lease를 잡고 생존·상태를 보고하는 곳.
// route는 배선만 한다. 인증·검증은 @/server/rest/runner에 있다
// (system-overview.md: "Route Handler와 page는 직접 정책을 재구현하지 않고 src/server를 호출한다").
import { runnerRequest } from "@/server/rest/api.server";
import { runnerResponse } from "@/server/rest/api";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return runnerResponse(await runnerRequest(request.headers.get("authorization"), body));
}
