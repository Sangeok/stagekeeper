import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runbookVersion } from "@harness/core/runbook.mjs";
import { newToken } from "@harness/core/token.mjs";
import { makeRecordRunbook, type RunbookDeps } from "./runbook-query";

const { plain: rawToken, hash: tokenHash } = newToken();
const authorizationHeader = `Bearer ${rawToken}`;
const tokenRecord = { projectId: "project-1", revokedAt: null };
const version = runbookVersion("# runbook\n");

type Options = {
  tokenRecord?: Awaited<ReturnType<RunbookDeps["findTokenByHash"]>>;
  access?: Awaited<ReturnType<RunbookDeps["projectAccess"]>>;
};

function setup(options: Options = {}) {
  const saved: { projectId: string; version: string }[] = [];
  const seenHashes: string[] = [];
  const deps: RunbookDeps = {
    findTokenByHash: async (hash) => {
      seenHashes.push(hash);
      return options.tokenRecord === undefined ? tokenRecord : options.tokenRecord;
    },
    projectAccess: async () => options.access ?? { plan: "pro", available: true },
    saveRunbookVersion: async (projectId, value) => { saved.push({ projectId, version: value }); },
  };
  return { recordRunbook: makeRecordRunbook(deps), saved, seenHashes };
}

describe("recordRunbook", () => {
  it("stores the version against the token's project", async () => {
    const { recordRunbook, saved, seenHashes } = setup();
    assert.deepEqual(await recordRunbook(authorizationHeader, { version }), { ok: true });
    assert.deepEqual(saved, [{ projectId: "project-1", version }]);
    assert.deepEqual(seenHashes, [tokenHash]);
  });

  it("refuses a missing or malformed bearer token without writing", async () => {
    for (const header of [null, "Token abc", "Bearer nope"]) {
      const { recordRunbook, saved } = setup();
      const result = await recordRunbook(header, { version });
      assert.deepEqual(result, { ok: false, status: 401, reason: "bearer token required" });
      assert.deepEqual(saved, []);
    }
  });

  it("refuses an unknown or revoked token without writing", async () => {
    for (const record of [null, { projectId: "project-1", revokedAt: new Date() }]) {
      const { recordRunbook, saved } = setup({ tokenRecord: record });
      const result = await recordRunbook(authorizationHeader, { version });
      assert.deepEqual(result, { ok: false, status: 401, reason: "invalid or revoked token" });
      assert.deepEqual(saved, []);
    }
  });

  // 잠긴 프로젝트는 템플릿도 못 받는다. 받지도 못한 판을 기록으로 남기지 않는다.
  it("refuses a locked project without writing, preserving the reason", async () => {
    const { recordRunbook, saved } = setup({ access: { plan: "free", available: false, code: "not-selected", reason: "project cap reached" } });
    const result = await recordRunbook(authorizationHeader, { version });
    assert.deepEqual(result, { ok: false, status: 403, reason: "project cap reached" });
    assert.deepEqual(saved, []);
  });

  // 형식을 서버에서 막지 않으면 아무 문자열이나 열에 앉아 영원히 "현재"가 된다.
  it("refuses a body that is not a 12-hex version", async () => {
    for (const body of [null, {}, { version: 1 }, { version: "" }, { version: "ZZZZZZZZZZZZ" }, { version: `${version}00` }]) {
      const { recordRunbook, saved } = setup();
      const result = await recordRunbook(authorizationHeader, body);
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.status, 400);
      assert.deepEqual(saved, []);
    }
  });
});

// hu_ — 이 경로에는 쿼리 문자열이 없어 프로젝트를 **본문**으로 받는다(A-7).
describe("recordRunbook with a user token", () => {
  const user = newToken("user");
  const userHeader = `Bearer ${user.plain}`;

  function userSetup(options: { projectId?: string | null } = {}) {
    const saved: { projectId: string; version: string }[] = [];
    const slugs: [string, string][] = [];
    const deps: RunbookDeps = {
      findTokenByHash: async () => { throw new Error("hu_ must not reach the agent-token lookup"); },
      findUserTokenByHash: async () => ({ userId: "user1", revokedAt: null }),
      projectFor: async (slug, userId) => {
        slugs.push([slug, userId]);
        return options.projectId === undefined ? "project-1" : options.projectId;
      },
      projectAccess: async () => ({ plan: "pro", available: true }),
      saveRunbookVersion: async (projectId, value) => { saved.push({ projectId, version: value }); },
    };
    return { recordRunbook: makeRecordRunbook(deps), saved, slugs };
  }

  it("takes the project from the body and stores the version against it", async () => {
    const { recordRunbook, saved, slugs } = userSetup();
    assert.deepEqual(await recordRunbook(userHeader, { version, project: "mine" }), { ok: true });
    assert.deepEqual(slugs, [["mine", "user1"]]);
    assert.deepEqual(saved, [{ projectId: "project-1", version }]);
  });

  it("refuses a body with no project, naming the fix, without writing", async () => {
    for (const body of [{ version }, { version, project: "" }, { version, project: 7 }]) {
      const { recordRunbook, saved, slugs } = userSetup();
      const result = await recordRunbook(userHeader, body);
      assert.equal(result.ok === false && result.status, 401);
      assert.match(result.ok === false ? result.reason : "", /^project required: add project\.slug to harness\.json/);
      assert.deepEqual(slugs, []);
      assert.deepEqual(saved, []);
    }
  });

  it("refuses a project the caller does not own without writing", async () => {
    const { recordRunbook, saved } = userSetup({ projectId: null });
    const result = await recordRunbook(userHeader, { version, project: "theirs" });
    assert.deepEqual(result, { ok: false, status: 403, reason: "not the owner of this project" });
    assert.deepEqual(saved, []);
  });
});
