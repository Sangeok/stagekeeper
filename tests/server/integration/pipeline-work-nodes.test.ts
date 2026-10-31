import assert from "node:assert/strict";
import { it } from "node:test";
import { DEFAULT_SELECTION_POLICY } from "@harness/core/pipeline/pipeline.mjs";
import type { SelectionContext, SelectionDecision } from "@harness/core/pipeline/work-selection.mjs";
import { agentNext, createNextDeps } from "../../../src/server/agents/api";
import { assignmentContext, approveWorkGate, createBoardService, headFor, preparePipelineRun, savePipelineDefinition, setPipelineRule, startProjectWork, stopProjectWork } from "../../../src/server/pipeline/api";
import { afterProjectRead, checkpoint, cleanup, connections, fixture, seedPipelineVersion } from "./support";

const assignmentRecord = (context: SelectionContext): SelectionDecision => ({ contextKey: context.contextKey, policy: context.policy,
  criterion: "Oldest eligible item", readiness: "Source and workspace confirmed", assignmentReason: "Owns the root workspace", uncertainties: [],
  evidence: [{ key: "K-2", quote: "Issue #20: broken submit" }], comparisons: context.candidates.filter(item => item.eligible && item.key !== "K-2").map(item => ({ key: item.key, reason: "Newer task" })) });

it("assigns from an exact entry with evidence, rejects stale/foreign/duplicate decisions, and starts task steps", async () => {
  const pool = connections(2); const [db, other] = pool.all; const f = await fixture(db, { status: "done", plan: "pro" });
  const snapshot = checkpoint(); const pending: Promise<unknown>[] = [];
  try {
    await seedPipelineVersion(db, { projectId: f.projectId, version: 1, nodes: ["discover-work", "assign-work", "plan", "implement", "accept"], gates: ["before-plan"], format: "slots-v1", createdBy: f.userId });
    const backlog = await db.backlogItem.create({ data: { projectId: f.projectId, key: "K-2", title: "Form", area: "web", source: "Issue #20: broken submit" } });
    const head = await headFor(db, f.projectId);
    assert.ok(head.action === "dispatch" && head.agent === "work-assigner");
    if (head.action !== "dispatch") throw new Error("Missing assignment");
    const base = createNextDeps(db);
    const deps = { ...base, template: async () => "# Work\n## step:start   requires: can-propose\nnext: done\n\nChoose work.\n" };
    const opened = await agentNext(deps, { projectId: f.projectId, tokenId: "fixture" }, { agent: head.agent, entry: head.entry });
    assert.ok(opened.ok && !opened.item.done, JSON.stringify(opened));
    if (!opened.ok || opened.item.done) throw new Error("No receipt");
    const receipt = opened.item.receipt;
    const context = await assignmentContext(db, f.projectId, receipt.runId);
    assert.ok(context.ok);
    assert.equal(context.item.candidates.find(item => item.key === "K-1")?.eligible, false);
    const input = { key: "K-2", agent: "dev", reason: "Issue #20", assignmentRunId: receipt.runId, selectionDecision: assignmentRecord(context.item) };
    const board = createBoardService(db);
    assert.equal((await board.propose(f.projectId, input, { actor: "agent", actorRef: "token:other" })).ok, false);
    await db.backlogItem.update({ where: { id: backlog.id }, data: { source: "Issue #20: broken submit; reproduced today" } });
    assert.equal((await board.propose(f.projectId, input, { actor: "agent", actorRef: "token:fixture" })).ok, false);
    assert.equal(await db.boardItem.count({ where: { backlogItemId: backlog.id } }), 0);
    const current = await assignmentContext(db, f.projectId, receipt.runId); assert.ok(current.ok);
    input.selectionDecision = assignmentRecord(current.item);
    const competing = createBoardService(afterProjectRead(other, snapshot.hook)).propose(f.projectId, input, { actor: "agent", actorRef: "token:fixture" });
    pending.push(competing);
    await snapshot.entered();
    assert.ok((await board.propose(f.projectId, input, { actor: "agent", actorRef: "token:fixture" })).ok);
    snapshot.release();
    const refused = await competing;
    assert.ok(!refused.ok);
    assert.match(refused.reason, /board changed/);
    assert.equal(await db.boardItem.count({ where: { backlogItemId: backlog.id } }), 1);
    const saved = await db.boardItem.findFirstOrThrow({ where: { backlogItemId: backlog.id }, include: { run: true } });
    assert.deepEqual(saved.selectionDecision, input.selectionDecision);
    assert.equal(saved.run?.node, "before-plan");
    const finished = await agentNext(deps, { projectId: f.projectId, tokenId: "fixture" }, { agent: head.agent, entry: head.entry, receipt, outcome: "ok" });
    assert.ok(finished.ok && finished.item.done, JSON.stringify(finished));
    assert.equal((await headFor(db, f.projectId)).action, "none");
  } finally { try { snapshot.release(); await Promise.allSettled(pending); await cleanup(db, f.userId); } finally { await pool.disconnect(); } }
});

