/** @param {{ revokedAt: Date | null, expiresAt: Date | null } | null} token @param {Date} at */
export function isTokenActive(token, at) {
  return token !== null && token.revokedAt === null && Number.isFinite(at.getTime())
    && (token.expiresAt === null || (token.expiresAt instanceof Date
      && Number.isFinite(token.expiresAt.getTime()) && token.expiresAt.getTime() > at.getTime()));
}

/** @param {unknown} value @param {Date} [at] @returns {Date | null} */
export function parseTokenExpiry(value, at = new Date()) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("Choose a future expiry in UTC, or leave it blank for no expiry.");
  }
  const expiresAt = new Date(value);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.toISOString() !== value || expiresAt <= at) {
    throw new Error("Choose a future expiry in UTC, or leave it blank for no expiry.");
  }
  return expiresAt;
}

/** @param {string} value @param {Date} [at] @returns {Date | null} */
export function parseTokenExpiryInput(value, at = new Date()) {
  const input = value.trim();
  if (input === "") return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input)) {
    throw new Error("Choose a future expiry in UTC, or leave it blank for no expiry.");
  }
  return parseTokenExpiry(input.replace(" ", "T") + ":00.000Z", at);
}
