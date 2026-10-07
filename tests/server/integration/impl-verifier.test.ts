import assert from "node:assert/strict";
import { it } from "node:test";
import { actionableWork } from "@harness/core/watch.mjs";
import { createBoardService } from "../../../src/server/pipeline/board";
import { nextFor } from "../../../src/server/pipeline/run-query";
import { cleanup, connections, fixture } from "./support";

for (const verdict of ["pass", "fail", "blocked"] as const) it(`impl-verifier ${verdict} binds its run, controls acceptance and never outlives its entry in PostgreSQL`, async () => {
  const { all: [db], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(db, { status: "implementing", plan: "max" }); userId = f.userId;
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, nodes: ["plan", "implement", "impl-verify", "accept"], gates: [], format: "slots-v1", createdBy: "test" } });
    const pipeline = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "implement", entryId: "implementation-entry" } });
    const board = createBoardService(db);
    const acceptance = { key: f.key, actor: "main-loop", path: `docs/agents/main-loop/${f.key}.md`, commit: "b".repeat(40) };
    const stepId = verdict === "pass" ? "report" : verdict === "fail" ? "failed-report" : "blocked-report";
    // dev가 그 entry에서 구현을 끝내고 보고한 상태로 커서를 옮긴다. 다시 열린 뒤에도 같은 길로 다시 들어온다.
    const implement = async (entryId: string | null) => {
      const dev = await db.agentRun.create({ data: { projectId: f.projectId, agent: "dev", key: f.key, tokenId: "test", stepId: "report", closedAt: new Date(), pipelineRunId: pipeline.id, pipelineEntryId: entryId, steps: { create: [{ stepId: "verify", outcome: "ok", accepted: true }, { stepId: "report", outcome: "ok", accepted: true }] } } });
      await db.report.create({ data: { boardItemId: f.boardItemId, actor: "dev", agentRunId: dev.id, path: `docs/agents/dev/${f.key}.md`, commit: "a".repeat(40) } });
      await board.advancePipeline(f.projectId, f.key);
      return db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } });
    };
    // 그 entry에 결합된 impl-verifier run을 verdict로 끝내고 보고한 뒤 다음 일을 묻는다.
    const verify = async (entryId: string | null) => {
      const run = await db.agentRun.create({ data: { projectId: f.projectId, agent: "impl-verifier", key: f.key, tokenId: "test", stepId, pipelineRunId: pipeline.id, pipelineEntryId: entryId, steps: { create: { stepId: "verify", outcome: verdict === "pass" ? "ok" : verdict === "fail" ? "failed" : "blocked", accepted: true } } } });
      const submission = { key: f.key, actor: "impl-verifier", path: `docs/agents/impl-verifier/${f.key}.md`, commit: "c".repeat(40), runId: run.id };
      assert.equal((await board.submitReport(f.projectId, { ...submission, runId: undefined }, "test")).ok, false);
      assert.equal((await board.submitReport(f.projectId, { ...submission, path: `docs/agents/qa-verifier/${f.key}.md` }, "test")).ok, false);
      assert.equal((await board.submitReport(f.projectId, { ...submission, commit: "HEAD" }, "test")).ok, false);
      assert.ok((await board.submitReport(f.projectId, submission, "test")).ok);
      await db.agentRun.update({ where: { id: run.id }, data: { closedAt: new Date(), steps: { create: { stepId, outcome: "ok", accepted: true } } } });
      await board.advancePipeline(f.projectId, f.key);
      return { submission, next: await nextFor(db, f.projectId, f.key) };
    };

    const entered = await implement(pipeline.entryId);
    assert.equal(entered.node, "impl-verify"); assert.notEqual(entered.entryId, pipeline.entryId);
    assert.equal((await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).status, "done");
    const first = await nextFor(db, f.projectId, f.key);
    assert.ok(first.action === "dispatch" && first.agent === "impl-verifier", JSON.stringify(first));
    assert.equal((await board.submitReport(f.projectId, acceptance, "test")).ok, false);
    const { submission, next } = await verify(entered.entryId);
    // 닫힌 run의 보고를 다시 내면 거부된다(11절). 대기면 결합 run이 닫혀서, 통과면 커서가 accept로 넘어가서다.
    // 사유까지 본다 — 뒤의 stale report run 검사도 같은 제출을 거부하므로, ok만 보면 앞의 두 검사가 빠져도 녹색이다.
    const again = await board.submitReport(f.projectId, submission, "test");
    assert.ok(!again.ok && (verdict === "pass" ? /requires the current impl-verify entry/ : /does not match the current run's outcome/).test(again.reason), JSON.stringify(again));
    if (verdict === "pass") {
      assert.equal(next.action, "accept");
    } else {
      if (next.action !== "wait" || next.on !== "impl-verify") throw new Error(`expected wait on impl-verify: ${JSON.stringify(next)}`);
      assert.equal(next.resume.agent, "impl-verifier"); assert.equal(next.resume.entry?.entryId, entered.entryId); assert.equal(next.commit, "c".repeat(40));
      // 서버가 내는 대기는 배포된 감시기가 받는 모양이어야 한다. 하나라도 틀리면 감시가 overview 전체를 거부한다.
      assert.doesNotThrow(() => actionableWork({ head: { action: "none", reason: "No candidates." }, items: [next] }, { commit: false, propose: false }));
      assert.equal((await board.submitReport(f.projectId, acceptance, "test")).ok, false);
    }
    // 다시 열고 다시 구현해 들어오면, 옛 entry의 run은 통과든 실패든 완료 근거가 되지 않고 새 검증이 디스패치된다.
    const before = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    assert.ok((await board.transition(f.projectId, { key: f.key, to: "implementing", result: "Fix verification finding" }, { actor: "human", actorRef: f.userId, channel: "web", expectedUpdatedAt: before.updatedAt })).ok);
    const reset = await db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } }); assert.equal(reset.node, "implement"); assert.notEqual(reset.entryId, entered.entryId);
    assert.equal((await board.submitReport(f.projectId, submission, "test")).ok, false);
    const reentered = await implement(reset.entryId);
    assert.equal(reentered.node, "impl-verify"); assert.notEqual(reentered.entryId, entered.entryId);
    const fresh = await nextFor(db, f.projectId, f.key);
    assert.ok(fresh.action === "dispatch" && fresh.agent === "impl-verifier", JSON.stringify(fresh));
    if (verdict === "pass") {
      assert.equal((await verify(reentered.entryId)).next.action, "accept");
      assert.ok((await board.submitReport(f.projectId, acceptance, "test")).ok);
      assert.ok((await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).acceptedAt);
    }
  } finally { await cleanup(db, userId); await disconnect(); }
});

