import assert from "node:assert/strict";
import { it } from "node:test";
import { appConfiguration, pickerEnabled, webhookConfiguration } from "../../src/server/github/configuration.server";

it("requires explicit feature and operations gates without affecting unconfigured environments", () => {
  assert.equal(pickerEnabled({}), false);
  assert.equal(pickerEnabled({ GITHUB_REPOSITORY_PICKER_ENABLED: "true" }), false);
  assert.equal(pickerEnabled({ GITHUB_REPOSITORY_PICKER_ENABLED: "true", GITHUB_REPOSITORY_OPERATIONS_READY: "true" }), true);
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
