import { limitsFor } from "./entitlement.mjs";

export const USAGE_WINDOW_MS = 5 * 60 * 60_000;

/**
 * @param {string} plan
 * @param {Date | null} startedAt
 * @param {number} count
 * @param {Date} now
 */
export function usageSnapshot(plan, startedAt, count, now) {
  if (!Number.isSafeInteger(count) || count < 0 || (startedAt === null && count !== 0)) {
    throw new Error("Invalid account usage state");
  }
  if (!Number.isFinite(now.getTime()) || (startedAt !== null && !Number.isFinite(startedAt.getTime()))) {
    throw new Error("Invalid usage clock");
  }
  const end = startedAt === null ? null : new Date(startedAt.getTime() + USAGE_WINDOW_MS);
  const active = end !== null && now.getTime() < end.getTime();
  const used = active ? count : 0;
  const limit = limitsFor(plan).dispatches;
  return {
    startedAt: active ? startedAt : null,
    used,
    limit,
    resetAt: active ? end : null,
    percent: limit === Infinity ? null : Math.floor(Math.min(100, used * 100 / limit)),
    reached: used >= limit,
  };
}
