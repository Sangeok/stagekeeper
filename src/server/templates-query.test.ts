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
      return options.access ?? { plan: "pro", locked: false };
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
    const { templatesFor, calls } = setup({ access: { plan: "free", locked: true, reason } });

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

  it("returns the free plan's allowed stubs and runbook after authentication", async () => {
    const { templatesFor, calls } = setup({ access: { plan: "free", locked: false } });

    const result = await templatesFor(authorizationHeader, "ko");

    assert.deepEqual(result, {
      ok: true,
      templates: {
        "agents/dev.md": agentStub,
        "agents/pm.md": agentStub,
        "agents/feature-scout.md": agentStub,
        "CLAUDE.runbook.md": "Free runbook",
        "docs/plans/README.md": "Plan documentation",
      },
      entitlement: { plan: "free", agents: ["pm", "feature-scout"] },
    });
    assert.deepEqual(calls, { tokenHashes: [tokenHash], projectIds: [tokenRecord.projectId], languages: ["ko"] });
  });

  for (const plan of ["pro", "max"] as const) {
    it(`returns all report agents as stubs and the full runbook on ${plan}`, async () => {
      const { templatesFor } = setup({ access: { plan, locked: false } });

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
