export const TOKEN_KINDS = { agent: "hs_", owner: "ho_", user: "hu_" };

export const tokenPrefix = (kind) => {
  const prefix = TOKEN_KINDS[kind];
  if (!prefix) throw new Error(`unknown token kind: ${kind}`);
  return prefix;
};

const tokenRe = (prefix) => new RegExp(`^${prefix}[A-Za-z0-9_-]{43}$`);

export function parseBearer(header, kind = "agent") {
  const prefix = tokenPrefix(kind);
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m || !tokenRe(prefix).test(m[1])) return null;
  return m[1];
}
