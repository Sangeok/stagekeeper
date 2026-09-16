import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { createNextDeps } from "../../../src/server/agents/runs";
import type { OutcomeCommit } from "../../../src/server/agents/next";
import { beforeRunClaim, cleanup, connections, failingAudit, fixture, ordered } from "./support";

const commit = (projectId: string, key: string, runId: string, destination: OutcomeCommit["destination"]): OutcomeCommit => ({
  scope: { projectId, tokenId: "caller" }, agent: "dev", key,
  receipt: { runId, stepId: "verify", revision: 0 }, outcome: "ok", note: null, destination,
});

const openRun = (db: PrismaClient, projectId: string, key: string) =>
  db.agentRun.create({ data: { projectId, agent: "dev", key, tokenId: "opener", stepId: "verify" } });

// 같은 receipt를 두 연결이 들고 온다. 승패를 고정해 양방향을 모두 돌린다 — 이긴 쪽만 전진하고
// 진 쪽은 거절 감사 한 줄만 남긴다(거절은 실행 증거가 아니다).
for (const winner of [0, 1]) {
  it(`one receipt advances once: connection ${winner} is accepted and the other is audited as rejected`, async () => {
    const { all, disconnect } = connections();
    const [a] = all;
    let userId: string | undefined;
    try {
      const f = await fixture(a, { status: "implementing" });
      userId = f.userId;
      const run = await openRun(a, f.projectId, f.key);
      const input = commit(f.projectId, f.key, run.id, { kind: "step", stepId: "report" });
      const race = ordered();
      const first = createNextDeps(beforeRunClaim(all[winner], race.winner)).commitOutcome(input);
      const second = createNextDeps(beforeRunClaim(all[1 - winner], race.loser)).commitOutcome(input);

      assert.deepEqual((await first).kind, "accepted");
      race.finish();
      assert.deepEqual(await second, { kind: "stale" });

      const after = await a.agentRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: { orderBy: { at: "asc" } } } });
      assert.equal(after.revision, 1);
      assert.equal(after.stepId, "report");
      assert.deepEqual(after.steps.map((step) => step.accepted).sort(), [false, true]);
      assert.ok(after.steps.every((step) => step.callerTokenId === "caller" && step.receiptRevision === 0));
      // 원장 두 줄 모두 실제 호출자에게 계수되고, run을 연 토큰에는 하나도 붙지 않는다.
      assert.equal(await createNextDeps(a).recentSteps("caller", new Date(0)), 2);
      assert.equal(await createNextDeps(a).recentSteps("opener", new Date(0)), 0);
      // 거절 행은 증거가 아니다 — verify ok 조회가 그 줄을 세지 않는다.
      assert.equal(await createNextDeps(a).verifyOk(f.projectId, "dev", f.key), true);
    } finally {
      await cleanup(a, userId);
      await disconnect();
    }
  });
}

it("a CAS loser does not consume the run's refusal counter", async () => {
  const { all, disconnect } = connections();
  const [a] = all;
  let userId: string | undefined;
  try {
    const f = await fixture(a, { status: "implementing" });
    userId = f.userId;
    const run = await openRun(a, f.projectId, f.key);
    const input = commit(f.projectId, f.key, run.id, { kind: "stay", refused: true });
    const race = ordered();
    const first = createNextDeps(beforeRunClaim(all[0], race.winner)).commitOutcome(input);
    const second = createNextDeps(beforeRunClaim(all[1], race.loser)).commitOutcome(input);

    const accepted = await first;
    race.finish();
    assert.deepEqual(await second, { kind: "stale" });
    assert.equal(accepted.kind === "accepted" && accepted.refused, 1);
    assert.equal((await a.agentRun.findUniqueOrThrow({ where: { id: run.id } })).refused, 1);
  } finally {
    await cleanup(a, userId);
    await disconnect();
  }
});

it("a failed audit row leaves the ledger, the cursor, and the refusal counter untouched", async () => {
  const { all: [a], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(a, { status: "implementing" });
    userId = f.userId;
    const run = await openRun(a, f.projectId, f.key);
    await assert.rejects(
      createNextDeps(failingAudit(a, "audit failure")).commitOutcome(commit(f.projectId, f.key, run.id, { kind: "step", stepId: "report" })),
      /audit failure/,
    );
    const after = await a.agentRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: true } });
    assert.equal(after.revision, 0);
    assert.equal(after.stepId, "verify");
    assert.equal(after.refused, 0);
    assert.deepEqual(after.steps, []);
  } finally {
    await cleanup(a, userId);
    await disconnect();
  }
});
