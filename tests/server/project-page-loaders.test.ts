import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { buildBriefing } from "../../src/fsd/pages/project-board/model/briefing";
import { loadModule } from "./fixtures/load-module";
import { manifestEntries } from "./fixtures/action-manifest";

const boardPath = "src/fsd/pages/project-board/api/project-board.server.ts";
const historyPath = "src/fsd/pages/project-history/api/project-history.server.ts";

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
