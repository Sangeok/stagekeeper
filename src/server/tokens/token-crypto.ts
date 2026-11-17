import { tokenPrefix } from "@harness/shared/tokens/format.mjs";

import { createHash, randomBytes } from "node:crypto";

export function hashToken(plain: import("node:crypto").BinaryLike): string { return createHash("sha256").update(plain).digest("hex"); }

export function newToken(kind: string = "agent"): { plain: string; hash: string } {
  const plain = tokenPrefix(kind) + randomBytes(32).toString("base64url");
  return { plain, hash: hashToken(plain) };
}
