import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Vault } from "./contracts";

const keyringSchema = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), z.string());

export function createTokenVault(keys: Record<string, string>, activeKeyId: string): Vault {
  const parsed = keyringSchema.parse(keys);
  const keyring = new Map(Object.entries(parsed).map(([id, value]) => {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32 || key.toString("base64") !== value) throw new Error("Invalid GitHub vault configuration");
    return [id, key] as const;
  }));
  const activeKey = keyring.get(activeKeyId);
  if (!activeKey) throw new Error("Invalid GitHub vault configuration");
  return {
    activeKeyId,
    seal(value, context) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", activeKey, nonce);
      cipher.setAAD(Buffer.from(context));
      const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return ["v1", activeKeyId, nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
    },
    open(value, context) {
      const [version, keyId, nonce, tag, body, extra] = value.split(".");
      const key = keyring.get(keyId);
      if (version !== "v1" || !key || !nonce || !tag || body === undefined || extra !== undefined) throw new Error("Invalid GitHub vault envelope");
      const iv = Buffer.from(nonce, "base64url"), authTag = Buffer.from(tag, "base64url");
      if (iv.length !== 12 || authTag.length !== 16) throw new Error("Invalid GitHub vault envelope");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    },
  };
}

export function configuredTokenVault(env: Readonly<Record<string, string | undefined>> = process.env): Vault | null {
  try {
    if (!env.GITHUB_REPOSITORY_VAULT_KEYS || !env.GITHUB_REPOSITORY_VAULT_ACTIVE_KEY) return null;
    return createTokenVault(keyringSchema.parse(JSON.parse(env.GITHUB_REPOSITORY_VAULT_KEYS)), env.GITHUB_REPOSITORY_VAULT_ACTIVE_KEY);
  } catch {
    return null;
  }
}
