import assert from "node:assert/strict";
import { it } from "node:test";
import { createBoardService } from "../../../src/server/pipeline/board";
import { nextFor } from "../../../src/server/pipeline/run-query";
import { cleanup, connections, fixture } from "./support";

for (const verdict of ["pass", "fail", "blocked"] as const) it(`QA ${verdict} binds actual evidence and controls acceptance in PostgreSQL`, async () => {
  const { all: [db], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(db, { status: "implementing", plan: "max" }); userId = f.userId;
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, nodes: ["plan", "implement", "qa", "accept"], gates: [], format: "slots-v1", createdBy: "test" } });
    const pipeline = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "implement", entryId: "implementation-entry" } });
    const dev = await db.agentRun.create({ data: { projectId: f.projectId, agent: "dev", key: f.key, tokenId: "test", stepId: "report", closedAt: new Date(), pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId, steps: { create: [{ stepId: "verify", outcome: "ok", accepted: true }, { stepId: "report", outcome: "ok", accepted: true }] } } });
    const targetCommit = "a".repeat(40);
    await db.report.create({ data: { boardItemId: f.boardItemId, actor: "dev", agentRunId: dev.id, path: `docs/agents/dev/${f.key}.md`, commit: targetCommit } });
    const board = createBoardService(db); await board.advancePipeline(f.projectId, f.key);
    const entered = await db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } });
    assert.equal(entered.node, "qa"); assert.notEqual(entered.entryId, pipeline.entryId);
    assert.equal((await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).status, "done");
    const acceptance = { key: f.key, actor: "main-loop", path: `docs/agents/main-loop/${f.key}.md`, commit: "b".repeat(40) };
    assert.equal((await board.submitReport(f.projectId, acceptance, "test")).ok, false);
    const stepId = verdict === "pass" ? "report" : verdict === "fail" ? "failed-report" : "blocked-report";
    const qaRun = await db.agentRun.create({ data: { projectId: f.projectId, agent: "qa-verifier", key: f.key, tokenId: "test", stepId, pipelineRunId: pipeline.id, pipelineEntryId: entered.entryId, steps: { create: { stepId: "verify", outcome: verdict === "pass" ? "ok" : verdict === "fail" ? "failed" : "blocked", accepted: true } } } });
    const qa = { verdict, targetCommit, baseUrl: "http://127.0.0.1:3000", scenarios: [{ id: "reload", status: verdict, expected: "saved value", actual: verdict === "pass" ? "saved value" : "observed mismatch or missing test fixture", evidence: ["actual test observation"] }] };
    const submission = { key: f.key, actor: "qa-verifier", path: `docs/agents/qa-verifier/${f.key}.md`, commit: "c".repeat(40), runId: qaRun.id, qa };
    assert.equal((await board.submitReport(f.projectId, { ...submission, runId: undefined }, "test")).ok, false);
    assert.equal((await board.submitReport(f.projectId, { ...submission, qa: { ...qa, targetCommit: "d".repeat(40) } }, "test")).ok, false);
    assert.ok((await board.submitReport(f.projectId, submission, "test")).ok);
    await db.agentRun.update({ where: { id: qaRun.id }, data: { closedAt: new Date(), steps: { create: { stepId, outcome: "ok", accepted: true } } } });
    await board.advancePipeline(f.projectId, f.key);
    const next = await nextFor(db, f.projectId, f.key);
    if (verdict === "pass") {
      assert.equal(next.action, "accept"); assert.ok((await board.submitReport(f.projectId, acceptance, "test")).ok);
      assert.ok((await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).acceptedAt);
    } else {
      assert.equal(next.action, "wait"); assert.ok("on" in next && next.on === "qa");
      assert.equal((await board.submitReport(f.projectId, acceptance, "test")).ok, false);
      const before = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
      assert.ok((await board.transition(f.projectId, { key: f.key, to: "implementing", result: "Fix QA finding" }, { actor: "human", actorRef: f.userId, channel: "web", expectedUpdatedAt: before.updatedAt })).ok);
      const reset = await db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } }); assert.equal(reset.node, "implement"); assert.notEqual(reset.entryId, entered.entryId);
      assert.equal((await board.submitReport(f.projectId, submission, "test")).ok, false);
    }
  } finally { await cleanup(db, userId); await disconnect(); }
});
