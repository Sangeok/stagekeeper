import { createHash, randomBytes } from "node:crypto";
// 두 종류. hs_ = 에이전트(프로젝트) 토큰, ho_ = 소유자 토큰(사람 자격 — 자기 Claude Code 세션에 물린다).
// 접두가 다르면 상대 엔드포인트의 파싱 단계에서 떨어진다 — 표를 찾아보기 전에.
export const TOKEN_KINDS = { agent: "hs_", owner: "ho_" };
const prefixOf = (kind) => {
  const prefix = TOKEN_KINDS[kind];
  if (!prefix) throw new Error(`unknown token kind: ${kind}`);
  return prefix;
};
const tokenRe = (prefix) => new RegExp(`^${prefix}[A-Za-z0-9_-]{43}$`);

export function hashToken(plain) { return createHash("sha256").update(plain).digest("hex"); }
export function newToken(kind = "agent") {
  const plain = prefixOf(kind) + randomBytes(32).toString("base64url"); // 32B → 43자
  return { plain, hash: hashToken(plain) };
}
export function parseBearer(header, kind = "agent") {
  const prefix = prefixOf(kind);
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m || !tokenRe(prefix).test(m[1])) return null;
  return m[1];
}
