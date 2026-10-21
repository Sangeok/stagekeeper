import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ExecutionItem } from "./contracts";
import { loadExecutionFacts } from "./current-execution-query";

const at = new Date("2026-10-21T00:00:00Z");
const item: ExecutionItem = { id: "item", key: "K", agent: "dev", updatedAt: at };
type Cursor = {
  id: string; boardItemId: string; entryId: string | null; node: string | null;
  version: { format: string | null }; projectId: string; closedAt: Date | null;
};
type Step = { outcome: string; note: string | null; at: Date; accepted: boolean | null };
type OpenRun = {
  key: string | null; agent: string; pipelineRunId: string | null; pipelineEntryId: string | null;
  stepId: string; steps: Step[]; projectId: string; closedAt: Date | null;
};
const cursor: Cursor = { id: "run", boardItemId: "item", entryId: "entry", node: "implement", version: { format: "slots-v1" }, projectId: "owned", closedAt: null };
const run: OpenRun = { key: "K", agent: "dev", pipelineRunId: "run", pipelineEntryId: "entry", stepId: "work", steps: [], projectId: "owned", closedAt: null };

function database(pipelines: Cursor[], agents: OpenRun[]) {
  const queries: { pipeline?: unknown; agent?: unknown } = {};
  const client = {
    pipelineRun: { findMany: async (query: { where: { closedAt: null; boardItem: { projectId: string } } }) => {
      queries.pipeline = query;
      return pipelines.filter(row => row.projectId === query.where.boardItem.projectId && row.closedAt === query.where.closedAt);
    } },
    agentRun: { findMany: async (query: { where: { projectId: string; closedAt: null } }) => {
      queries.agent = query;
      return agents.filter(row => row.projectId === query.where.projectId && row.closedAt === query.where.closedAt).map(row => ({
        ...row, steps: row.steps.filter(step => step.accepted !== false).sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 1),
      }));
    } },
  } as unknown as PrismaClient;
  return { client, queries };
}

type Example = {
  name: string; format?: string | null; node?: string; entryId?: string | null;
  agent?: Partial<OpenRun>; pipeline?: Partial<Cursor>; noCursor?: boolean; noRun?: boolean;
  expected: [boolean, boolean];
};
const examples: Example[] = [
  { name: "current keyed slot", expected: [true, true] },
  { name: "keyed slot at another entry", agent: { pipelineEntryId: "other" }, expected: [true, false] },
  { name: "keyed slot in another run", agent: { pipelineRunId: "other" }, expected: [true, false] },
  { name: "bound slot with another key", agent: { key: "other" }, expected: [false, true] },
  { name: "another dispatcher", agent: { agent: "other" }, expected: [false, false] },
  { name: "legacy keyed binding ignored", format: null, agent: { pipelineRunId: "other", pipelineEntryId: "other" }, expected: [true, true] },
  { name: "bound null-key project slot", node: "doc-auditor#2", agent: { key: null, agent: "doc-auditor" }, expected: [true, true] },
  { name: "null-key project slot at another entry", node: "doc-auditor#2", agent: { key: null, agent: "doc-auditor", pipelineEntryId: "other" }, expected: [false, false] },
  { name: "legacy null-key project slot", format: null, node: "doc-auditor#2", agent: { key: null, agent: "doc-auditor" }, expected: [false, false] },
  { name: "missing current entry", entryId: null, expected: [true, false] },
  { name: "null entry keeps the two original predicates", entryId: null, node: "doc-auditor#2", agent: { key: null, agent: "doc-auditor", pipelineEntryId: null }, expected: [false, true] },
  { name: "gate", node: "before-implement", expected: [false, false] },
  { name: "accept", node: "accept", expected: [false, false] },
  { name: "no cursor", noCursor: true, expected: [false, false] },
  { name: "no execution", noRun: true, expected: [false, false] },
  { name: "closed execution", agent: { closedAt: at }, expected: [false, false] },
  { name: "foreign execution", agent: { projectId: "foreign" }, expected: [false, false] },
  { name: "closed cursor", pipeline: { closedAt: at }, expected: [false, false] },
  { name: "foreign cursor", pipeline: { projectId: "foreign" }, expected: [false, false] },
];

