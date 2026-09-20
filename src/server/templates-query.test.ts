import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newToken } from "@harness/core/token.mjs";
import { makeTemplatesFor, type TemplateDeps } from "./templates-query";

const { plain: rawToken, hash: tokenHash } = newToken();
const authorizationHeader = `Bearer ${rawToken}`;
const tokenRecord = { projectId: "project-1", revokedAt: null };
const agentStub = "# Agent\n";
const agentBody = `${agentStub}\n## step:start\nPrivate instructions.\nnext: done\n`;
const templateRows = [
  ...["dev", "pm", "plan-verifier", "doc-auditor", "feature-scout"].map((agent) => ({
    path: `agents/${agent}.md`, body: agentBody,
  })),
  { path: "CLAUDE.runbook.md", body: "Full runbook" },
  { path: "CLAUDE.runbook.free.md", body: "Free runbook" },
  { path: "docs/plans/README.md", body: "Plan documentation" },
];

type Options = {
  tokenRecord?: Awaited<ReturnType<TemplateDeps["findTokenByHash"]>>;
  access?: Awaited<ReturnType<TemplateDeps["projectAccess"]>>;
  templateRows?: Awaited<ReturnType<TemplateDeps["findTemplatesByLanguage"]>>;
};

function setup(options: Options = {}) {
  const calls: { tokenHashes: string[]; projectIds: string[]; languages: string[] } = {
    tokenHashes: [], projectIds: [], languages: [],
  };
  const deps: TemplateDeps = {
    findTokenByHash: async (hash) => {
      calls.tokenHashes.push(hash);
      return options.tokenRecord === undefined ? tokenRecord : options.tokenRecord;
    },
    projectAccess: async (projectId) => {
      calls.projectIds.push(projectId);
      return options.access ?? { plan: "pro", available: true };
    },
    findTemplatesByLanguage: async (language) => {
      calls.languages.push(language);
      return options.templateRows ?? templateRows;
    },
  };
  return { templatesFor: makeTemplatesFor(deps), calls, deps };
}

describe("templatesFor", () => {
  const invalidHeaders = [
    { name: "missing authorization", header: null },
    { name: "empty authorization", header: "" },
    { name: "a non-Bearer scheme", header: `Basic ${rawToken}` },
    { name: "a malformed token", header: "Bearer hs_invalid" },
    { name: "an owner token", header: `Bearer ${newToken("owner").plain}` },
  ];
  for (const { name, header } of invalidHeaders) {
    it(`returns 401 for ${name} without querying the database`, async () => {
      const { templatesFor, calls } = setup();

      const result = await templatesFor(header, "en");

      assert.deepEqual(result, { ok: false, status: 401, reason: "bearer token required" });
      assert.deepEqual(calls, { tokenHashes: [], projectIds: [], languages: [] });
    });
  }

  it("returns 401 for an unknown token without checking access or loading templates", async () => {
    const { templatesFor, calls } = setup({ tokenRecord: null });

    const result = await templatesFor(authorizationHeader, "en");

    assert.deepEqual(result, { ok: false, status: 401, reason: "invalid or revoked token" });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [], languages: [] });
  });

  it("returns 401 for a revoked token without checking access or loading templates", async () => {
    const { templatesFor, calls } = setup({
      tokenRecord: { ...tokenRecord, revokedAt: new Date("2026-01-01T00:00:00Z") },
    });

    const result = await templatesFor(authorizationHeader, "en");

    assert.deepEqual(result, { ok: false, status: 401, reason: "invalid or revoked token" });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [], languages: [] });
  });

  it("returns 403 and the lock reason for a valid token without loading templates", async () => {
    const reason = "project cap reached on the free plan (1); this project is locked";
    const { templatesFor, calls } = setup({ access: { plan: "free", available: false, code: "not-selected", reason } });

    const result = await templatesFor(authorizationHeader, "en");

    assert.deepEqual(result, { ok: false, status: 403, reason });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [tokenRecord.projectId], languages: [] });
  });

  it("returns 404 for the requested language when no templates exist", async () => {
    const { templatesFor, calls } = setup({ templateRows: [] });

    const result = await templatesFor(authorizationHeader, "ko");

    assert.deepEqual(result, { ok: false, status: 404, reason: "no templates for language: ko" });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [tokenRecord.projectId], languages: ["ko"] });
  });

  it("returns the free plan's allowed stubs and the one runbook after authentication", async () => {
    const { templatesFor, calls } = setup({ access: { plan: "free", available: true } });

    const result = await templatesFor(authorizationHeader, "ko");

    assert.deepEqual(result, {
      ok: true,
      templates: {
        "agents/dev.md": agentStub,
        "agents/pm.md": agentStub,
        "agents/feature-scout.md": agentStub,
        // 런북은 한 판이다 — 플랜 차이(검증자·감사자 유무)는 파이프라인 그래프가 진다(deliver.mjs).
        "CLAUDE.runbook.md": "Full runbook",
        "docs/plans/README.md": "Plan documentation",
      },
      entitlement: { plan: "free", agents: ["pm", "feature-scout"] },
    });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [tokenRecord.projectId], languages: ["ko"] });
  });

  for (const plan of ["pro", "max"] as const) {
    it(`returns all report agents as stubs and the full runbook on ${plan}`, async () => {
      const { templatesFor } = setup({ access: { plan, available: true } });

      const result = await templatesFor(authorizationHeader, "en");

      assert.ok(result.ok);
      assert.deepEqual(result.entitlement, { plan, agents: ["pm", "plan-verifier", "doc-auditor", "feature-scout"] });
      assert.deepEqual(result.templates, {
        "agents/dev.md": agentStub,
        "agents/pm.md": agentStub,
        "agents/plan-verifier.md": agentStub,
        "agents/doc-auditor.md": agentStub,
        "agents/feature-scout.md": agentStub,
        "CLAUDE.runbook.md": "Full runbook",
        "docs/plans/README.md": "Plan documentation",
      });
    });
  }

  it("propagates a template database failure instead of reporting missing templates", async () => {
    const { templatesFor, deps } = setup();
    const databaseError = new Error("database unavailable");
    deps.findTemplatesByLanguage = async () => { throw databaseError; };

    await assert.rejects(templatesFor(authorizationHeader, "en"), (error) => error === databaseError);
  });
});

