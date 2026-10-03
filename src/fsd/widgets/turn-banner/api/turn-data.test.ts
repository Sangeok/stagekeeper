import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { loadTurn } from "./turn-data.server";
import type { TurnItem } from "../model/turn";

it("GET derives failures only for the latest unaccepted done at an open accept cursor without materializing runs", async () => {
  const code = ts.transpileModule(readFileSync("src/fsd/widgets/turn-banner/api/turn-data.server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const require = createRequire(import.meta.url);
  for (const [status, accepted, node, currentFailure, expected] of [
    ["done", false, "accept", true, true], ["done", false, "accept", false, false],
    ["done", true, "accept", true, false], ["implementing", false, "implement", true, false],
    ["done", false, "before-accept", true, false], ["done", false, null, true, false],
  ] as const) {
    let items: TurnItem[] = []; let failureQuery: unknown;
    const rows = [{ id: "new", status, acceptedAt: accepted ? new Date(0) : null, agent: "dev", updatedAt: new Date(0), backlogItem: { key: "K" } }];
    const db = {
      projectToken: { count: async () => 1 }, workspace: { count: async () => 1 }, agentRun: { findMany: async () => [] },
      pipelineRun: { findMany: async () => node === null ? [] : [{ id: "run", boardItemId: "new", node, version: { format: null } }] },
      project: { findUniqueOrThrow: async () => ({ autoScoutEnabled: true }) },
      acceptanceFailure: { findMany: async (args: unknown) => { failureQuery = args; return [{ boardItemId: "old" }, ...(currentFailure ? [{ boardItemId: "new" }] : [])]; } },
    };
    const deps: Record<string, unknown> = {
      "server-only": {}, "@/server/db": { prisma: db }, "@/server/pipeline/board": { latestBoard: async () => rows },
      "../model/turn": { deriveTurn: (value: TurnItem[]) => { items = value; return { kind: "none", detail: "fixture" }; } },
    };
    const exports = {} as { loadTurn: typeof loadTurn };
    runInNewContext(code, { exports, Date, require: (name: string) => Object.hasOwn(deps, name) ? deps[name] : require(name) });
    await exports.loadTurn("p");
    assert.equal(items[0].acceptanceFailed, expected);
    assert.equal(JSON.stringify(failureQuery), JSON.stringify({ where: { clearedAt: null, boardItem: { projectId: "p" } }, select: { boardItemId: true } }));
  }
});
