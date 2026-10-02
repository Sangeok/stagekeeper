import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newToken } from "@harness/core/token.mjs";
import { resolveRestScope, resolveUserScope } from "./rest-scope";
import { NOT_YOURS, PROJECT_REQUIRED } from "./scope-copy";

it("records REST credentials before missing-slug and ownership refusals, without altering results", async () => {
  const calls: string[] = [];
  const deps = {
    findTokenByHash: async () => ({ id: "agent-id", projectId: "p", revokedAt: null }),
    findUserTokenByHash: async () => ({ id: "user-id", userId: "u", revokedAt: null }),
    projectFor: async () => { calls.push("ownership"); return null; },
    recordTokenUsage: async (kind: string, id: string) => { calls.push(`${kind}:${id}`); },
  };
  assert.deepEqual(await resolveRestScope(deps, `Bearer ${newToken().plain}`, null), { ok: true, projectId: "p" });
  assert.deepEqual(calls.splice(0), ["agent:agent-id"]);
  const header = `Bearer ${newToken("user").plain}`;
  assert.deepEqual(await resolveRestScope(deps, header, null), { ok: false, status: 401, reason: PROJECT_REQUIRED });
  assert.deepEqual(calls.splice(0), ["user:user-id"]);
  assert.deepEqual(await resolveRestScope(deps, header, "foreign"), { ok: false, status: 403, reason: NOT_YOURS });
  assert.deepEqual(calls.splice(0), ["user:user-id", "ownership"]);
  assert.deepEqual(await resolveUserScope(deps.findUserTokenByHash, header, deps.recordTokenUsage), { ok: true, userId: "u" });
  assert.deepEqual(calls, ["user:user-id"]);
});

it("never records rejected REST credentials and preserves original lookup failures", async () => {
  let writes = 0;
  const recordTokenUsage = async () => { writes++; };
  for (const row of [null, { id: "t", projectId: "p", userId: "u", revokedAt: new Date() }]) {
    const find = async () => row;
    const deps = { findTokenByHash: find, findUserTokenByHash: find, projectFor: async () => "p", recordTokenUsage };
    for (const header of [null, "Bearer malformed", `Bearer ${newToken().plain}`, `Bearer ${newToken("user").plain}`, `Bearer ${newToken("owner").plain}`]) {
      assert.equal((await resolveRestScope(deps, header, "p")).ok, false);
      assert.equal((await resolveUserScope(find, header, recordTokenUsage)).ok, false);
    }
  }
  const broken = async () => { throw new Error("lookup unavailable"); };
  await assert.rejects(resolveRestScope({ findTokenByHash: broken, recordTokenUsage }, `Bearer ${newToken().plain}`, null), /lookup unavailable/);
  await assert.rejects(resolveUserScope(broken, `Bearer ${newToken("user").plain}`, recordTokenUsage), /lookup unavailable/);
  assert.equal(writes, 0);
});

// resolveUserScope — 사람만 식별한다. 프로젝트를 아직 만들기 전인 POST /api/projects가 쓴다.
// resolveRestScope와 갈라 둔 이유가 여기 단언으로 남아 있어야 한다: 그쪽은 hs_를 첫 가지로
// 통과시키고 언제나 projectId를 돌려주므로, 둘을 "통합"하면 프로젝트 토큰으로 새 프로젝트를
// 만들 수 있게 된다.
describe("resolveUserScope", () => {
  const user = newToken("user");
  const rows: Record<string, { id: string; userId: string; revokedAt: Date | null }> = {
    [user.hash]: { id: "user-token", userId: "user-1", revokedAt: null },
  };

  function setup(lookup?: (hash: string) => Promise<{ id: string; userId: string; revokedAt: Date | null } | null>) {
    const seen: string[] = [];
    const find = lookup ?? (async (hash: string) => { seen.push(hash); return rows[hash] ?? null; });
    return { seen, resolve: (header: string | null) => resolveUserScope(find, header) };
  }

  it("accepts a valid user token and yields the user", async () => {
    const { resolve } = setup();
    assert.deepEqual(await resolve(`Bearer ${user.plain}`), { ok: true, userId: "user-1" });
  });

  // 이 줄이 이 파일의 핵심이다. hs_로 프로젝트를 새로 만들 수 있으면 안 된다.
  it("refuses an agent token — a project token must not create projects", async () => {
    const { resolve, seen } = setup();
    const result = await resolve(`Bearer ${newToken().plain}`);
    assert.deepEqual(result, { ok: false, status: 401, reason: "user token required" });
    assert.deepEqual(seen, [], "must not reach the database");
  });

  it("refuses an owner token, a malformed token, and a missing header before any lookup", async () => {
    const { resolve, seen } = setup();
    for (const header of [null, "", "Bearer nope", "Basic abc", `Bearer ${newToken("owner").plain}`]) {
      assert.deepEqual(await resolve(header), { ok: false, status: 401, reason: "user token required" });
    }
    assert.deepEqual(seen, [], "parse failures must not touch the database");
  });

  it("refuses an unknown or revoked user token after looking it up", async () => {
    const { resolve, seen } = setup();
    assert.deepEqual(await resolve(`Bearer ${newToken("user").plain}`), { ok: false, status: 401, reason: "invalid or revoked token" });
    assert.equal(seen.length, 1, "an unknown token is a lookup miss, not a parse failure");

    const revoked = setup(async () => ({ id: "user-token", userId: "user-1", revokedAt: new Date() }));
    assert.deepEqual(await revoked.resolve(`Bearer ${user.plain}`), { ok: false, status: 401, reason: "invalid or revoked token" });
  });
});