// hu_ — 프로젝트가 토큰이 아니라 ?project=<slug>에서 온다. 위 hs_ 단언은 한 줄도 바뀌지 않는다.
describe("templatesFor with a user token", () => {
  const user = newToken("user");
  const userHeader = `Bearer ${user.plain}`;
  const userRecord: { userId: string; revokedAt: Date | null } = { userId: "user1", revokedAt: null };

  function userSetup(options: { userRecord?: typeof userRecord | null; projectId?: string | null } = {}) {
    const calls: { slugs: [string, string][]; projectIds: string[]; languages: string[] } = {
      slugs: [], projectIds: [], languages: [],
    };
    const deps: TemplateDeps = {
      // hs_ 조회는 접두에서 이미 갈렸으므로 닿으면 안 된다.
      findTokenByHash: async () => { throw new Error("hu_ must not reach the agent-token lookup"); },
      findUserTokenByHash: async () => (options.userRecord === undefined ? userRecord : options.userRecord),
      projectFor: async (slug, userId) => {
        calls.slugs.push([slug, userId]);
        return options.projectId === undefined ? "project-1" : options.projectId;
      },
      projectAccess: async (projectId) => { calls.projectIds.push(projectId); return { plan: "pro", available: true }; },
      findTemplatesByLanguage: async (language) => { calls.languages.push(language); return templateRows; },
    };
    return { templatesFor: makeTemplatesFor(deps), calls };
  }

  it("resolves the project from a slug the caller owns", async () => {
    const { templatesFor, calls } = userSetup();

    const result = await templatesFor(userHeader, "en", "mine");

    assert.ok(result.ok);
    assert.deepEqual(calls.slugs, [["mine", "user1"]]);
    assert.deepEqual(calls.projectIds, ["project-1"]);
  });

  // 슬러그 없는 옛 harness.json이 이 오류의 주된 원인이다 — 문장이 고치는 법을 들고 있어야 한다.
  it("returns 401 naming the fix when no project is given, without looking anything up", async () => {
    const { templatesFor, calls } = userSetup();

    const result = await templatesFor(userHeader, "en");

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.status, 401);
    assert.match(result.ok === false ? result.reason : "", /^project required: add project\.slug to harness\.json/);
    assert.deepEqual(calls, { slugs: [], projectIds: [], languages: [] });
  });

  it("returns 403 for a slug the caller does not own, without checking access or loading templates", async () => {
    const { templatesFor, calls } = userSetup({ projectId: null });

    const result = await templatesFor(userHeader, "en", "theirs");

    assert.deepEqual(result, { ok: false, status: 403, reason: "not the owner of this project" });
    assert.deepEqual(calls.projectIds, []);
    assert.deepEqual(calls.languages, []);
  });

  it("returns 401 for an unknown or revoked user token without resolving the slug", async () => {
    for (const record of [null, { userId: "user1", revokedAt: new Date() }]) {
      const { templatesFor, calls } = userSetup({ userRecord: record });

      const result = await templatesFor(userHeader, "en", "mine");

      assert.deepEqual(result, { ok: false, status: 401, reason: "invalid or revoked token" });
      assert.deepEqual(calls.slugs, []);
    }
  });

  // hu_를 주입하지 않은 배포에서는 hu_가 아예 존재하지 않는 것처럼 굴어야 한다.
  it("refuses the token outright where the hu_ lookups are not injected", async () => {
    const { templatesFor, calls } = setup();

    const result = await templatesFor(userHeader, "en", "mine");

    assert.deepEqual(result, { ok: false, status: 401, reason: "bearer token required" });
    assert.deepEqual(calls, { tokenHashes: [], projectIds: [], languages: [] });
  });
});
