import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { cursorTransaction } from "./run-query";
import type { NextDeps, NextInput, NextOutput } from "./next";
import type { ServerResult } from "../result";

function fixture({ casFails = false } = {}) {
  const records: unknown[] = [];
  const locks: string[] = [];
  let step = "verify";
  const run = () => ({ id: "agent-run", projectId: "project", agent: "dev", key: "KEY", pipelineRunId: "pipeline", pipelineEntryId: "entry", stepId: step, closedAt: null });
  const tx = {
    $queryRaw: async (parts: TemplateStringsArray) => { locks.push(parts.join("?")); return []; },
    project: { findUniqueOrThrow: async () => ({ ownerUserId: "owner" }), findUnique: async () => ({ ownerUserId: "owner", repoOwner: "repo", available: true, ownerUser: { subscription: { plan: "max" } } }) },
    workspace: { findMany: async () => [{ agent: "dev" }] },
    pipelineRun: { findUnique: async () => ({ id: "pipeline", entryId: "entry", node: "implement", closedAt: null, boardItemId: "item", version: { format: "slots-v1" }, boardItem: { projectId: "project", agent: "dev", backlogItemId: "backlog", backlogItem: { key: "KEY" }, status: "implementing", discardedAt: null } }) },
    boardItem: { findFirst: async () => ({ id: "item" }) },
    agentRun: { findFirst: async () => run(), findUnique: async () => run(), updateMany: async () => { if (casFails) return { count: 0 }; step = "report"; return { count: 1 }; } },
    agentRunStep: { create: async (args: unknown) => { records.push(args); } },
  };
  const client = { $transaction: async (work: (db: typeof tx) => Promise<ServerResult<NextOutput>>) => {
    const before = records.length;
    try { return await work(tx); } catch (error) { records.splice(before); throw error; }
  } } as unknown as PrismaClient;
  const execute = cursorTransaction(client, {} as NextDeps);
  let called = 0;
  return { records, locks, called: () => called, invoke: (input: NextInput) => execute({ projectId: "project", tokenId: "token" }, input, "KEY", async (deps) => {
    called++;
    await deps.record("agent-run", { stepId: "verify", outcome: "ok", note: null });
    await deps.advance("agent-run", "verify", "report");
    return { ok: true, item: { done: false, step: "report", instruction: "Report" } };
  }) };
}
const claim: NextInput = { agent: "dev", entry: { runId: "pipeline", entryId: "entry", slotId: "implement" }, agentRunId: "agent-run", stepId: "verify", outcome: "ok" };

it("stale entry, run and step claims fail before every write", async () => {
  for (const input of [
    { ...claim, stepId: undefined }, { ...claim, stepId: "implement" }, { ...claim, agentRunId: "old-run" },
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
});
it("cursor CAS failure rolls the preceding ledger append back", async () => {
  const f = fixture({ casFails: true });
  assert.equal((await f.invoke(claim)).ok, false);
  assert.equal(f.records.length, 0);
});
