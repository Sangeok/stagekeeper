import assert from "node:assert/strict";
import { it } from "node:test";
import { headFor } from "../../../src/server/pipeline/run-query";
import { createToolDeps } from "../../../src/server/mcp/deps";
import { cleanup, connections, fixture, type Fixture } from "./support";

it("head scouts only after a backlog change, and only accepted report completion suppresses it", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    const before = new Date(Date.now() - 60_000); const closedAt = new Date(before.getTime() + 1000);
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { createdAt: before } });
    const read = () => headFor(db, f!.projectId, 0, 0, false);
    assert.equal((await read()).action, "dispatch");
    const run = await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "report", closedAt } });
    assert.equal((await read()).action, "dispatch", "interrupted close is not completion");
    const report = await db.agentRunStep.create({ data: { runId: run.id, stepId: "report", outcome: "ok", accepted: false } });
    assert.equal((await read()).action, "dispatch", "refused report is not evidence");
    for (const accepted of [true, null]) {
      await db.agentRunStep.update({ where: { id: report.id }, data: { accepted } });
      const head = await read(); assert.equal(head.action, "none"); if (head.action === "none") assert.match(head.reason, /already looked/);
    }
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { title: "Editing does not restart scout" } });
    assert.equal((await read()).action, "none");
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { createdAt: closedAt } });
    assert.equal((await read()).action, "dispatch", "equal timestamps are not strictly after");
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { createdAt: before, removedAt: new Date(closedAt.getTime() + 1), removedReason: "done" } });
    assert.equal((await read()).action, "dispatch", "completion/removal is a change");
    await db.backlogItem.delete({ where: { id: f.backlogItemId } });
    assert.equal((await read()).action, "none", "an empty project still remembers a completed scout");
    await db.agentRun.update({ where: { id: run.id }, data: { key: "K-1" } });
    assert.equal((await read()).action, "dispatch", "head evidence must be project-scoped");
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("at the dispatch cap only a matching unbound scout can resume the empty head", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db);
    await db.agentRun.createMany({ data: Array.from({ length: 60 }, (_, i) => ({ projectId: f!.projectId, agent: "pm", tokenId: `cap-${i}`, stepId: "report", closedAt: new Date() })) });
    const read = () => headFor(db, f!.projectId, 0, 0, false);
    const capped = await read(); assert.equal(capped.action, "none"); if (capped.action === "none") assert.match(capped.reason, /dispatch cap/);
    const pm = await db.agentRun.create({ data: { projectId: f.projectId, agent: "pm", tokenId: "t", stepId: "start" } });
    assert.equal((await read()).action, "none", "PM cannot resume as scout");
    const version = await db.pipelineVersion.findFirstOrThrow({ where: { projectId: f.projectId } });
    const pipeline = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "feature-scout", entryId: "entry" } });
    const scout = await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "write", pipelineRunId: pipeline.id, pipelineEntryId: "entry" } });
    assert.equal((await read()).action, "none", "bound runs belong to their slot");
    await db.agentRun.update({ where: { id: scout.id }, data: { pipelineRunId: null, pipelineEntryId: null } });
    const resumed = await read(); assert.equal(resumed.action, "dispatch"); if (resumed.action === "dispatch") assert.equal(resumed.agent, "feature-scout");
    assert.equal((await headFor(db, f.projectId, 2, 0, false)).action, "none", "resume never bypasses open-item limit");
    const candidateHead = await headFor(db, f.projectId, 0, 1, false); assert.equal(candidateHead.action, "dispatch");
    if (candidateHead.action === "dispatch") assert.equal(candidateHead.agent, "pm");
    await db.agentRun.update({ where: { id: pm.id }, data: { closedAt: new Date() } });
    assert.equal((await headFor(db, f.projectId, 0, 1, false)).action, "none", "scout resume cannot bypass PM cap");
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("a real overview dispatches its trailing Scout slot once, then remembers the bound report", async () => {
  const pool = connections(1); const [db] = pool.all; let f: Fixture | undefined;
  try {
    f = await fixture(db, { plan: "pro", status: "done" });
    const earlier = new Date(Date.now() - 10000);
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { acceptedAt: earlier } });
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { createdAt: earlier, removedAt: earlier, removedReason: "done" } });
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, format: "slots-v1", createdBy: f.userId,
      nodes: ["propose", "plan", "implement", "accept", "feature-scout"], gates: ["before-plan", "before-implement"] } });
    const pipeline = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "feature-scout", entryId: "entry", enteredAt: earlier } });
    const tools = createToolDeps(db);
    const first = await tools.pipelineNext(f.projectId, undefined);
    const firstJson = JSON.stringify(first);
    assert.match(firstJson, /a Scout node in items dispatches feature-scout/);
    assert.equal([...firstJson.matchAll(/"action":"dispatch"/g)].length, 1);
    assert.match(firstJson, /"slotId":"feature-scout"/);
    await db.agentRun.create({ data: { projectId: f.projectId, agent: "feature-scout", tokenId: "t", stepId: "report", closedAt: new Date(),
      pipelineRunId: pipeline.id, pipelineEntryId: "entry", steps: { create: { stepId: "report", outcome: "ok", accepted: true } } } });
    const second = JSON.stringify(await tools.pipelineNext(f.projectId, undefined));
    assert.match(second, /feature-scout already looked/); assert.doesNotMatch(second, /"action":"dispatch"/);
    assert.ok((await db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } })).closedAt);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});
