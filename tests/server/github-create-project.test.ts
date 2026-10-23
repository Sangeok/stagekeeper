import assert from "node:assert/strict";
import { it } from "node:test";
import type { createProject } from "../../src/fsd/features/create-project/api/create-project.server";
import { loadModule } from "./fixtures/load-module";

function actionFixture(options: { authorized?: boolean; userId?: string } = {}) {
  let tokens = 0, writes = 0, validations = 0;
  const action = loadModule<{ createProject: typeof createProject }>("src/fsd/features/create-project/api/create-project.server.ts", {
    "@/server/auth/guard": { requireUser: async () => ({ userId: options.userId ?? "user" }) },
    "@harness/core/tokens/token.mjs": { newToken: () => { tokens++; return { plain: "hs_reveal", hash: "hash-only" }; } },
    "@/server/github/api.server": { validateRepositorySelection: async (_user: string, input: { owner: string; name: string }) => {
      validations++; assert.equal(input.owner, "org"); assert.equal(input.name, "repo");
      return options.authorized ? { ok: true, value: {} } : { ok: false, message: "Repository access changed." };
    } },
    "@/server/projects/api.server": { registerWebProject: async () => { writes++; return { ok: true, item: { status: "created", slug: "mine" } }; } },
  }).createProject;
  const form = new FormData(); for (const [key, value] of Object.entries({ slug: "mine", owner: "org", repo: "repo", branch: "release", repositorySource: "authorized", repositoryId: "2", installationId: "9", repositoryPage: "1", connectionRevision: "4", expectedUserId: "user" })) form.set(key, value);
  return { action, form, counts: () => ({ tokens, writes, validations }) };
}

it("rejects unauthorized picks before token minting or project writes in the real Action", async () => {
  const f = actionFixture(); assert.deepEqual(JSON.parse(JSON.stringify(await f.action({ status: "idle" }, f.form))), { status: "error", error: "Repository access changed." });
  assert.deepEqual(f.counts(), { tokens: 0, writes: 0, validations: 1 });
});

it("requires an explicit branch and matching account before any linked side effect", async () => {
  const branch = actionFixture({ authorized: true }); branch.form.set("branch", " ");
  assert.equal((await branch.action({ status: "idle" }, branch.form)).status, "error"); assert.deepEqual(branch.counts(), { tokens: 0, writes: 0, validations: 0 });
  const changed = actionFixture({ userId: "other" }); assert.equal((await changed.action({ status: "idle" }, changed.form)).status, "error");
  assert.deepEqual(changed.counts(), { tokens: 0, writes: 0, validations: 0 });
});

it("registers an authorized pick once and preserves manual registration without App authorization", async () => {
  const linked = actionFixture({ authorized: true }); assert.equal((await linked.action({ status: "idle" }, linked.form)).status, "created");
  assert.deepEqual(linked.counts(), { tokens: 1, writes: 1, validations: 1 });
  const manual = actionFixture(); manual.form.set("repositorySource", "manual"); manual.form.set("branch", "");
  assert.equal((await manual.action({ status: "idle" }, manual.form)).status, "created"); assert.deepEqual(manual.counts(), { tokens: 1, writes: 1, validations: 0 });
});
