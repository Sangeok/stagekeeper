import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { newToken } from "@harness/core/tokens/token.mjs";
import { NOT_SELECTED_REASON } from "../../../src/server/projects/access-query";
import { GET } from "../../../src/app/api/templates/route";
import { cleanup, connections } from "./support";

const agentBody = "# Agent\n\n## step:start\nPrivate instructions.\nnext: done\n";
const agentStub = "# Agent\n";

it("the templates route answers with real bodies, the lock reason, and auth failures", async () => {
  const { all: [db], disconnect } = connections(1);
  const id = randomUUID();
  const lang = `test-${id}`;
  const { plain, hash } = newToken();
  const user = newToken("user");
  const request = (header: string | null, language = lang, project: string | null = null) =>
    GET(new Request(`https://example.test/api/templates?lang=${encodeURIComponent(language)}`
      + (project === null ? "" : `&project=${encodeURIComponent(project)}`),
      { headers: header === null ? {} : { authorization: header } }));
  const expected = {
    templates: {
      "agents/dev.md": agentStub,
      "agents/pm.md": agentStub,
      "agents/work-assigner.md": agentStub,
      "CLAUDE.runbook.md": "Full runbook",
      "docs/plans/README.md": "Plan documentation",
    },
    entitlement: { plan: "free", agents: ["pm", "feature-scout", "work-assigner", "work-discoverer"] },
  };
  let userId: string | undefined;
  try {
    const owner = await db.user.create({ data: { login: id, githubId: -Math.floor(Math.random() * 2_000_000_000) } });
    userId = owner.id;
    const project = await db.project.create({ data: { slug: id, name: id, repoOwner: id, repo: id, branch: "main", ownerUserId: owner.id } });
    await db.projectToken.create({ data: { projectId: project.id, hash, label: "integration" } });
    await db.userToken.create({ data: { userId: owner.id, hash: user.hash, label: "integration" } });
    await db.template.createMany({ data: [
      { lang, path: "agents/dev.md", body: agentBody },
      { lang, path: "agents/pm.md", body: agentBody },
      { lang, path: "agents/plan-verifier.md", body: agentBody },
      { lang, path: "CLAUDE.runbook.md", body: "Full runbook" },
      { lang, path: "CLAUDE.runbook.free.md", body: "Free runbook" },
      { lang, path: "docs/plans/README.md", body: "Plan documentation" },
    ] });

    const ok = await request(`Bearer ${plain}`);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), expected);

    const scoped = await request(`Bearer ${user.plain}`, lang, id);
    assert.equal(scoped.status, 200);
    assert.deepEqual(await scoped.json(), expected);

    const foreign = await request(`Bearer ${user.plain}`, lang, `${id}-absent`);
    assert.equal(foreign.status, 403);
    assert.deepEqual(await foreign.json(), { error: "not the owner of this project" });

    await db.project.update({ where: { id: project.id }, data: { available: false } });
    const locked = await request(`Bearer ${plain}`);
    assert.equal(locked.status, 403);
    assert.deepEqual(await locked.json(), { error: NOT_SELECTED_REASON });

    await db.project.update({ where: { id: project.id }, data: { available: true } });
    const missing = await request(`Bearer ${plain}`, `${lang}-absent`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: `no templates for language: ${lang}-absent` });

    for (const header of [null, `Bearer ${newToken().plain}`, `Bearer ${newToken("owner").plain}`,
      `Bearer ${user.plain}`, `Bearer ${newToken("user").plain}`]) {
      const denied = await request(header);
      assert.equal(denied.status, 401);
    }
  } finally {
    try {
      await db.template.deleteMany({ where: { lang } });
      await cleanup(db, userId);
    } finally {
      await disconnect();
    }
  }
});
