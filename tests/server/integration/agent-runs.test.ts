import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { createNextDeps } from "../../../src/server/agents/api";
import type { OutcomeCommit } from "../../../src/server/agents/next";
import { beforeRunClaim, cleanup, connections, failingAudit, fixture, ordered } from "./support";

const commit = (projectId: string, key: string, runId: string, destination: OutcomeCommit["destination"]): OutcomeCommit => ({
  scope: { projectId, tokenId: "caller" }, agent: "dev", key,
  receipt: { runId, stepId: "verify", revision: 0 }, outcome: "ok", note: null, destination,
});

const openRun = (db: PrismaClient, projectId: string, key: string) =>
  db.agentRun.create({ data: { projectId, agent: "dev", key, tokenId: "opener", stepId: "verify" } });

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
      const settlements: Promise<unknown>[] = [];
      try {
        const first = createNextDeps(beforeRunClaim(all[winner], race.winner)).commitOutcome(input); settlements.push(Promise.allSettled([first]));
        const second = createNextDeps(beforeRunClaim(all[1 - winner], race.loser)).commitOutcome(input); settlements.push(Promise.allSettled([second]));
        assert.deepEqual((await first).kind, "accepted");
        race.finish();
        assert.deepEqual(await second, { kind: "stale" });
      } finally { race.cancel(); await Promise.all(settlements); }

      const after = await a.agentRun.findUniqueOrThrow({ where: { id: run.id }, include: { steps: { orderBy: { at: "asc" } } } });
      assert.equal(after.revision, 1);
      assert.equal(after.stepId, "report");
      assert.deepEqual(after.steps.map((step) => step.accepted).sort(), [false, true]);
      assert.ok(after.steps.every((step) => step.callerTokenId === "caller" && step.receiptRevision === 0));
      assert.equal(await a.agentRunStep.count({ where: { runId: run.id, callerTokenId: "caller" } }), 2);
      assert.equal(await a.agentRunStep.count({ where: { runId: run.id, callerTokenId: "opener" } }), 0);
      assert.equal(await a.agentRunStep.count({ where: { runId: run.id, callerTokenId: "caller", run: { projectId: f.projectId } } }), 2);
      assert.equal(await a.agentRunStep.count({ where: { runId: run.id, callerTokenId: "caller", run: { projectId: "another-project" } } }), 0);
      assert.equal(await createNextDeps(a).verifyOk(f.projectId, "dev", f.key), true);
    } finally {
      try {
        await cleanup(a, userId);
      } finally {
        await disconnect();
      }
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
    const settlements: Promise<unknown>[] = [];
    try {
      const first = createNextDeps(beforeRunClaim(all[0], race.winner)).commitOutcome(input); settlements.push(Promise.allSettled([first]));
      const second = createNextDeps(beforeRunClaim(all[1], race.loser)).commitOutcome(input); settlements.push(Promise.allSettled([second]));
      const accepted = await first;
      race.finish();
      assert.deepEqual(await second, { kind: "stale" });
      assert.equal(accepted.kind === "accepted" && accepted.refused, 1);
    } finally { race.cancel(); await Promise.all(settlements); }
    assert.equal((await a.agentRun.findUniqueOrThrow({ where: { id: run.id } })).refused, 1);
  } finally {
    try {
      await cleanup(a, userId);
    } finally {
      await disconnect();
    }
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
    try {
      await cleanup(a, userId);
    } finally {
      await disconnect();
    }
  }
});
