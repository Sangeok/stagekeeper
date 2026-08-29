import { createHash, randomBytes } from "node:crypto";
const TOKEN_RE = /^hs_[A-Za-z0-9_-]{43}$/;

export function hashToken(plain) { return createHash("sha256").update(plain).digest("hex"); }
export function newToken() {
  const plain = "hs_" + randomBytes(32).toString("base64url"); // 32B → 43자
  return { plain, hash: hashToken(plain) };
}
export function parseBearer(header) {
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m || !TOKEN_RE.test(m[1])) return null;
  return m[1];
}
