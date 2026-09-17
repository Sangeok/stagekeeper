import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { cursorTransaction } from "./run-query";
import type { NextDeps, NextInput, NextOutput } from "./next";
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
