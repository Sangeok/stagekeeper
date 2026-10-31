import assert from "node:assert/strict";
import { it } from "node:test";
import { createBoardService, preparePipelineRun, savePipelineDefinition, nextFor, loadItemPipelineView } from "../../../src/server/pipeline/api";
import { cleanup, connections, fixture, seedPipelineVersion, pipelineState } from "./support";

for (const accepted of [false, true]) it(`runs implementation checks directly with preserved source evidence and acceptance=${accepted}`, async () => {
  const pool = connections(2); const [db, other] = pool.all;
  const f = await fixture(db, { status: "done", plan: "max", planPath: "docs/plans/K-1.md", planCommit: "b".repeat(40), validation: "pass" });
  try {
    const sourceVersion = await seedPipelineVersion(db, { projectId: f.projectId, version: 1, nodes: ["plan", "implement", "accept"], gates: [], format: "slots-v1", createdBy: f.userId });
    const source = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: sourceVersion.id, node: "accept", closedAt: new Date(), entryId: "source" } });
    const acceptedAt = accepted ? new Date() : null;
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { currentRunId: source.id, acceptedAt } });
    const developer = await db.agentRun.create({ data: { projectId: f.projectId, agent: "dev", key: f.key, tokenId: "fixture", stepId: "report", closedAt: new Date(), pipelineRunId: source.id, pipelineEntryId: "implementation",
      steps: { create: [{ stepId: "verify", outcome: "ok", accepted: true }, { stepId: "report", outcome: "ok", accepted: true }] } } });
    const implementation = await db.report.create({ data: { boardItemId: f.boardItemId, agentRunId: developer.id, actor: "dev", path: "docs/agents/dev/K-1.md", commit: "a".repeat(40) } });
    const saved = await savePipelineDefinition(db, { projectId: f.projectId, userId: f.userId, pipelineId: null, name: "verify-implementation", expectedVersion: 0, definition: { steps: ["impl-verify", "qa"], gates: [] } });
    assert.equal(saved.status, "success"); if (saved.status !== "success") throw new Error("pipeline fixture failed");
    const beforePreparation = await pipelineState(db, f.projectId);
    const prepared = await preparePipelineRun(db, f.projectId, f.userId, saved.pipelineId);
    assert.deepEqual(await pipelineState(db, f.projectId), beforePreparation);
    assert.ok(prepared.ok);
    const target = prepared.item.targets.find(item => item.id === f.boardItemId)!;
    assert.equal(target.reason, null);
    const input = { pipelineId: saved.pipelineId, graphKey: prepared.item.graphKey, targetId: target.id, targetKind: "board" as const, agent: "dev", expectedUpdatedAt: target.updatedAt };
    const results = await Promise.all([createBoardService(db).startPipeline(f.projectId, f.userId, input), createBoardService(other).startPipeline(f.projectId, f.userId, input)]);
    assert.equal(results.filter(result => result.ok).length, 1);
    const started = results.find(result => result.ok)!;
    if (!started.ok) throw new Error("No successful start");
    const board = createBoardService(db);
    const active = await db.pipelineRun.findUniqueOrThrow({ where: { id: started.item.runId } });
    assert.notEqual(active.id, source.id);
    assert.equal(active.inputReportId, implementation.id);
    assert.deepEqual(await db.pipelineRun.findUniqueOrThrow({ where: { id: source.id } }), source);
    assert.equal((await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).acceptedAt?.getTime() ?? null, acceptedAt?.getTime() ?? null);
    assert.equal((await board.submitReport(f.projectId, { key: f.key, actor: "main-loop", path: "docs/agents/main-loop/K-1.md", commit: "c".repeat(40) }, "fixture")).ok, false);

    for (const agent of ["impl-verifier", "qa-verifier"]) {
      const next = await nextFor(db, f.projectId, f.key);
      assert.ok(next.action === "dispatch" && next.agent === agent);
      if (next.action !== "dispatch" || !next.entry) throw new Error("Missing dispatch entry");
      const run = await db.agentRun.create({ data: { projectId: f.projectId, agent, key: f.key, tokenId: "fixture", stepId: "report", pipelineRunId: active.id, pipelineEntryId: next.entry.entryId,
        steps: { create: { stepId: "verify", outcome: "ok", accepted: true } } } });
      const qa = agent === "qa-verifier" ? { verdict: "pass", targetCommit: implementation.commit, baseUrl: "http://127.0.0.1:3000", scenarios: [{ id: "check", status: "pass", expected: "saved result", actual: "saved result", evidence: ["fixture observation"] }] } : undefined;
      const report = await board.submitReport(f.projectId, { key: f.key, actor: agent, path: `docs/agents/${agent}/K-1.md`, commit: "c".repeat(40), runId: run.id, qa }, "fixture");
      assert.ok(report.ok, JSON.stringify(report));
      await db.agentRun.update({ where: { id: run.id }, data: { closedAt: new Date(), steps: { create: { stepId: "report", outcome: "ok", accepted: true } } } });
      await board.advancePipeline(f.projectId, f.key);
    }
    assert.equal((await nextFor(db, f.projectId, f.key)).action, "done");
    const after = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    assert.equal(after.status, "done");
    assert.equal(after.acceptedAt?.getTime() ?? null, acceptedAt?.getTime() ?? null);
    assert.equal(await db.pipelineRun.count({ where: { boardItemId: f.boardItemId } }), 2);
    assert.equal(await db.transitionEvent.count({ where: { boardItemId: f.boardItemId, note: `pipeline-completed:${active.id}` } }), 1);
    assert.equal((await loadItemPipelineView(db, f.projectId, f.boardItemId)).runState, "completed");
    const checkRun = await db.pipelineRun.findUniqueOrThrow({ where: { id: active.id } });
    const reopened = await board.transition(f.projectId, { key: f.key, to: "implementing", result: "Fix the implementation after checking" }, { actor: "human", actorRef: f.userId, channel: "web", expectedUpdatedAt: after.updatedAt });
    assert.ok(reopened.ok, JSON.stringify(reopened));
    const resumed = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId }, include: { run: true } });
    assert.equal(resumed.run?.node, "implement");
    assert.equal(resumed.run?.versionId, sourceVersion.id);
    assert.notEqual(resumed.run?.id, source.id);
    assert.equal(resumed.acceptedAt, null);
    assert.deepEqual(await db.pipelineRun.findUniqueOrThrow({ where: { id: active.id } }), checkRun);
    assert.deepEqual(await db.pipelineRun.findUniqueOrThrow({ where: { id: source.id } }), source);
  } finally { try { await cleanup(db, f.userId); } finally { await pool.disconnect(); } }
});

