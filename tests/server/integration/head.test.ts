import assert from "node:assert/strict";
import { it } from "node:test";
import { headFor } from "../../../src/server/pipeline/api";
import { createToolDeps } from "../../../src/server/mcp/deps";
import { seedPipelineVersion, cleanup, connections, fixture, type Fixture } from "./support";

it("only completion bound to the current work entry advances discovery", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { status: "done" });
  try {
    const head = await headFor(db, f.projectId); assert.ok(head.action === "dispatch");
    await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "report", closedAt: new Date(), steps: { create: { stepId: "report", outcome: "ok", accepted: true } } } });
    assert.equal((await headFor(db, f.projectId)).action, "dispatch");
    await db.agentRun.create({ data: { projectId: f.projectId, agent: "work-discoverer", tokenId: "t", stepId: "report", closedAt: new Date(), workRunId: head.entry.runId, workEntryId: head.entry.entryId,
      steps: { create: { stepId: "report", outcome: "ok", accepted: true } } } });
    assert.equal((await headFor(db, f.projectId)).action, "none");
    assert.equal((await db.pipelineWorkRun.findUniqueOrThrow({ where: { id: head.entry.runId } })).node, "assign-work");
    await db.backlogItem.create({ data: { projectId: f.projectId, key: "K-2", title: "New work", area: "web", source: "Observed failure" } });
    const assign = await headFor(db, f.projectId);
    assert.ok(assign.action === "dispatch" && assign.agent === "work-assigner");
  } finally { try { await cleanup(db, f.userId); } finally { await pool.disconnect(); } }
});

it("the usage cap allows only an existing execution bound to the current project entry to resume", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { status: "done" });
  try {
    const head = await headFor(db, f.projectId); assert.ok(head.action === "dispatch");
    await db.user.update({ where: { id: f.userId }, data: { usageWindowStartedAt: new Date(), usageRunCount: 20 } });
    const capped = await headFor(db, f.projectId);
    assert.ok(capped.action === "none" && capped.code === "USAGE_LIMIT_REACHED");
    await db.agentRun.create({ data: { projectId: f.projectId, agent: "work-discoverer", tokenId: "t", stepId: "write" } });
    assert.equal((await headFor(db, f.projectId)).action, "none");
    await db.agentRun.create({ data: { projectId: f.projectId, agent: "work-discoverer", tokenId: "t", stepId: "write", workRunId: head.entry.runId, workEntryId: head.entry.entryId } });
    const resumed = await headFor(db, f.projectId);
    assert.ok(resumed.action === "dispatch" && resumed.agent === "work-discoverer");
    assert.deepEqual(resumed.entry, head.entry);
  } finally { try { await cleanup(db, f.userId); } finally { await pool.disconnect(); } }
});

it("a real overview dispatches its trailing Scout slot once, then remembers the bound report", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { plan: "pro", status: "done" });
    const earlier = new Date(Date.now() - 10000);
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { acceptedAt: earlier } });
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { createdAt: earlier, removedAt: earlier, removedReason: "done" } });
    const version = await seedPipelineVersion(db, { projectId: f.projectId, version: 1, format: "slots-v1", createdBy: f.userId,
      nodes: ["propose", "plan", "implement", "accept", "feature-scout"], gates: ["before-plan", "before-implement"] });
    const pipeline = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "feature-scout", entryId: "entry", enteredAt: earlier } });
    const tools = createToolDeps(db);
    const first = await tools.pipelineNext(f.projectId, undefined);
    const firstJson = JSON.stringify(first);
    assert.match(firstJson, /no Assign work step/);
    assert.equal([...firstJson.matchAll(/"action":"dispatch"/g)].length, 1);
    assert.match(firstJson, /"slotId":"feature-scout"/);
    await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "report", closedAt: new Date(),
      pipelineRunId: pipeline.id, pipelineEntryId: "entry", steps: { create: { stepId: "report", outcome: "ok", accepted: true } } } });
    const second = JSON.stringify(await tools.pipelineNext(f.projectId, undefined));
    assert.match(second, /no Assign work step/); assert.doesNotMatch(second, /"action":"dispatch"/);
    assert.ok((await db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } })).closedAt);
  } finally { try { await cleanup(db, f?.userId); } finally { await pool.disconnect(); } }
});
