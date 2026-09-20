import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newToken } from "@harness/core/token.mjs";
import { makeProjectIdentityFor, type ProjectIdentityDeps } from "./project-identity-query";
import { NOT_SELECTED_REASON, OWNERSHIP_UNAVAILABLE_REASON } from "./project-access-query";

const { plain: rawToken, hash: tokenHash } = newToken();
const authorizationHeader = `Bearer ${rawToken}`;
const tokenRecord = { projectId: "project-1", revokedAt: null };
const identityRow = { repoOwner: "Sangeok", repo: "stagekeeper", branch: "dev", name: "stagekeeper", slug: "stagekeeper" };

type Options = {
  tokenRecord?: Awaited<ReturnType<ProjectIdentityDeps["findTokenByHash"]>>;
  access?: Awaited<ReturnType<ProjectIdentityDeps["projectAccess"]>>;
  identityRow?: Awaited<ReturnType<ProjectIdentityDeps["findProjectIdentity"]>>;
};

function setup(options: Options = {}) {
  // 어디까지 호출됐는지가 이 파일의 핵심 단언이다 — 파싱 실패는 DB 접근 이전에 끊겨야 한다.
  const calls: { tokenHashes: string[]; projectIds: string[]; identityIds: string[] } = {
    tokenHashes: [], projectIds: [], identityIds: [],
  };
  const deps: ProjectIdentityDeps = {
    findTokenByHash: async (hash) => {
      calls.tokenHashes.push(hash);
      return options.tokenRecord === undefined ? tokenRecord : options.tokenRecord;
    },
    projectAccess: async (projectId) => {
      calls.projectIds.push(projectId);
      return options.access ?? { plan: "pro", available: true };
    },
    findProjectIdentity: async (projectId) => {
      calls.identityIds.push(projectId);
      return options.identityRow === undefined ? identityRow : options.identityRow;
    },
  };
  return { projectIdentityFor: makeProjectIdentityFor(deps), calls, deps };
}

describe("projectIdentityFor", () => {
  // 부류 ①: 파싱 실패. DB를 한 번도 건드리지 않는다. 소유자 토큰(ho_)이 여기 드는 것이
  // parseBearer의 기본 kind가 "agent"라는 계약이다 — templates-query.test.ts와 같은 목록.
  const invalidHeaders = [
    { name: "missing authorization", header: null },
    { name: "empty authorization", header: "" },
    { name: "a non-Bearer scheme", header: `Basic ${rawToken}` },
    { name: "a malformed token", header: "Bearer hs_invalid" },
    { name: "an owner token", header: `Bearer ${newToken("owner").plain}` },
  ];
  for (const { name, header } of invalidHeaders) {
    it(`returns 401 for ${name} without querying the database`, async () => {
      const { projectIdentityFor, calls } = setup();

      const result = await projectIdentityFor(header);

      assert.deepEqual(result, { ok: false, status: 401, reason: "bearer token required" });
      assert.deepEqual(calls, { tokenHashes: [], projectIds: [], identityIds: [] });
    });
  }

  // 부류 ②: 토큰 조회 실패. 조회는 했고 그다음에 끊긴다 — 문장도 calls도 ①과 다르다.
  it("returns 401 for an unknown token without checking access or reading the project", async () => {
    const { projectIdentityFor, calls } = setup({ tokenRecord: null });

    const result = await projectIdentityFor(authorizationHeader);

    assert.deepEqual(result, { ok: false, status: 401, reason: "invalid or revoked token" });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [], identityIds: [] });
  });

  it("returns 401 for a revoked token without checking access or reading the project", async () => {
    const { projectIdentityFor, calls } = setup({
      tokenRecord: { ...tokenRecord, revokedAt: new Date("2026-01-01T00:00:00Z") },
    });

    const result = await projectIdentityFor(authorizationHeader);

    assert.deepEqual(result, { ok: false, status: 401, reason: "invalid or revoked token" });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [], identityIds: [] });
  });

  // 부류 ③: 접근 거부. 정체 조회는 하지 않는다 — templates·runbook과 같은 가족이다(불변식).
  it("returns 403 and the lock reason for a selected-out project without reading the project", async () => {
    const { projectIdentityFor, calls } = setup({
      access: { plan: "free", available: false, code: "not-selected", reason: NOT_SELECTED_REASON },
    });

    const result = await projectIdentityFor(authorizationHeader);

    assert.deepEqual(result, { ok: false, status: 403, reason: NOT_SELECTED_REASON });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [tokenRecord.projectId], identityIds: [] });
  });

  // slug까지 다섯이다 — 그 값이 harness.json의 project.slug가 되어 hu_ 호출이 프로젝트를 지목한다(A-8).
  it("returns the five identity fields — and no language — after authentication", async () => {
    const { projectIdentityFor, calls } = setup();

    const result = await projectIdentityFor(authorizationHeader);

    assert.deepEqual(result, {
      ok: true,
      project: { owner: "Sangeok", repo: "stagekeeper", branch: "dev", name: "stagekeeper", slug: "stagekeeper" },
    });
    // language를 담으면 harness.json이 ?lang=ko를 만들어 첫 연결이 404가 된다.
    assert.ok(result.ok && !("language" in result.project));
    assert.deepEqual(calls, {
      tokenHashes: [tokenHash], projectIds: [tokenRecord.projectId], identityIds: [tokenRecord.projectId],
    });
  });

  // access를 통과한 뒤 행이 사라지는 경우 — 소유권 무결성과 같은 사유를 쓴다.
  it("returns 403 when the project vanished after access passed", async () => {
    const { projectIdentityFor } = setup({ identityRow: null });

    const result = await projectIdentityFor(authorizationHeader);

    assert.deepEqual(result, { ok: false, status: 403, reason: OWNERSHIP_UNAVAILABLE_REASON });
  });

  it("propagates a database failure instead of reporting it as an auth error", async () => {
    const { projectIdentityFor, deps } = setup();
    const databaseError = new Error("database unavailable");
    deps.findProjectIdentity = async () => { throw databaseError; };

    await assert.rejects(projectIdentityFor(authorizationHeader), (error) => error === databaseError);
  });
});

