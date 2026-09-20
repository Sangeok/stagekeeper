import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { newToken } from "@harness/core/token.mjs";
import { NOT_SELECTED_REASON } from "../../../src/server/project-access-query";
import { GET } from "../../../src/app/api/templates/route";
import { cleanup, connections } from "./support";

// route가 쓰는 것은 @/server/db의 싱글턴이다. runner가 자식 프로세스의 DATABASE_URL에 검증된 test URL만 주입하므로
// 여기서 만든 fixture와 같은 DB를 본다. 고유 lang 행만 만들고 지운다 — 실제 en seed 인수는 배포 절차의 몫이다.
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
  // free 플랜의 기대 본문. hs_와 hu_가 같은 것을 받아야 한다 — 프로젝트가 어디서 왔는지만 다르다.
  const expected = {
    templates: {
      "agents/dev.md": agentStub,
      "agents/pm.md": agentStub,
      "CLAUDE.runbook.md": "Full runbook",
      "docs/plans/README.md": "Plan documentation",
    },
    entitlement: { plan: "free", agents: ["pm", "feature-scout"] },
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

    // Subscription 행이 없으므로 free다: 보고 에이전트는 pm·feature-scout만, 런북은 한 판, 본문이 아니라 스텁이 나간다.
    const ok = await request(`Bearer ${plain}`);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), expected);

    // hu_ + ?project=<slug>: 같은 본문이다. 프로젝트가 토큰이 아니라 인자에서 왔을 뿐이다(A-7).
    const scoped = await request(`Bearer ${user.plain}`, lang, id);
    assert.equal(scoped.status, 200);
    assert.deepEqual(await scoped.json(), expected);

    // 남의 슬러그와 없는 슬러그는 같은 403 문장이다 — 존재 여부를 흘리지 않는다.
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

    // 마지막 둘이 A-7이 더한 것이다: 슬러그 없는 hu_와 모르는 hu_. 둘 다 401이다.
    for (const header of [null, `Bearer ${newToken().plain}`, `Bearer ${newToken("owner").plain}`,
      `Bearer ${user.plain}`, `Bearer ${newToken("user").plain}`]) {
      const denied = await request(header);
      assert.equal(denied.status, 401);
    }
  } finally {
    await db.template.deleteMany({ where: { lang } });
    await cleanup(db, userId);
    await disconnect();
  }
});
