import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { readFacts, type RunRow } from "./run-query";

const cursor: RunRow = { id: "pipeline", node: "implement", entryId: "entry", enteredAt: new Date(100), closedAt: null, version: { id: "version", version: 1, format: "slots-v1", nodes: ["plan", "implement", "accept"], gates: [] } };
const row = { id: "item", status: "implementing", validation: null, acceptedAt: null };
it("success requires the same run's normal report close, verify/ok and bound report", async () => {
  for (const [stepId, verified, reported, expected] of [["report", true, true, true], ["hold", true, true, false], ["report", false, true, false], ["report", true, false, false]] as const) {
    let filter: unknown;
    const db = {
      agentRun: { findMany: async (args: { where: unknown }) => {
        filter = args.where;
        return [{ agent: "dev", key: "KEY", stepId, steps: [{ stepId: "verify", outcome: verified ? "ok" : "failed" }, { stepId, outcome: "ok" }], reports: reported ? [{ id: "report", actor: "dev" }] : [] }];
      } },
      boardItem: { findUniqueOrThrow: async () => ({ agent: "dev", backlogItem: { key: "KEY" } }) },
    } as unknown as PrismaClient;
    const facts = await readFacts(db, "project", row, cursor);
    assert.equal(facts.implementationComplete, expected);
    assert.deepEqual(facts.approvedGates, []);
    assert.deepEqual(filter, { projectId: "project", closedAt: { not: null }, pipelineRunId: "pipeline", pipelineEntryId: "entry" });
  }
});
it("unknown formats and missing entries fail closed", async () => {
  const db = {} as PrismaClient;
  await assert.rejects(readFacts(db, "project", row, { ...cursor, entryId: null }), /Missing pipeline entry/);
  await assert.rejects(readFacts(db, "project", row, { ...cursor, version: { ...cursor.version, format: "future" } }), /Unsupported pipeline format/);
});

it("gate history is never queried for slots-v1 and project slots use exact non-key bindings", async () => {
  const gate = await readFacts({} as PrismaClient, "project", row, { ...cursor, node: "before-implement" });
  assert.deepEqual(gate.approvedGates, []);
  let filter: unknown;
  const db = { agentRun: { findFirst: async (args: { where: unknown }) => { filter = args.where; return { id: "closed-audit" }; } } } as unknown as PrismaClient;
  const facts = await readFacts(db, "project", row, { ...cursor, node: "doc-auditor#2" });
  assert.equal(facts.slotComplete, true);
  assert.deepEqual(filter, { projectId: "project", agent: "doc-auditor", key: null, pipelineRunId: "pipeline", pipelineEntryId: "entry", closedAt: { not: null } });
});
