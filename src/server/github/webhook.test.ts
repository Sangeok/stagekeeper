import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { it } from "node:test";
import { processWebhook, validWebhookSignature } from "./webhook";
import { githubFixture } from "./test-fixture";

it("verifies the exact raw body and rejects malformed or forged signatures", () => {
  const body = '{"action":"revoked","sender":{"id":7}}', secret = "fixture webhook secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(validWebhookSignature(body, signature, secret), true);
  assert.equal(validWebhookSignature(body + " ", signature, secret), false);
  for (const invalid of [null, "", "sha256=abc", "sha256=" + "0".repeat(64)]) assert.equal(validWebhookSignature(body, invalid, secret), false);
});

it("accepts authorization revocation without installation fields, deduplicates and stops only that user", async () => {
  const f = githubFixture(), deliveryId = randomUUID();
  const input = { body: JSON.stringify({ action: "revoked", sender: { id: 7 } }), event: "github_app_authorization", deliveryId, appId: "1", now: f.deps.now() };
  assert.equal((await processWebhook(f.store, input)).ok, true); assert.equal(f.current().accessToken, null); assert.equal(f.current().revision, 5);
  await processWebhook(f.store, input); assert.equal(f.current().revision, 5);
  const other = githubFixture(); await processWebhook(other.store, { ...input, deliveryId: randomUUID(), body: JSON.stringify({ action: "revoked", sender: { id: 8 } }) });
  assert.ok(other.current().accessToken);
});

it("validates App identity per installation event and invalidates scope without granting authority", async () => {
  const f = githubFixture();
  const input = { event: "installation_repositories", deliveryId: randomUUID(), appId: "1", now: f.deps.now() };
  assert.equal((await processWebhook(f.store, { ...input, body: JSON.stringify({ action: "removed", installation: { id: 9, app_id: 2 } }) })).ok, false);
  assert.equal(f.current().revision, 4);
  assert.equal((await processWebhook(f.store, { ...input, body: JSON.stringify({ action: "removed", installation: { id: 9, app_id: 1 } }) })).ok, true);
  assert.equal(f.current().revision, 5); assert.ok(f.current().accessToken);
});
