import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { cursorTransaction } from "./run-service";
import type { NextDeps } from "./next";
import type { NextInput, NextOutput } from "./next";
import type { ServerResult } from "../result";

function fixture({ casFails = false, auditFails = false } = {}) {
  const records: unknown[] = [];
  const locks: string[] = [];
  let step = "verify";
  let revision = 0;
  const run = () => ({ id: "agent-run", projectId: "project", agent: "dev", key: "KEY", pipelineRunId: "pipeline", pipelineEntryId: "entry", stepId: step, revision, refused: 0, closedAt: null });
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => { locks.push(parts.join("?")); return []; },
    project: { findUniqueOrThrow: async () => ({ ownerUserId: "owner" }), findUnique: async () => ({ ownerUserId: "owner", repoOwner: "repo", available: true, ownerUser: { subscription: { plan: "max" } } }) },
    workspace: { findMany: async () => [{ agent: "dev" }] },
    pipelineRun: { findUnique: async () => ({ id: "pipeline", entryId: "entry", node: "implement", closedAt: null, boardItemId: "item", version: { format: "slots-v1" }, boardItem: { projectId: "project", agent: "dev", backlogItemId: "backlog", backlogItem: { key: "KEY" }, status: "implementing", discardedAt: null } }) },
    boardItem: { findFirst: async () => ({ id: "item" }) },
    agentRun: { findFirst: async () => run(), findUnique: async () => run(), findUniqueOrThrow: async () => run(), updateMany: async () => { if (casFails) return { count: 0 }; step = "report"; revision++; return { count: 1 }; } },
    agentRunStep: { create: async (args: unknown) => { if (auditFails) throw new Error("audit failure"); records.push(args); } },
  };
  const client = { $transaction: async (work: (db: typeof tx) => Promise<ServerResult<NextOutput>>) => {
    const before = records.length;
    const beforeStep = step, beforeRevision = revision;
    try { return await work(tx); } catch (error) { records.splice(before); step = beforeStep; revision = beforeRevision; throw error; }
  } } as unknown as PrismaClient;
  const execute = cursorTransaction(client, {} as NextDeps);
  let called = 0;
  return { records, locks, run, called: () => called, invoke: (input: NextInput) => execute({ projectId: "project", tokenId: "token" }, input, "KEY", async (deps) => {
    called++;
    const committed = await deps.commitOutcome({ scope: { projectId: "project", tokenId: "token" }, agent: "dev", key: "KEY", receipt: input.receipt!, outcome: "ok", note: null, destination: { kind: "step", stepId: "report" } });
    if (committed.kind !== "accepted") return { ok: false, reason: "stale: cursor claim lost" };
    return { ok: true, item: { done: false, step: "report", instruction: "Report", receipt: { runId: committed.run.id, revision: committed.run.revision, stepId: committed.run.stepId } } };
  }) };
}
const claim: NextInput = { agent: "dev", entry: { runId: "pipeline", entryId: "entry", slotId: "implement" }, agentRunId: "agent-run", stepId: "verify", receipt: { runId: "agent-run", revision: 0, stepId: "verify" }, outcome: "ok" };

it("stale entry, run and step claims fail before every write", async () => {
  for (const input of [
    { ...claim, receipt: undefined }, { ...claim, stepId: "implement" }, { ...claim, agentRunId: "old-run" },
    { ...claim, receipt: { ...claim.receipt!, revision: 1 } },
    { ...claim, receipt: { ...claim.receipt!, stepId: "implement" }, stepId: undefined },
    { ...claim, entry: { ...claim.entry!, entryId: "old-entry" } },
    { ...claim, entry: { ...claim.entry!, slotId: "plan" } },
  ]) {
    const f = fixture();
    assert.equal((await f.invoke(input)).ok, false);
    assert.equal(f.called(), 0);
    assert.equal(f.records.length, 0);
  }
});
it("locks owner, pipeline, then agent and echoes the same binding", async () => {
  const f = fixture();
  const result = await f.invoke(claim);
  assert.ok(result.ok);
  assert.deepEqual(result.item.entry, claim.entry);
  assert.equal(result.item.agentRunId, claim.agentRunId);
  assert.match(f.locks[0], /User/); assert.match(f.locks[1], /PipelineRun/); assert.match(f.locks[2], /AgentRun/);
  assert.equal(f.records.length, 1);
  assert.ok(!result.item.done);
  assert.equal(result.item.receipt.revision, 1);
  assert.deepEqual(f.records[0], { data: { runId: "agent-run", stepId: "verify", outcome: "ok", note: null, callerTokenId: "token", receiptRevision: 0, accepted: true } });
});
it("cursor CAS failure rolls the preceding ledger append back", async () => {
  const f = fixture({ casFails: true });
  assert.equal((await f.invoke(claim)).ok, false);
  assert.equal(f.records.length, 0);
});
it("audit failure rolls back the receipt revision and cursor claim", async () => {
  const f = fixture({ auditFails: true });
  await assert.rejects(f.invoke(claim), /audit failure/);
  assert.equal(f.run().revision, 0);
  assert.equal(f.run().stepId, "verify");
  assert.equal(f.records.length, 0);
});

