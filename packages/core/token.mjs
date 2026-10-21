import { createHash, randomBytes } from "node:crypto";
export const TOKEN_KINDS = { agent: "hs_", owner: "ho_", user: "hu_" };
const prefixOf = (kind) => {
  const prefix = TOKEN_KINDS[kind];
  if (!prefix) throw new Error(`unknown token kind: ${kind}`);
  return prefix;
};
const tokenRe = (prefix) => new RegExp(`^${prefix}[A-Za-z0-9_-]{43}$`);

export function hashToken(plain) { return createHash("sha256").update(plain).digest("hex"); }
export function newToken(kind = "agent") {
  const plain = prefixOf(kind) + randomBytes(32).toString("base64url");
  return { plain, hash: hashToken(plain) };
}
export function parseBearer(header, kind = "agent") {
  const prefix = prefixOf(kind);
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m || !tokenRe(prefix).test(m[1])) return null;
  return m[1];
}