// 둘째 경우는 impl-verify를 지나 accept 전의 슬롯에 선 항목이다. 첫 차단 줄은 커서가 impl-verify일 때만 걸리므로 그래프 차단 줄이 막는다.
// 문구는 before-accept 게이트에서와 같은 기존 한계다(검증이 끝났어도 "has not completed"). 거부 자체가 맞다.
for (const [title, nodes, node] of [
  ["at impl-verify names the implementation check even when qa follows", ["plan", "implement", "impl-verify", "qa", "accept"], "impl-verify"],
  ["after impl-verify still waits for accept when a project slot follows", ["plan", "implement", "impl-verify", "doc-auditor#2", "accept"], "doc-auditor#2"],
] as const) it(`acceptance ${title}`, async () => {
  const { all: [db], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(db, { status: "done", plan: "max" }); userId = f.userId;
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, nodes: [...nodes], gates: [], format: "slots-v1", createdBy: "test" } });
    await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node, entryId: "verification-entry" } });
    const result = await createBoardService(db).submitReport(f.projectId, { key: f.key, actor: "main-loop", path: `docs/agents/main-loop/${f.key}.md`, commit: "b".repeat(40) }, "test");
    assert.ok(!result.ok && /^Implementation verification has not completed/.test(result.reason));
  } finally { await cleanup(db, userId); await disconnect(); }
});
