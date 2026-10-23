import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { it } from "node:test";
import { createGitHubStore } from "../../../src/server/github/store.server";
import type { Attempt } from "../../../src/server/github/contracts";
import { connections } from "./support";
import { maintainConnections } from "../../../src/server/github/maintenance.server";
import { createTokenVault } from "../../../src/server/github/token-vault.server";

it("fences callback consumption, refresh claims, token versions and disconnects across actual DB connections", async () => {
  const pool = connections(2), [a, b] = pool.all;
  const user = await a.user.create({ data: { login: randomUUID(), githubId: -Math.floor(Math.random() * 2_000_000_000) } });
  const now = new Date(), storeA = createGitHubStore(a), storeB = createGitHubStore(b);
  const attempt: Attempt = { id: randomUUID(), flowId: randomUUID(), userId: user.id, browserHash: "browser-hash", stateHash: randomUUID(), kind: "authorization", status: "pending", expectedRevision: 0,
    verifier: "sealed-verifier", draft: "sealed-draft", outcome: null, expiresAt: new Date(now.getTime() + 600000) };
  try {
    await storeA.beginAttempt(attempt, String(user.githubId));
    const input = { stateHash: attempt.stateHash, userId: user.id, browserHash: attempt.browserHash, kind: attempt.kind, now };
    const claims = await Promise.all([storeA.claimAttempt(input), storeB.claimAttempt(input)]);
    assert.equal(claims.filter(Boolean).length, 1); const claimed = claims.find(value => value !== null)!;
    const credentials = { accessToken: "sealed-access", refreshToken: "sealed-refresh", accessExpiresAt: new Date(now.getTime() + 3600000), refreshExpiresAt: new Date(now.getTime() + 86400000) };
    assert.equal(await storeA.finishAuthorization({ attempt: claimed, credentials, installationIds: ["9"], installationAttempt: null, now }), true);
    const connection = await storeA.connection(user.id); assert.ok(connection);
    const leases = await Promise.all([storeA.claimRefresh({ connection, leaseId: "one", expiresAt: new Date(now.getTime() + 30000) }), storeB.claimRefresh({ connection, leaseId: "two", expiresAt: new Date(now.getTime() + 30000) })]);
    assert.equal(leases.filter(Boolean).length, 1);
    assert.equal(await storeB.stop(user.id, connection.revision, now, { tokenVersion: connection.tokenVersion, refreshLeaseId: null }), false);
    const leaseId = leases[0] ? "one" : "two";
    assert.equal(await storeA.finishRefresh({ connection, leaseId, credentials: { ...credentials, accessToken: "new-access", refreshToken: "new-refresh" } }), true);
    assert.equal(await storeB.stop(user.id, connection.revision, now, { tokenVersion: connection.tokenVersion }), false);
    assert.equal((await storeA.connection(user.id))?.accessToken, "new-access");
    assert.equal(await storeA.stop(user.id, connection.revision, now), true);
    assert.equal(await storeB.finishRefresh({ connection, leaseId, credentials }), false);
    assert.equal((await storeA.connection(user.id))?.accessToken, null);
    assert.equal(await a.gitHubConnectAttempt.count({ where: { userId: user.id, OR: [{ verifier: { not: null } }, { draft: { not: null } }] } }), 0);
    assert.equal(await a.project.count({ where: { ownerUserId: user.id } }), 0);
    assert.equal(await a.gitHubInstallation.count({ where: { userId: user.id } }), 0);
  } finally { await a.user.delete({ where: { id: user.id } }); await pool.disconnect(); }
});

it("deduplicates revocation transactionally and cascades all user-owned credential records", async () => {
  const pool = connections(2), [a, b] = pool.all;
  const user = await a.user.create({ data: { login: randomUUID(), githubId: -Math.floor(Math.random() * 2_000_000_000) } });
  const deliveryId = randomUUID(), now = new Date();
  try {
    await a.gitHubConnection.create({ data: { userId: user.id, githubId: String(user.githubId), revision: 1, accessToken: "sealed", refreshToken: "sealed", accessExpiresAt: new Date(now.getTime() + 3600000), refreshExpiresAt: new Date(now.getTime() + 86400000) } });
    const input = { deliveryId, githubId: String(user.githubId), now, expiresAt: new Date(now.getTime() + 86400000) };
    await Promise.all([createGitHubStore(a).applyWebhook(input), createGitHubStore(b).applyWebhook(input)]);
    const row = await a.gitHubConnection.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(row.revision, 2); assert.equal(row.accessToken, null); assert.equal(row.refreshToken, null);
    await a.user.delete({ where: { id: user.id } });
    assert.equal(await a.gitHubConnection.count({ where: { userId: user.id } }), 0);
  } finally { await a.user.deleteMany({ where: { id: user.id } }); await a.gitHubWebhookDelivery.deleteMany({ where: { id: deliveryId } }); await pool.disconnect(); }
});

it("physically deletes expired drafts and delivery IDs while rotating active ciphertext without changing selection revisions", async () => {
  const pool = connections(1), db = pool.all[0];
  const user = await db.user.create({ data: { login: randomUUID(), githubId: -Math.floor(Math.random() * 2_000_000_000) } });
  const keys = { old: randomBytes(32).toString("base64"), current: randomBytes(32).toString("base64") };
  const old = createTokenVault(keys, "old"), current = createTokenVault(keys, "current"), now = new Date(), attemptId = randomUUID(), deliveryId = randomUUID();
  try {
    await db.gitHubConnection.create({ data: { userId: user.id, githubId: String(user.githubId), revision: 3, tokenVersion: 2,
      accessToken: old.seal("access-canary", `access:${user.id}`), refreshToken: old.seal("refresh-canary", `refresh:${user.id}`), accessExpiresAt: new Date(now.getTime() + 3600000), refreshExpiresAt: new Date(now.getTime() + 86400000) } });
    await db.gitHubConnectAttempt.create({ data: { id: attemptId, flowId: attemptId, userId: user.id, browserHash: "browser", stateHash: randomUUID(), kind: "authorization", expectedRevision: 3,
      verifier: old.seal("verifier-canary", `verifier:${user.id}:${attemptId}`), draft: old.seal("draft-canary", `draft:${user.id}:${attemptId}`), expiresAt: new Date(now.getTime() - 1) } });
    await db.gitHubWebhookDelivery.create({ data: { id: deliveryId, expiresAt: new Date(now.getTime() - 1) } });
    const result = await maintainConnections(db, { now, vault: current, rotate: true });
    assert.ok(result.attemptsDeleted >= 1 && result.deliveriesDeleted >= 1); assert.equal(result.credentialsRotated, 1);
    assert.equal(await db.gitHubConnectAttempt.findUnique({ where: { id: attemptId } }), null);
    assert.equal(await db.gitHubWebhookDelivery.findUnique({ where: { id: deliveryId } }), null);
    const connection = await db.gitHubConnection.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(connection.revision, 3); assert.equal(connection.tokenVersion, 2); assert.ok(connection.accessToken?.startsWith("v1.current."));
    assert.equal(createTokenVault({ current: keys.current }, "current").open(connection.accessToken!, `access:${user.id}`), "access-canary");
  } finally { await db.user.delete({ where: { id: user.id } }); await db.gitHubWebhookDelivery.deleteMany({ where: { id: deliveryId } }); await pool.disconnect(); }
});
