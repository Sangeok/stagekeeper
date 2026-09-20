import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newToken } from "@harness/core/token.mjs";
import { resolveUserScope } from "./rest-scope";

// resolveUserScope — 사람만 식별한다. 프로젝트를 아직 만들기 전인 POST /api/projects가 쓴다.
// resolveRestScope와 갈라 둔 이유가 여기 단언으로 남아 있어야 한다: 그쪽은 hs_를 첫 가지로
// 통과시키고 언제나 projectId를 돌려주므로, 둘을 "통합"하면 프로젝트 토큰으로 새 프로젝트를
// 만들 수 있게 된다.
describe("resolveUserScope", () => {
  const user = newToken("user");
  const rows: Record<string, { userId: string; revokedAt: Date | null }> = {
    [user.hash]: { userId: "user-1", revokedAt: null },
  };

  function setup(lookup?: (hash: string) => Promise<{ userId: string; revokedAt: Date | null } | null>) {
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

    const revoked = setup(async () => ({ userId: "user-1", revokedAt: new Date() }));
    assert.deepEqual(await revoked.resolve(`Bearer ${user.plain}`), { ok: false, status: 401, reason: "invalid or revoked token" });
  });
});
