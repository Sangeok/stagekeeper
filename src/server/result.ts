export type UsageLimitFailure = { ok: false; reason: string; code: "USAGE_LIMIT_REACHED"; resetAt: string };
export type RequestRateFailure = { ok: false; reason: string; code: "RATE_LIMITED"; retryAfterSec: number };
export type ServerFailure = { ok: false; reason: string; code?: never } | UsageLimitFailure | RequestRateFailure;
export type ServerResult<T> = { ok: true; item: T } | ServerFailure;

export function failureBody(failure: { reason: string; code?: never } | ServerFailure): { error: string; code?: string; resetAt?: string; retryAfterSec?: number } {
  if (failure.code === "USAGE_LIMIT_REACHED") return { error: failure.reason, code: failure.code, resetAt: failure.resetAt };
  if (failure.code === "RATE_LIMITED") return { error: failure.reason, code: failure.code, retryAfterSec: failure.retryAfterSec };
  return { error: failure.reason };
}
