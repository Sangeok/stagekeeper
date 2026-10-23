import assert from "node:assert/strict";
import { it } from "node:test";
import { accessTokenFor } from "./token-refresh";
import { githubFixture } from "./test-fixture";
import { failure } from "./failure";

it("shares a refresh across callers without changing the selection revision", async () => {
  const f = githubFixture(); f.setConnection({ accessExpiresAt: f.deps.now() });
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
  f.deps.provider.refresh = async () => { f.calls.refresh++; await barrier; return { ok: true, value: f.credentials() }; };
  const a = accessTokenFor(f.deps, "u"), b = accessTokenFor(f.deps, "u");
  await new Promise(resolve => setImmediate(resolve)); release();
  const results = await Promise.all([a, b]);
  assert.ok(results.every(result => result.ok)); assert.equal(f.calls.refresh, 1); assert.equal(f.current().revision, 4); assert.equal(f.current().tokenVersion, 3);
});

it("never retries an uncertain refresh or a crashed lease", async () => {
  const f = githubFixture(); f.setConnection({ accessExpiresAt: f.deps.now() });
  f.deps.provider.refresh = async () => { f.calls.refresh++; return failure("UNAVAILABLE"); };
  assert.equal((await accessTokenFor(f.deps, "u")).ok, false); assert.equal((await accessTokenFor(f.deps, "u")).ok, false); assert.equal(f.calls.refresh, 1);
  const crashed = githubFixture(); crashed.setConnection({ refreshLeaseId: "crashed", refreshLeaseExpiresAt: crashed.deps.now() });
  assert.equal((await accessTokenFor(crashed.deps, "u")).ok, false); assert.equal(crashed.calls.refresh, 0); assert.equal(crashed.current().accessToken, null);
});

it("revokes a refresh result rejected by a newer grant and preserves recoverable vault data on key failure", async () => {
  const f = githubFixture(); f.setConnection({ accessExpiresAt: f.deps.now() }); f.store.finishRefresh = async () => false;
  assert.equal((await accessTokenFor(f.deps, "u")).ok, false); assert.deepEqual(f.calls.revoke, ["ghu_new"]);
  const keyFailure = githubFixture(); keyFailure.deps.vault.open = () => { throw new Error("missing old key"); };
  const before = keyFailure.current(); assert.equal((await accessTokenFor(keyFailure.deps, "u")).ok, false);
  assert.equal(keyFailure.current().accessToken, before.accessToken); assert.equal(keyFailure.current().revision, before.revision);
});
