import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { createBoardService } from "../../../src/server/pipeline/api";
import { createToolDeps } from "../../../src/server/mcp/deps";
import { cleanup, connections, fixture, type Fixture } from "./support";

const HELD = "on hold — only the owner resumes it, on the web";
const ownerInput = { title: "Another item", area: "", source: "", type: null, addedBy: "owner" as const, addedByRunId: null };

type Head = { action: string; agent?: string };
async function head(db: PrismaClient, projectId: string): Promise<Head> {
  const overview = await createToolDeps(db).pipelineNext(projectId, undefined);
  assert.ok(overview.ok);
  return (overview.item as { head: Head }).head;
}
const isPm = (h: Head) => h.action === "dispatch" && h.agent === "pm";

for (const legacy of [false, true]) it(`a held item is neither proposable nor a pm candidate${legacy ? " (two held rows)" : ""}`, async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { status: "on_hold" });
    if (legacy) await db.boardItem.create({ data: { projectId: f.projectId, backlogItemId: f.backlogItemId, agent: "dev", status: "on_hold", reason: "Retrying after hold", proposedOn: new Date(Date.now() + 120_000) } });
    const service = createBoardService(db);
    assert.deepEqual(await service.propose(f.projectId, { key: f.key, agent: "dev", reason: "again" }, { actor: "agent", actorRef: "pm" }), { ok: false, reason: HELD });
    assert.deepEqual(await service.propose(f.projectId, { key: f.key, agent: "dev", reason: "again" }, { actor: "human", actorRef: f.userId, channel: "web" }), { ok: false, reason: HELD });
    assert.equal(await service.availableBacklogCount(f.projectId), 0);
    assert.equal(isPm(await head(db, f.projectId)), false, "only held items left: not pm's turn");
    assert.ok((await service.addBacklog(f.projectId, ownerInput)).ok);
    assert.equal(await service.availableBacklogCount(f.projectId), 1);
    assert.equal(isPm(await head(db, f.projectId)), true, "a pickable item brings pm back");
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("after the owner resumes a held item, proposing it is refused as already open", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { status: "on_hold" });
    const service = createBoardService(db);
    const resumed = await service.transition(f.projectId, { key: f.key, to: "planning" }, { actor: "human", actorRef: f.userId, channel: "web", expectedUpdatedAt: f.updatedAt });
    assert.ok(resumed.ok, JSON.stringify(resumed));
    assert.deepEqual(await service.propose(f.projectId, { key: f.key, agent: "dev", reason: "again" }, { actor: "agent", actorRef: "pm" }), { ok: false, reason: "already open" });
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});