it("does not discover when the node is absent or placed after an empty assignment", async () => {
  const pool = connections(1); const [db] = pool.all;
  try {
    for (const nodes of [["plan", "implement", "accept"], ["assign-work", "plan", "implement", "accept", "discover-work"]]) {
      const f = await fixture(db, { status: "done", plan: "pro" });
      try {
        await seedPipelineVersion(db, { projectId: f.projectId, version: 1, nodes, gates: [], format: "slots-v1", createdBy: f.userId });
        const head = await headFor(db, f.projectId);
        assert.equal(head.action, "none");
        assert.equal(await db.agentRun.count({ where: { projectId: f.projectId } }), 0);
        if (nodes.includes("assign-work")) assert.match((await db.pipelineWorkRun.findFirstOrThrow({ where: { projectId: f.projectId } })).waitReason ?? "", /No eligible/);
      } finally { await cleanup(db, f.userId); }
    }
  } finally { await pool.disconnect(); }
});

it("starts the virtual default without a work item and audits a single current owner approval", async () => {
  const pool = connections(2); const [db, other] = pool.all; const f = await fixture(db, { status: "done", plan: "pro" });
  try {
    const identity = { projectId: f.projectId, userId: f.userId };
    const prepared = await preparePipelineRun(db, f.projectId, f.userId, `default_${f.projectId}`); assert.ok(prepared.ok);
    assert.ok(prepared.item.canStartWithoutWork);
    assert.ok((await startProjectWork(db, f.projectId, f.userId, prepared.item.pipelineId, prepared.item.graphKey)).ok);
    const head = await headFor(db, f.projectId);
    assert.ok(head.action === "dispatch" && head.agent === "work-discoverer");
    const saved = await savePipelineDefinition(db, { ...identity, pipelineId: prepared.item.pipelineId, expectedVersion: 1, definition: { steps: ["discover-work", "assign-work", "plan", "implement", "accept"], gates: ["before-discover-work"], selectionPolicy: DEFAULT_SELECTION_POLICY } });
    assert.equal(saved.status, "success");
    assert.equal((await headFor(db, f.projectId)).action, "none");
    const run = await db.pipelineWorkRun.findFirstOrThrow({ where: { projectId: f.projectId, closedAt: null } });
    const entry = { runId: run.id, entryId: run.entryId, slotId: run.node };
    assert.equal((await approveWorkGate(db, f.projectId, "other", entry)).ok, false);
    const approvals = await Promise.all([approveWorkGate(db, f.projectId, f.userId, entry), approveWorkGate(other, f.projectId, f.userId, entry)]);
    assert.equal(approvals.filter(result => result.ok).length, 1);
    const after = await db.pipelineWorkRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(after.node, "discover-work");
    assert.equal(Array.isArray(after.approvals) && after.approvals.length, 1);
    assert.ok((await headFor(db, f.projectId)).action === "dispatch");
  } finally { try { await cleanup(db, f.userId); } finally { await pool.disconnect(); } }
});

