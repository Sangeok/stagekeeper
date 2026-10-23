import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { it } from "node:test";
import { createTokenVault, configuredTokenVault } from "../../src/server/github/token-vault.server";

it("authenticates ciphertext and record context, and decrypts old keys during rotation", () => {
  const keys = { old: randomBytes(32).toString("base64"), current: randomBytes(32).toString("base64") };
  const old = createTokenVault(keys, "old"), current = createTokenVault(keys, "current");
  const sealed = old.seal("ghu_canary", "access:user-one");
  assert.equal(sealed.includes("ghu_canary"), false); assert.equal(current.open(sealed, "access:user-one"), "ghu_canary");
  assert.throws(() => current.open(sealed, "access:user-two"));
  assert.throws(() => current.open(sealed, "refresh:user-one"));
  const segments = sealed.split("."); segments[3] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => current.open(segments.join("."), "access:user-one"));
  const resealed = current.seal(current.open(sealed, "access:user-one"), "access:user-one");
  assert.equal(resealed.split(".")[1], "current");
  assert.equal(createTokenVault({ current: keys.current }, "current").open(resealed, "access:user-one"), "ghu_canary");
  assert.throws(() => createTokenVault({ current: keys.current }, "current").open(sealed, "access:user-one"));
});

it("isolates invalid key configuration without using the authentication secret", () => {
  assert.equal(configuredTokenVault({ AUTH_SECRET: "not a vault key" }), null);
  assert.equal(configuredTokenVault({ GITHUB_REPOSITORY_VAULT_KEYS: "{}", GITHUB_REPOSITORY_VAULT_ACTIVE_KEY: "missing" }), null);
  assert.throws(() => createTokenVault({ invalid: "not base64" }, "invalid"));
});
