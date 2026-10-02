export const REQUEST_WINDOW_MS = 10 * 60_000;
export const REQUEST_LIMITS = { account: 1200, project: 300 };

/** @param {Date} startedAt @param {number} count @param {Date} at */
export function requestWindow(startedAt, count, at) {
  if (!(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime()) ||
      !(at instanceof Date) || !Number.isFinite(at.getTime()) || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid request window");
  }
  const active = at.getTime() < startedAt.getTime() + REQUEST_WINDOW_MS;
  return { startedAt: active ? startedAt : at, count: active ? count : 0,
    endsAt: new Date((active ? startedAt : at).getTime() + REQUEST_WINDOW_MS) };
}
