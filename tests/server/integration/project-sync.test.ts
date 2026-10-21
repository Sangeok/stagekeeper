import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { syncProject } from "../../../src/server/projects/api";
import { createToolDeps } from "../../../src/server/mcp/deps";
import { afterWorkspaceRead, cleanup, connections, ordered } from "./support";

const workspace = (agent: string) => ({ id: agent, agent, path: ".", verify: ["npm test"], knowledge: null, readOnly: [] });

it("two clients cannot grow a Free roster beyond its cap, and omitted agents are retained", async () => {
  const { all: [a, b], disconnect } = connections();
  const id = randomUUID();
  let userId: string | undefined;
  try {
    const user = await a.user.create({ data: { login: id, githubId: -Math.floor(Math.random() * 2_000_000_000) } });
    userId = user.id;
    const project = await a.project.create({ data: { slug: id, name: id, repoOwner: id, repo: id, branch: "main", ownerUserId: user.id } });

    const race = ordered();
    const first = syncProject(afterWorkspaceRead(a, race.winner), { projectId: project.id, language: "en", workspaces: [workspace("a")] });
    const second = syncProject(afterWorkspaceRead(b, race.loser), { projectId: project.id, language: "ko", workspaces: [workspace("b")] });
    assert.equal((await first).ok, true);
    race.finish();
    const lost = await second;
    assert.equal(lost.ok, false);
    assert.ok(!lost.ok && /conflicted/.test(lost.reason));

    const rows = await a.workspace.findMany({ where: { projectId: project.id } });
    assert.equal(rows.length, 1);
    const before = await a.project.findUniqueOrThrow({ where: { id: project.id } });
    const rejected = await syncProject(a, { projectId: project.id, language: "ja", workspaces: [workspace("c")] });
    assert.equal(rejected.ok, false);
    assert.deepEqual(await a.project.findUniqueOrThrow({ where: { id: project.id } }), before);
    assert.deepEqual(await a.workspace.findMany({ where: { projectId: project.id } }), rows);
    assert.equal((await syncProject(a, { projectId: project.id, workspaces: [workspace(rows[0].agent)] })).ok, true);

    const view = await createToolDeps(a).projectGet(project.id);
    assert.equal(view.workspaces[0].agent, rows[0].agent);
    assert.equal(view.owner, id);
  } finally {
    await cleanup(a, userId);
    await disconnect();
  }
});
