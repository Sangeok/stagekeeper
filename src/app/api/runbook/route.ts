// src/app/api/runbook/route.ts — /harness:init이 방금 심은 런북 판을 보고하는 곳.
// route는 배선만 한다. 인증·검증은 @/server/runbook에 있다
// (system-overview.md: "Route Handler와 page는 직접 정책을 재구현하지 않고 src/server를 호출한다").
import { recordRunbook } from "@/server/runbook";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await recordRunbook(request.headers.get("authorization"), body);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.reason }, { status: result.status });
}