// 보드가 닫은 run의 마지막 terminal outcome(protocol.md). 닫은 스텝·보드 상태·닫힌 시각의 전이가 모두 맞을 때만 받는다.
// plan 단계는 제출(→ in_review)뿐 아니라 보류(→ on_hold)로도 닫힌다 — 열린 결정이나 대상 없음(2026-10-20 watch smoke).
function closedRun({ stepId, status, event }: { stepId: string; status: string; event: { from: string; to: string } | null }) {
  const closedAt = new Date("2026-10-20T08:00:21.945Z");
  const slotId = stepId === "hold" ? "implement" : "plan";
  const run = { id: "agent-run", projectId: "project", agent: "dev", key: "KEY", pipelineRunId: "pipeline", pipelineEntryId: "entry", stepId, revision: 0, refused: 0, closedAt };
  const asked: { from?: string; to: string }[] = [];
  const tx = {
    $queryRaw: async () => [],
    project: { findUniqueOrThrow: async () => ({ ownerUserId: "owner" }), findUnique: async () => ({ ownerUserId: "owner", repoOwner: "repo", available: true, ownerUser: { subscription: { plan: "max" } } }) },
    workspace: { findMany: async () => [{ agent: "dev" }] },
    pipelineRun: { findUnique: async () => ({ id: "pipeline", entryId: "entry", node: slotId, closedAt: null, boardItemId: "item", version: { format: "slots-v1" }, boardItem: { projectId: "project", agent: "dev", backlogItemId: "backlog", backlogItem: { key: "KEY" }, status, discardedAt: null } }) },
    boardItem: { findFirst: async () => ({ id: "item" }) },
    transitionEvent: { findFirst: async ({ where }: { where: { boardItemId: string; from?: string; to: string; at: Date } }) => {
      asked.push({ ...(where.from === undefined ? {} : { from: where.from }), to: where.to });
      const matches = event !== null && where.boardItemId === "item" && where.to === event.to && (where.from === undefined || where.from === event.from) && where.at.getTime() === closedAt.getTime();
      return matches ? { id: "event" } : null;
    } },
    // 실제 쿼리처럼 closedAt: null 조건을 지킨다 — 닫힌 run은 열린 run으로 다시 잡히지 않는다.
    agentRun: { findFirst: async ({ where }: { where: { closedAt?: null } }) => (where.closedAt === null ? null : run), findUnique: async () => run },
  };
  const client = { $transaction: async (work: (db: typeof tx) => Promise<ServerResult<NextOutput>>) => work(tx) } as unknown as PrismaClient;
  const execute = cursorTransaction(client, {} as NextDeps);
  let reached = 0;
  const invoke = (outcome: NonNullable<NextInput["outcome"]>) => execute({ projectId: "project", tokenId: "token" }, {
    agent: "dev", entry: { runId: "pipeline", entryId: "entry", slotId }, agentRunId: "agent-run", stepId,
    receipt: { runId: "agent-run", revision: 0, stepId }, outcome,
  }, "KEY", async () => { reached++; return { ok: true, item: { done: true, step: stepId, instruction: "", receipt: { runId: "agent-run", revision: 1, stepId } } }; });
  return { invoke, asked, reached: () => reached };
}

it("accepts the final outcome of a plan step the dev closed by putting the item on hold", async () => {
  const f = closedRun({ stepId: "plan", status: "on_hold", event: { from: "planning", to: "on_hold" } });
  assert.ok((await f.invoke("ok")).ok);
  assert.equal(f.reached(), 1);
  assert.deepEqual(f.asked, [{ from: "planning", to: "on_hold" }]);
});
it("still accepts the final outcome after plan submission and after the hold step", async () => {
  const submitted = closedRun({ stepId: "plan", status: "in_review", event: { from: "planning", to: "in_review" } });
  assert.ok((await submitted.invoke("ok")).ok);
  assert.deepEqual(submitted.asked, [{ from: "planning", to: "in_review" }]);
  const held = closedRun({ stepId: "hold", status: "on_hold", event: { from: "implementing", to: "on_hold" } });
  assert.ok((await held.invoke("ok")).ok);
  assert.deepEqual(held.asked, [{ to: "on_hold" }]);
});
it("refuses a closed plan run when the board does not show that run's hold", async () => {
  for (const [label, f, outcome] of [
    ["no planning → on_hold transition at the run's close", closedRun({ stepId: "plan", status: "on_hold", event: null }), "ok"],
    ["resumed since the hold", closedRun({ stepId: "plan", status: "planning", event: { from: "planning", to: "on_hold" } }), "ok"],
    ["handoff is not terminal evidence", closedRun({ stepId: "plan", status: "on_hold", event: { from: "planning", to: "on_hold" } }), "handoff"],
  ] as const) {
    const result = await f.invoke(outcome);
    assert.equal(result.ok, false, label);
    assert.match(result.ok ? "" : result.reason, /^stale:/, label);
    assert.equal(f.reached(), 0, label);
  }
});