it("a pipeline containing Default starts as a root; changed graphs, foreign owners and missing inputs leave no writes", async () => {
  const pool = connections(1); const [db] = pool.all;
  const f = await fixture(db, { status: "done", plan: "max" });
  try {
    const identity = { projectId: f.projectId, userId: f.userId };
    const parent = await savePipelineDefinition(db, { ...identity, pipelineId: null, name: "Development and docs", expectedVersion: 0, definition: { steps: [`pipeline:default_${f.projectId}`], gates: [] } });
    assert.equal(parent.status, "success"); if (parent.status !== "success") throw new Error("fixture failed");
    const prepared = await preparePipelineRun(db, f.projectId, f.userId, parent.pipelineId);
    assert.ok(prepared.ok);
    const target = prepared.item.targets.find(item => item.kind === "backlog")!;
    assert.equal(target.reason, null);
    const input = { pipelineId: parent.pipelineId, graphKey: prepared.item.graphKey, targetId: target.id, targetKind: "backlog" as const, agent: "dev", expectedUpdatedAt: null };
    const board = createBoardService(db);
    const snapshot = await pipelineState(db, f.projectId);
    assert.equal((await board.startPipeline(f.projectId, "someone-else", input)).ok, false);
    assert.equal((await board.startPipeline(f.projectId, f.userId, { ...input, graphKey: "0".repeat(64) })).ok, false);
    assert.deepEqual(await pipelineState(db, f.projectId), snapshot);
    const result = await board.startPipeline(f.projectId, f.userId, input);
    assert.ok(result.ok, JSON.stringify(result));
    const run = await db.pipelineRun.findUniqueOrThrow({ where: { id: result.item.runId }, include: { version: true } });
    assert.equal(run.version.pipelineId, parent.pipelineId);
    assert.ok(run.version.nodes.includes("plan") && run.version.nodes.includes("accept"));
    const checks = await savePipelineDefinition(db, { ...identity, pipelineId: null, name: "Check", expectedVersion: 0, definition: { steps: ["impl-verify"], gates: [] } });
    assert.ok(checks.status === "success"); if (checks.status !== "success") throw new Error("fixture failed");
    const check = await preparePipelineRun(db, f.projectId, f.userId, checks.pipelineId);
    assert.ok(check.ok);
    const incomplete = check.item.targets.find(item => item.kind === "board" && item.key === f.key)!;
    assert.match(incomplete.reason ?? "", /running pipeline/);
    const before = await pipelineState(db, f.projectId);
    assert.equal((await board.startPipeline(f.projectId, f.userId, { pipelineId: checks.pipelineId, graphKey: check.item.graphKey, targetKind: "board", targetId: incomplete.id, expectedUpdatedAt: incomplete.updatedAt, agent: "dev" })).ok, false);
    assert.deepEqual(await pipelineState(db, f.projectId), before);
  } finally { try { await cleanup(db, f.userId); } finally { await pool.disconnect(); } }
});
