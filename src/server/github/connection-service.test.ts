import assert from "node:assert/strict";
import { it } from "node:test";
import type { Draft } from "./contracts";
import { completeAuthorization, completeInstallation, connectionDraft, disconnectList, startConnection } from "./connection-service";
import { githubFixture } from "./test-fixture";

const browser = "a".repeat(43);
const draft: Draft = { selection: { source: "url", url: "https://github.com/org/private" }, slug: "mine", name: "My project", branch: "release", slugTouched: true, branchTouched: true, manual: true, editing: true, urlDraft: "https://github.com/org/private" };

it("creates PKCE authorization only on explicit start and rejects other browsers and replayed states", async () => {
  const f = githubFixture({ connected: false });
  const started = await startConnection(f.deps, { userId: "u", githubId: "7", browser, body: { action: "authorize", draft } });
  assert.ok(started.ok);
  const url = new URL(started.value.redirectTo), state = url.searchParams.get("state")!;
  assert.equal(url.searchParams.get("scope"), "offline_access"); assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(f.calls.exchange, 0); assert.equal(JSON.stringify([...f.attempts.values()]).includes(state), false);
  assert.equal((await completeAuthorization(f.deps, { userId: "u", githubId: "7", browser: "b".repeat(43), state, code: "code" })).ok, false);
  assert.equal(f.calls.exchange, 0);
  assert.equal((await completeAuthorization(f.deps, { userId: "u", githubId: "7", browser, state, code: "code" })).ok, true);
  assert.equal(f.current().revision, 1);
  assert.equal((await completeAuthorization(f.deps, { userId: "u", githubId: "7", browser, state, code: "code" })).ok, false);
  assert.equal(f.calls.exchange, 1);
});

it("uses a fresh installation attempt after consuming OAuth and restores only the owning flow", async () => {
  const f = githubFixture({ connected: false });
  f.deps.provider.installations = async () => ({ ok: true, value: { installations: [], nextPage: null } });
  const start = await startConnection(f.deps, { userId: "u", githubId: "7", browser, body: { action: "authorize", draft } }); assert.ok(start.ok);
  const state = new URL(start.value.redirectTo).searchParams.get("state")!;
  const authorized = await completeAuthorization(f.deps, { userId: "u", githubId: "7", browser, state, code: "code" }); assert.ok(authorized.ok);
  const installationState = new URL(authorized.value.redirectTo).searchParams.get("state")!;
  assert.notEqual(installationState, state);
  assert.equal((await completeInstallation(f.deps, { userId: "u", browser, state, installationId: "9" })).ok, false);
  f.deps.provider.installations = async () => ({ ok: true, value: { installations: [{ id: "9", suspended: false }], nextPage: null } });
  assert.equal((await completeInstallation(f.deps, { userId: "u", browser, state: installationState, installationId: "9" })).ok, true);
  const restored = await connectionDraft(f.deps, "u", browser, start.value.attemptId); assert.ok(restored);
  assert.equal(restored.flowId, start.value.attemptId); assert.notEqual(restored.id, start.value.attemptId); assert.deepEqual(restored.value, draft);
  assert.equal(await connectionDraft(f.deps, "other", browser, start.value.attemptId), null);
  await f.store.cancel({ id: start.value.attemptId, userId: "u", browserHash: [...f.attempts.values()][0].browserHash });
  assert.equal(await connectionDraft(f.deps, "u", browser, start.value.attemptId), null);
});

it("supersedes old tabs without letting their cancel or callback mutate the new flow", async () => {
  const f = githubFixture();
  const a = await startConnection(f.deps, { userId: "u", githubId: "7", browser, body: { action: "authorize", draft } }); assert.ok(a.ok);
  const b = await startConnection(f.deps, { userId: "u", githubId: "7", browser, body: { action: "manage", draft } }); assert.ok(b.ok);
  await f.store.cancel({ id: a.value.attemptId, userId: "u", browserHash: f.attempts.get(a.value.attemptId)!.browserHash });
  assert.equal((await completeAuthorization(f.deps, { userId: "u", githubId: "7", browser, state: new URL(a.value.redirectTo).searchParams.get("state")!, code: "old" })).ok, false);
  assert.equal(f.calls.exchange, 0); assert.equal(f.attempts.get(b.value.attemptId)?.status, "pending");
  assert.ok(await connectionDraft(f.deps, "u", browser, b.value.attemptId)); assert.equal(f.current().revision, 4);
});

it("rejects account mismatch and a late successful exchange, revoking only its newly issued token", async () => {
  for (const mismatch of [true, false]) {
    const f = githubFixture();
    if (mismatch) f.deps.provider.user = async () => ({ ok: true, value: "8" });
    else f.store.finishAuthorization = async () => false;
    const start = await startConnection(f.deps, { userId: "u", githubId: "7", browser, body: { action: "authorize", draft } }); assert.ok(start.ok);
    const result = await completeAuthorization(f.deps, { userId: "u", githubId: "7", browser, state: new URL(start.value.redirectTo).searchParams.get("state")!, code: "code" });
    assert.equal(result.ok, false); assert.deepEqual(f.calls.revoke, ["ghu_new"]); assert.equal(f.current().revision, 4);
  }
});

it("rejects stale disconnects and reports uncertain external revocation while preserving local stop", async () => {
  const f = githubFixture();
  assert.equal((await disconnectList(f.deps, { userId: "u", revision: 3 })).ok, false); assert.equal(f.calls.revoke.length, 0);
  f.deps.provider.revoke = async token => { f.calls.revoke.push(token); return false; };
  assert.deepEqual(await disconnectList(f.deps, { userId: "u", revision: 4 }), { ok: true, value: { stopped: true, providerRevoked: false } });
  assert.equal(f.current().accessToken, null); assert.equal(f.current().refreshToken, null); assert.deepEqual(f.calls.revoke, ["ghu_fixture"]);
});

it("fences disconnect against credential rotation and does not confirm external settlement during an in-flight refresh", async () => {
  const f = githubFixture(), open = f.deps.vault.open;
  f.deps.vault.open = (value, context) => { f.setConnection({ tokenVersion: 3 }); return open(value, context); };
  const changed = await disconnectList(f.deps, { userId: "u", revision: 4 });
  assert.ok(!changed.ok); assert.equal(changed.code, "STALE_CONNECTION"); assert.equal(f.calls.revoke.length, 0); assert.ok(f.current().accessToken);
  const refreshing = githubFixture(); refreshing.setConnection({ refreshLeaseId: "in-flight", refreshLeaseExpiresAt: new Date(refreshing.deps.now().getTime() + 30000) });
  assert.deepEqual(await disconnectList(refreshing.deps, { userId: "u", revision: 4 }), { ok: true, value: { stopped: true, providerRevoked: false } });
  assert.equal(refreshing.current().accessToken, null);
});