it("routes automatic assignments by type and stops new work without changing the assigned task", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { status: "done", plan: "pro" });
  try {
    const identity = { projectId: f.projectId, userId: f.userId };
    const route = await savePipelineDefinition(db, { ...identity, pipelineId: null, name: "Fixes", expectedVersion: 0, definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] } });
    assert.ok(route.status === "success");
    assert.ok((await setPipelineRule(db, { ...identity, type: "fix", pipelineId: route.pipelineId })).ok);
    await db.backlogItem.create({ data: { projectId: f.projectId, key: "K-2", title: "Form", area: "web", source: "Issue #20: broken submit", type: "fix" } });
    const head = await headFor(db, f.projectId); assert.ok(head.action === "dispatch" && head.agent === "work-assigner");
    const agent = await db.agentRun.create({ data: { projectId: f.projectId, agent: "work-assigner", tokenId: "fixture", stepId: "start", workRunId: head.entry.runId, workEntryId: head.entry.entryId } });
    const context = await assignmentContext(db, f.projectId, agent.id); assert.ok(context.ok);
    const assigned = await createBoardService(db).propose(f.projectId, { key: "K-2", agent: "dev", reason: "Issue #20", assignmentRunId: agent.id, selectionDecision: assignmentRecord(context.item) }, { actor: "agent", actorRef: "token:fixture" });
    assert.ok(assigned.ok);
    const task = await db.pipelineRun.findFirstOrThrow({ where: { boardItemId: assigned.item.id }, include: { version: true } });
    assert.equal(task.version.pipelineId, route.pipelineId);
    assert.equal((await stopProjectWork(db, f.projectId, "another-owner", head.entry.runId)).ok, false);
    assert.ok((await stopProjectWork(db, f.projectId, f.userId, head.entry.runId)).ok);
    assert.equal((await headFor(db, f.projectId)).action, "none");
    assert.deepEqual(await db.pipelineRun.findUniqueOrThrow({ where: { id: task.id }, include: { version: true } }), task);
    const prepared = await preparePipelineRun(db, f.projectId, f.userId, `default_${f.projectId}`); assert.ok(prepared.ok);
    assert.ok((await startProjectWork(db, f.projectId, f.userId, prepared.item.pipelineId, prepared.item.graphKey)).ok);
    assert.equal((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).workAutomationPaused, false);
  } finally { try { await cleanup(db, f.userId); } finally { await pool.disconnect(); } }
});

it("a changed selection policy retires a blocked assignment and rejects its old entry", async () => {
  const pool = connections(1); const [db] = pool.all; const f = await fixture(db, { status: "done", plan: "pro" });
  try {
    await db.backlogItem.create({ data: { projectId: f.projectId, key: "K-2", title: "Form", area: "web", source: "Issue #20: broken submit" } });
    const head = await headFor(db, f.projectId); assert.ok(head.action === "dispatch");
    const agent = await db.agentRun.create({ data: { projectId: f.projectId, agent: "work-assigner", tokenId: "fixture", stepId: "start", workRunId: head.entry.runId, workEntryId: head.entry.entryId,
      steps: { create: { stepId: "start", outcome: "blocked", accepted: true, note: "Clarify the selection policy" } } } });
    assert.equal((await headFor(db, f.projectId)).action, "none");
    const saved = await savePipelineDefinition(db, { projectId: f.projectId, userId: f.userId, pipelineId: `default_${f.projectId}`, expectedVersion: 1,
      definition: { steps: ["assign-work", "plan", "implement", "accept"], gates: ["before-plan"], selectionPolicy: "Reproduced form failures first" } });
    assert.equal(saved.status, "success");
    assert.ok((await db.agentRun.findUniqueOrThrow({ where: { id: agent.id } })).closedAt);
    assert.equal((await assignmentContext(db, f.projectId, agent.id)).ok, false);
    const next = await headFor(db, f.projectId); assert.ok(next.action === "dispatch" && next.agent === "work-assigner");
    assert.notEqual(next.entry.runId, head.entry.runId);
    assert.equal(await db.boardItem.count({ where: { projectId: f.projectId } }), 1);
  } finally { try { await cleanup(db, f.userId); } finally { await pool.disconnect(); } }
});
