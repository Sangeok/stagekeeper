import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newToken } from "@harness/core/tokens/token.mjs";
import { makeProjectIdentityFor, type ProjectIdentityDeps } from "./project-identity-handler";
import { NOT_SELECTED_REASON } from "../projects/access-query";
import { OWNERSHIP_UNAVAILABLE_REASON } from "../projects/api";

const { plain: rawToken, hash: tokenHash } = newToken();
const authorizationHeader = `Bearer ${rawToken}`;
const tokenRecord = { id: "agent-token", projectId: "project-1", expiresAt: null, revokedAt: null };
const identityRow = { repoOwner: "Sangeok", repo: "stagekeeper", branch: "dev", name: "stagekeeper", slug: "stagekeeper" };

type Options = {
  tokenRecord?: Awaited<ReturnType<ProjectIdentityDeps["findTokenByHash"]>>;
  access?: Awaited<ReturnType<ProjectIdentityDeps["projectAccess"]>>;
  identityRow?: Awaited<ReturnType<ProjectIdentityDeps["findProjectIdentity"]>>;
};

function setup(options: Options = {}) {
  const calls: { tokenHashes: string[]; projectIds: string[]; identityIds: string[] } = {
    tokenHashes: [], projectIds: [], identityIds: [],
  };
  const deps: ProjectIdentityDeps = {
      requestLimit: async () => null,
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

  it("returns 403 and the lock reason for a selected-out project without reading the project", async () => {
    const { projectIdentityFor, calls } = setup({
      access: { plan: "free", available: false, code: "not-selected", reason: NOT_SELECTED_REASON },
    });

    const result = await projectIdentityFor(authorizationHeader);

    assert.deepEqual(result, { ok: false, status: 403, reason: NOT_SELECTED_REASON });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [tokenRecord.projectId], identityIds: [] });
  });

  it("returns the five identity fields — and no language — after authentication", async () => {
    const { projectIdentityFor, calls } = setup();

    const result = await projectIdentityFor(authorizationHeader);

    assert.deepEqual(result, {
      ok: true,
      project: { owner: "Sangeok", repo: "stagekeeper", branch: "dev", name: "stagekeeper", slug: "stagekeeper" },
    });
    assert.ok(result.ok && !("language" in result.project));
    assert.deepEqual(calls, {
      tokenHashes: [tokenHash], projectIds: [tokenRecord.projectId], identityIds: [tokenRecord.projectId],
    });
  });

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

describe("projectIdentityFor with a user token", () => {
  const user = newToken("user");
  const userHeader = `Bearer ${user.plain}`;

  function userSetup(options: { projectId?: string | null } = {}) {
    const calls: { slugs: [string, string][]; projectIds: string[]; identityIds: string[] } = {
      slugs: [], projectIds: [], identityIds: [],
    };
    const deps: ProjectIdentityDeps = {
      requestLimit: async () => null,
      findTokenByHash: async () => { throw new Error("hu_ must not reach the agent-token lookup"); },
      findUserTokenByHash: async () => ({ id: "user-token", userId: "user1", expiresAt: null, revokedAt: null }),
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

  it("returns 401 naming the fix when no project is given", async () => {
    const { projectIdentityFor, calls } = userSetup();

    const result = await projectIdentityFor(userHeader);

    assert.equal(result.ok === false && result.status, 401);
    assert.match(result.ok === false ? result.reason : "", /^project required: send harness\.json project\.slug as project/);
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
