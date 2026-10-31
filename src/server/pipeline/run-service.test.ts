import assert from "node:assert/strict";
import { it } from "node:test";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { loadPipelinesView, nextFor } from "./run-service";
import { readFacts, type PipelineRunRow } from "./run-service";

const cursor: PipelineRunRow = { id: "pipeline", node: "implement", entryId: "entry", enteredAt: new Date(100), closedAt: null, version: { id: "version", version: 1, format: "slots-v1", nodes: ["plan", "implement", "accept"], gates: [] } };
const row = { id: "item", currentRunId: "pipeline", status: "implementing", validation: null, acceptedAt: null };

it("loads saved pipelines and relations without overlapping Prisma driver queries", async () => {
  let executing = false;
  const createdAt = new Date("2026-10-01T00:00:00.000Z");
  const records: Record<string, Record<string, unknown>> = {
    Project: { id: "project", defaultPipelineId: "pipeline", autoProposeEnabled: true, autoScoutEnabled: true, ownerUserId: "owner", repoOwner: "owner", available: true, disconnectedAt: null },
    User: { id: "owner" },
    Subscription: { id: "subscription", userId: "owner", plan: "pro" },
    Pipeline: { id: "pipeline", projectId: "project", name: "Feature", createdBy: "test", createdAt: createdAt.toISOString(), archivedAt: null },
    PipelineDefinition: { selectionPolicy: null, id: "definition", pipelineId: "pipeline", version: 2, steps: ["plan", "implement", "accept"], gates: [], createdAt: createdAt.toISOString(), createdBy: "test" },
    PipelineVersion: { id: "version", projectId: "project", pipelineId: "pipeline", version: 2, nodes: ["plan", "implement", "accept"], gates: [], format: "slots-v1", selectionPolicy: null, createdAt: createdAt.toISOString(), createdBy: "test" },
    PipelineRule: { id: "rule", projectId: "project", type: "feature", pipelineId: "pipeline" },
  };
  const columnType = { integer: 0, boolean: 5, text: 7, dateTime: 10, textArray: 71 } as const;
  type Adapter = Awaited<ReturnType<NonNullable<Prisma.PrismaClientOptions["adapter"]>["connect"]>>;
  const adapter: Adapter = {
    provider: "postgres", adapterName: "single-connection-test",
    async queryRaw({ sql }) {
      assert.equal(executing, false, "The transaction connection is already executing a query");
      executing = true;
      try {
        await new Promise<void>(resolve => setImmediate(resolve));
        const table = sql.match(/FROM "public"\."([^"]+)"/)?.[1];
        assert.ok(table && records[table], "Expected a fixture table");
        const record = records[table];
        const columnNames = Object.keys(record);
        return {
          columnNames,
          columnTypes: columnNames.map(name => {
            if (name.endsWith("At")) return columnType.dateTime;
            if (Array.isArray(record[name])) return columnType.textArray;
            if (typeof record[name] === "boolean") return columnType.boolean;
            if (typeof record[name] === "number") return columnType.integer;
            return columnType.text;
          }),
          rows: [Object.values(record)],
        };
      } finally {
        executing = false;
      }
    },
    async executeRaw({ sql }) { assert.equal(sql, "SET TRANSACTION READ ONLY"); return 0; },
    async executeScript() { throw new Error("Unexpected SQL script"); },
    async startTransaction() {
      return { ...adapter, options: { usePhantomQuery: true }, async commit() {}, async rollback() {} };
    },
    async dispose() {},
  };
  const db = new PrismaClient({ adapter: { provider: "postgres", adapterName: adapter.adapterName, async connect() { return adapter; } } });

  try {
    assert.deepEqual(await loadPipelinesView(db, "project"), {
      pipelines: [{ id: "pipeline", name: "Feature", isDefault: true,
        definition: { steps: ["plan", "implement", "accept"], gates: [] },
        saved: { version: 2, createdAt },
        runnable: { selectionPolicy: null, nodes: ["plan", "implement", "accept"], gates: [], format: "slots-v1" },
      }],
      rules: { feature: "pipeline" }, autoProposeEnabled: true,
    });
  } finally {
    await db.$disconnect();
  }
});

it("nextFor reads active failures only at the open accept node", async () => {
  for (const [node, closedAt, expected] of [["accept", null, 1], ["accept", new Date(0), 0], ["before-accept", null, 0]] as const) {
    let reads = 0;
    const tx = {
      $queryRaw: async () => [],
      project: { findUnique: async () => ({ ownerUserId: "owner", repoOwner: "owner", available: true, disconnectedAt: null, ownerUser: { subscription: { plan: "pro" } } }) },
      boardItem: { findFirst: async () => ({ ...row, status: "done", agent: "dev", planCommit: null }) },
      pipelineRun: { findUnique: async () => ({ ...cursor, node, closedAt }) },
      acceptanceFailure: { findFirst: async (args: unknown) => { reads++; assert.deepEqual(args, { where: { boardItemId: "item", clearedAt: null }, select: { checks: true, note: true } }); return { checks: [3], note: "failed" }; } },
    };
    const db = { ...tx, $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx) } as unknown as PrismaClient;
    const answer = await nextFor(db, "project", "K");
    assert.equal(reads, expected);
    if (expected) { assert.equal(answer.action, "wait"); assert.ok("on" in answer && answer.on === "acceptance"); }
  }
});
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
