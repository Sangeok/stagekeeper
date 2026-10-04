import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { buildBriefing } from "../../src/fsd/pages/project-board/model/briefing";
import { loadModule } from "./fixtures/load-module";
import { manifestEntries } from "./fixtures/action-manifest";
import { SLOT_FORMAT } from "@harness/core/pipeline.mjs";

const boardPath = "src/fsd/pages/project-board/api/project-board.server.ts";
const historyPath = "src/fsd/pages/project-history/api/project-history.server.ts";

it("Board loader queries all open project runs and binds only null-key project slots to the current entry", async () => {
  const at = new Date("2026-10-04T00:00:00Z");
  const row = { id: "item", agent: "dev", status: "implementing", reason: "Evidence", results: [], proposedOn: at, backlogItem: { key: "KEY" } };
  const base = { key: null as string | null, agent: "doc-auditor", pipelineRunId: "run", pipelineEntryId: "entry", projectId: "owned", closedAt: null as Date | null };
  const cases = [
    { label: "bound", agent: base, expected: true },
    { label: "other pipeline", agent: { ...base, pipelineRunId: "other" }, expected: false },
    { label: "other entry", agent: { ...base, pipelineEntryId: "other" }, expected: false },
    { label: "other dispatcher", agent: { ...base, agent: "feature-scout" }, expected: false },
    { label: "missing binding", agent: { ...base, pipelineEntryId: null }, expected: false },
    { label: "other project", agent: { ...base, projectId: "foreign" }, expected: false },
    { label: "closed", agent: { ...base, closedAt: at }, expected: false },
    { label: "legacy null key", agent: base, format: null, expected: false },
    { label: "missing current entry", agent: base, entryId: null, expected: false },
    { label: "gate", agent: base, node: "before-doc-auditor#2", expected: false },
    { label: "accept", agent: base, node: "accept", expected: false },
    { label: "no pipeline", agent: base, noPipeline: true, expected: false },
    { label: "no execution", noExecution: true, agent: base, expected: false },
    ...[null, SLOT_FORMAT].map(format => ({ label: `loose keyed ${format}`, format, agent: { ...base, key: "KEY", pipelineRunId: "other", pipelineEntryId: "other" }, expected: true })),
  ];
  for (const example of cases) {
    const pipeline = { id: "run", boardItemId: "item", entryId: "entryId" in example ? example.entryId : "entry", version: { format: "format" in example ? example.format : SLOT_FORMAT }, node: "node" in example ? example.node : "doc-auditor#2" };
    const deps = {
      "../model/briefing": { buildBriefing }, "@/server/pipeline/board": { latestBoard: async () => [row] },
      "@/server/db": { prisma: {
        pipelineRun: { findMany: async (query: unknown) => { assert.deepEqual(JSON.parse(JSON.stringify(query)), { where: { closedAt: null, boardItem: { projectId: "owned" } }, select: { id: true, entryId: true, version: { select: { format: true } }, boardItemId: true, node: true } }); return "noPipeline" in example ? [] : [pipeline]; } },
        agentRun: { findMany: async (query: unknown) => { assert.deepEqual(JSON.parse(JSON.stringify(query)), { where: { projectId: "owned", closedAt: null }, select: { key: true, agent: true, pipelineRunId: true, pipelineEntryId: true } }); return "noExecution" in example || example.agent.projectId !== "owned" || example.agent.closedAt !== null ? [] : [example.agent]; } },
      } },
      "@/server/project": { loadProjectRoster: async () => ["dev"] },
      "@/server/pipeline/run": { loadCurrentVersionView: async () => ({ graph: { nodes: ["plan", "implement", "accept", "doc-auditor#2"] } }) },
    };
    const loader = loadModule<typeof import("../../src/fsd/pages/project-board/api/project-board.server")>(boardPath, deps);
    const output = await loader.loadProjectBoard("owned", at);
    assert.equal(output.activity[0].tone === "active", example.expected, example.label);
    const state = output.team.find(member => member.agent === "doc-auditor")?.state;
    assert.equal(state?.startsWith("Working on"), example.expected, example.label);
  }
});

it("actual Board loader keeps loose key/agent dispatch and maps a gate separately", async () => {
  const at = new Date("2026-10-04T00:00:00Z");
  const rows = [{ id: "one", agent: "dev", status: "implementing", reason: "Evidence", results: [], proposedOn: at, backlogItem: { key: "K-1" } },
    { id: "two", agent: "dev", status: "proposed", reason: "Evidence", results: [], proposedOn: at, backlogItem: { key: "K-2" } }];
  const deps = {
    "../model/briefing": { buildBriefing }, "@/server/pipeline/board": { latestBoard: async (id: string) => { assert.equal(id, "owned"); return rows; } },
    "@/server/db": { prisma: { pipelineRun: { findMany: async () => [{ boardItemId: "one", node: "implement" }, { boardItemId: "two", node: "before-plan" }] }, agentRun: { findMany: async () => [{ key: "K-1", agent: "dev" }] } } },
    "@/server/project": { loadProjectRoster: async () => ["dev"] }, "@/server/pipeline/run": { loadCurrentVersionView: async () => ({ graph: { nodes: ["propose", "plan", "implement", "accept"] } }) },
  };
  const loader = loadModule<typeof import("../../src/fsd/pages/project-board/api/project-board.server")>(boardPath, deps);
  const output = await loader.loadProjectBoard("owned", at);
  const expected = buildBriefing(rows.map((r, i) => ({ ...r, gate: i ? "before-plan" : null, node: i ? null : "implement", dispatched: !i })), at, ["dev"], ["propose", "plan", "implement", "accept"]);
  assert.deepEqual(JSON.parse(JSON.stringify(output)), expected);
});

it("thin owner routes call loaders only after authorization and public barrels stay client safe", async () => {
  for (const [route, slice, symbol] of [["page.tsx", "project-board", "loadProjectBoard"], ["history/page.tsx", "project-history", "loadProjectHistory"]]) {
    const source = readFileSync(`src/app/(app)/p/[slug]/${route}`, "utf8");
    const ast = ts.createSourceFile(route, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const calls: string[] = [];
    const visit = (node: ts.Node) => { if (ts.isCallExpression(node)) calls.push(node.expression.getText(ast)); ts.forEachChild(node, visit); }; visit(ast);
    assert.ok(calls.indexOf("requireProjectOwner") < calls.indexOf(symbol));
    assert.ok(!calls.some(name => /latestBoard|buildBriefing|projectHistory|readHistoryQuery|parseHistory|formatHistory|historyCutoff/.test(name)));
    assert.ok(!readFileSync(`src/fsd/pages/${slice}/index.ts`, "utf8").includes(symbol));
    let loads = 0;
    const action = loadModule<{ default: (args: unknown) => Promise<unknown> }>(`src/app/(app)/p/[slug]/${route}`, {
      [`@/fsd/pages/${slice}`]: {}, [`@/fsd/pages/${slice}/index.server`]: { [symbol]: async () => { loads++; } },
      "@/server/auth/guard": { requireProjectOwner: async () => { throw new Error("denied"); } },
    });
    await assert.rejects(action.default({ params: Promise.resolve({ slug: "mine" }), searchParams: Promise.resolve({}) }), /denied/);
    assert.equal(loads, 0);
  }
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh manifest never registers Board/History loaders as remote actions", () => {
  const entries = manifestEntries();
  for (const path of [boardPath, historyPath]) assert.equal(entries.filter(entry => entry.filename?.replaceAll("\\", "/").endsWith(path)).length, 0);
});
