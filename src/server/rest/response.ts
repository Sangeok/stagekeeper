import { failureBody, type RequestRateFailure } from "../result";

export type RestRateFailure = RequestRateFailure & { status: 429 };
export function restFailureResponse(failure: { status: number; reason: string; code?: never } | RestRateFailure): Response {
  return Response.json(failureBody(failure), { status: failure.status,
    ...(failure.code === "RATE_LIMITED" ? { headers: { "Retry-After": String(failure.retryAfterSec) } } : {}) });
}
