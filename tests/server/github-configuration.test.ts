import assert from "node:assert/strict";
import { it } from "node:test";
import { appConfiguration, webhookConfiguration } from "../../src/server/github/configuration.server";
import { configuredTokenVault } from "../../src/server/github/token-vault.server";
import { loadModule } from "./fixtures/load-module";

it("leaves the repository list unavailable without App configuration", () => {
  assert.equal(appConfiguration({}), null);
});

it("requires a fixed safe callback origin and keeps webhook configuration independent of feature enablement", () => {
  const env = { GITHUB_REPOSITORY_APP_CLIENT_ID: "client", GITHUB_REPOSITORY_APP_CLIENT_SECRET: "secret", GITHUB_REPOSITORY_APP_ID: "1", GITHUB_REPOSITORY_APP_SLUG: "my-app", HARNESS_PUBLIC_URL: "https://stagekeeper.test" };
  assert.equal(appConfiguration(env)?.origin, "https://stagekeeper.test");
  assert.equal(appConfiguration({ ...env, HARNESS_PUBLIC_URL: "https://user:password@stagekeeper.test" }), null);
  assert.equal(appConfiguration({ ...env, HARNESS_PUBLIC_URL: "https://stagekeeper.test/path" }), null);
  assert.equal(appConfiguration({ ...env, NODE_ENV: "production", HARNESS_PUBLIC_URL: "http://localhost:3000" }), null);
  assert.deepEqual(webhookConfiguration({ GITHUB_REPOSITORY_APP_ID: "1", GITHUB_REPOSITORY_WEBHOOK_SECRET: "a".repeat(32) }), { appId: "1", secret: "a".repeat(32) });
});

const configuredEnv = {
  NODE_ENV: "production",
  HARNESS_PUBLIC_URL: "https://stagekeeper.test",
  GITHUB_REPOSITORY_APP_ID: "1",
  GITHUB_REPOSITORY_APP_SLUG: "my-app",
  GITHUB_REPOSITORY_APP_CLIENT_ID: "client",
  GITHUB_REPOSITORY_APP_CLIENT_SECRET: "secret",
  GITHUB_REPOSITORY_WEBHOOK_SECRET: "a".repeat(32),
  GITHUB_REPOSITORY_VAULT_KEYS: JSON.stringify({ v1: Buffer.alloc(32, 1).toString("base64") }),
  GITHUB_REPOSITORY_VAULT_ACTIVE_KEY: "v1",
};

function repositoryApi(env: Readonly<Record<string, string | undefined>>): typeof import("../../src/server/github/api.server") {
  return loadModule("src/server/github/api.server.ts", {
    "@/server/db": { prisma: {} },
    "./configuration.server": {
      appConfiguration: () => appConfiguration(env),
      webhookConfiguration: () => webhookConfiguration(env),
    },
    "./token-vault.server": { configuredTokenVault: () => configuredTokenVault(env) },
    "./provider.server": { createGitHubProvider: () => ({}) },
    "./store.server": { createGitHubStore: () => ({ connection: async () => null }) },
    "./maintenance.server": {},
  }, { process: { env }, setTimeout });
}

it("offers the repository list with valid App, webhook and vault settings and no feature switches", async () => {
  const view = await repositoryApi(configuredEnv).loadRepositoryConnection("user", null);
  assert.equal(view.available, true);
  assert.equal(view.status, "not-connected");
});

it("keeps the repository list unavailable for missing or invalid integration settings", async () => {
  for (const name of Object.keys(configuredEnv).filter(name => name.startsWith("GITHUB_"))) {
    const view = await repositoryApi({ ...configuredEnv, [name]: undefined }).loadRepositoryConnection("user", null);
    assert.equal(view.available, false, name);
  }
  for (const override of [
    { HARNESS_PUBLIC_URL: "https://stagekeeper.test/path" },
    { GITHUB_REPOSITORY_WEBHOOK_SECRET: "too-short" },
    { GITHUB_REPOSITORY_VAULT_KEYS: "not-json" },
    { GITHUB_REPOSITORY_VAULT_ACTIVE_KEY: "missing-key" },
  ]) {
    assert.equal((await repositoryApi({ ...configuredEnv, ...override }).loadRepositoryConnection("user", null)).available, false);
  }
});
