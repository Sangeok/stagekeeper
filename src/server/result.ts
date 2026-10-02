// 서버 파이프라인과 MCP 도구가 같은 결과 형을 쓴다.
//
// 화면 쪽 ActionResult(fsd/shared/api/result.ts)와는 일부러 합치지 않는다: 그건 Client
// Component가 읽는 형이고 필드 이름도 다르다(success·data·error).
export type UsageLimitFailure = { ok: false; reason: string; code: "USAGE_LIMIT_REACHED"; resetAt: string };
export type RequestRateFailure = { ok: false; reason: string; code: "RATE_LIMITED"; retryAfterSec: number };
export type ServerFailure = { ok: false; reason: string; code?: never } | UsageLimitFailure | RequestRateFailure;
export type ServerResult<T> = { ok: true; item: T } | ServerFailure;

export function failureBody(failure: { reason: string; code?: never } | ServerFailure): { error: string; code?: string; resetAt?: string; retryAfterSec?: number } {
  if (failure.code === "USAGE_LIMIT_REACHED") return { error: failure.reason, code: failure.code, resetAt: failure.resetAt };
  if (failure.code === "RATE_LIMITED") return { error: failure.reason, code: failure.code, retryAfterSec: failure.retryAfterSec };
  return { error: failure.reason };
}

export type RestRateFailure = RequestRateFailure & { status: 429 };
export function restFailureResponse(failure: { status: number; reason: string; code?: never } | RestRateFailure): Response {
  return Response.json(failureBody(failure), { status: failure.status,
    ...(failure.code === "RATE_LIMITED" ? { headers: { "Retry-After": String(failure.retryAfterSec) } } : {}) });
}