for (const example of examples) it("preserves activity and turn dispatch for " + example.name, async () => {
  const pipeline = { ...cursor, ...example.pipeline, node: example.node ?? cursor.node, entryId: example.entryId === undefined ? cursor.entryId : example.entryId,
    version: { format: example.format === undefined ? "slots-v1" : example.format } };
  const db = database(example.noCursor ? [] : [pipeline], example.noRun ? [] : [{ ...run, ...example.agent }]);
  const [facts] = await loadExecutionFacts(db.client, "owned", [item]);
  assert.deepEqual([facts.activityDispatched, facts.turnDispatched], example.expected);
  assert.equal(facts.boardItemId, item.id);
  assert.equal(facts.handoff, null);
});

it("limits both reads to open project records and selects the latest eligible step without writes", async () => {
  const db = database([cursor], [run]);
  await loadExecutionFacts(db.client, "owned", [item]);
  assert.deepEqual(db.queries.pipeline, {
    where: { closedAt: null, boardItem: { projectId: "owned" } },
    select: { id: true, entryId: true, version: { select: { format: true } }, boardItemId: true, node: true },
  });
  assert.deepEqual(db.queries.agent, {
    where: { projectId: "owned", closedAt: null },
    select: {
      pipelineRunId: true, pipelineEntryId: true, key: true, agent: true, stepId: true,
      steps: { where: { OR: [{ accepted: true }, { accepted: null }] }, orderBy: { at: "desc" }, take: 1, select: { outcome: true, note: true, at: true } },
    },
  });
});

for (const format of [null, "slots-v1"]) it("keeps strict handoff time and eligible latest-step behavior for " + format, async () => {
  const step: Step = { outcome: "handoff", note: "docs/plan.md", at: new Date(at.getTime() + 1), accepted: true };
  for (const [steps, expected] of [
    [[step], { step: "work", note: "docs/plan.md" }],
    [[{ ...step, at }], null],
    [[{ ...step, at: new Date(at.getTime() - 1) }], null],
    [[{ ...step, accepted: null }], { step: "work", note: "docs/plan.md" }],
    [[{ ...step, accepted: false }], null],
    [[step, { ...step, outcome: "ok", at: new Date(at.getTime() + 2) }], null],
    [[{ ...step, accepted: null }, { ...step, outcome: "ok", accepted: false, at: new Date(at.getTime() + 2) }], { step: "work", note: "docs/plan.md" }],
  ] as [Step[], { step: string; note: string } | null][]) {
    const db = database([{ ...cursor, version: { format } }], [{ ...run, steps }]);
    assert.deepEqual((await loadExecutionFacts(db.client, "owned", [item]))[0].handoff, expected);
  }
});

it("keeps legacy handoff iteration order and slot first-match order", async () => {
  const first = { ...run, stepId: "first", steps: [{ outcome: "handoff", note: "first", at: new Date(at.getTime() + 2), accepted: true }] };
  const second = { ...run, stepId: "second", steps: [{ outcome: "handoff", note: "second", at: new Date(at.getTime() + 1), accepted: true }] };
  for (const [format, step] of [[null, "second"], ["slots-v1", "first"]] as const) {
    const db = database([{ ...cursor, version: { format } }], [first, second]);
    assert.equal((await loadExecutionFacts(db.client, "owned", [item]))[0].handoff?.step, step);
  }
});

it("retains legacy keyed handoff when there is no cursor", async () => {
  const db = database([], [{ ...run, steps: [{ outcome: "handoff", note: null, at: new Date(at.getTime() + 1), accepted: true }] }]);
  assert.deepEqual((await loadExecutionFacts(db.client, "owned", [item]))[0], {
    boardItemId: "item", cursorNode: null, activityDispatched: false, turnDispatched: false, handoff: { step: "work", note: null },
  });
});