// hu_ — 이 경로의 뜻이 뒤집힌다. hs_는 "이 토큰은 어느 프로젝트냐"를 묻고,
// hu_는 ?project=<slug>로 "이 프로젝트를 확인해 달라"를 묻는다(A-7).
describe("projectIdentityFor with a user token", () => {
  const user = newToken("user");
  const userHeader = `Bearer ${user.plain}`;

  function userSetup(options: { projectId?: string | null } = {}) {
    const calls: { slugs: [string, string][]; projectIds: string[]; identityIds: string[] } = {
      slugs: [], projectIds: [], identityIds: [],
    };
    const deps: ProjectIdentityDeps = {
      findTokenByHash: async () => { throw new Error("hu_ must not reach the agent-token lookup"); },
      findUserTokenByHash: async () => ({ userId: "user1", revokedAt: null }),
      projectFor: async (slug, userId) => {
        calls.slugs.push([slug, userId]);
        return options.projectId === undefined ? "project-1" : options.projectId;
      },
      projectAccess: async (projectId) => { calls.projectIds.push(projectId); return { plan: "pro", available: true }; },
      findProjectIdentity: async (projectId) => { calls.identityIds.push(projectId); return identityRow; },
    };
    return { projectIdentityFor: makeProjectIdentityFor(deps), calls };
  }

  it("confirms the named project when the caller owns it", async () => {
    const { projectIdentityFor, calls } = userSetup();

    const result = await projectIdentityFor(userHeader, "mine");

    assert.deepEqual(result, {
      ok: true,
      project: { owner: "Sangeok", repo: "stagekeeper", branch: "dev", name: "stagekeeper", slug: "stagekeeper" },
    });
    assert.deepEqual(calls.slugs, [["mine", "user1"]]);
    assert.deepEqual(calls.identityIds, ["project-1"]);
  });

  // 첫 연결에는 harness.json이 없어 슬러그도 없다 — 그 경로는 C가 git remote로 채운다.
  it("returns 401 naming the fix when no project is given", async () => {
    const { projectIdentityFor, calls } = userSetup();

    const result = await projectIdentityFor(userHeader);

    assert.equal(result.ok === false && result.status, 401);
    assert.match(result.ok === false ? result.reason : "", /^project required: add project\.slug to harness\.json/);
    assert.deepEqual(calls, { slugs: [], projectIds: [], identityIds: [] });
  });

  it("returns 403 for a slug the caller does not own, and never reads the project", async () => {
    const { projectIdentityFor, calls } = userSetup({ projectId: null });

    const result = await projectIdentityFor(userHeader, "theirs");

    assert.deepEqual(result, { ok: false, status: 403, reason: "not the owner of this project" });
    assert.deepEqual(calls.projectIds, []);
    assert.deepEqual(calls.identityIds, []);
  });
});
