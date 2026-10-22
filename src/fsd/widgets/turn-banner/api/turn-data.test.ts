import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { loadTurn, runnerFacts } from "./turn-data.server";
import { signinCode } from "../model/runner";
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
      "server-only": {}, "@/server/db": { prisma: db }, "@/server/pipeline/api.server": { latestBoard: async () => rows },
      "@/server/pipeline/api": { loadExecutionFacts: async (_db: unknown, projectId: string, input: unknown) => {
        assert.equal(projectId, "p");
        assert.deepEqual(JSON.parse(JSON.stringify(input)), [{ id: "new", key: "K", agent: "dev", updatedAt: new Date(0).toISOString() }]);
        return [{ boardItemId: "new", cursorNode: node, activityDispatched: true, turnDispatched: node === "implement", handoff: null }];
      } },
      "@/server/runners/api.server": { readRunnerState: async () => ({ runner: null, pausedAt: null, lastActivity: null, renderedAt: new Date(0) }) },
      "../model/runner": { signinCode }, "../model/turn": { deriveTurn: (value: TurnItem[]) => { items = value; return { kind: "none", detail: "fixture" }; } },
    };
    const exports = {} as { loadTurn: typeof loadTurn };
    runInNewContext(code, { exports, Date, require: (name: string) => Object.hasOwn(deps, name) ? deps[name] : require(name) });
    const data = await exports.loadTurn("p");
    assert.equal(items[0].acceptanceFailed, expected);
    assert.equal(items[0].dispatched, node === "implement");
    assert.deepEqual(JSON.parse(JSON.stringify(data.runner)), { runner: null, paused: false, renderedAt: "1970-01-01T00:00:00.000Z" });
    assert.equal(JSON.stringify(failureQuery), JSON.stringify({ where: { clearedAt: null, boardItem: { projectId: "p" } }, select: { boardItemId: true } }));
  }
});

it("maps the runner view to banner facts for the project it was asked about", async () => {
  const code = ts.transpileModule(readFileSync("src/fsd/widgets/turn-banner/api/turn-data.server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const require = createRequire(import.meta.url);
  const asked: string[] = [];
  const db = {
    projectToken: { count: async () => 1 }, workspace: { count: async () => 1 }, agentRun: { findMany: async () => [] },
    pipelineRun: { findMany: async () => [] }, project: { findUniqueOrThrow: async () => ({ autoScoutEnabled: true }) }, acceptanceFailure: { findMany: async () => [] },
  };
  const view = {
    runner: { session: "s", mode: "session", host: "desk", branch: null, permission: null, autostart: false, state: "working", waitReason: null,
      lastResult: "free text", lastLog: "a.jsonl", stopReason: null, startedAt: new Date(1_000), seenAt: new Date(2_000) },
    pausedAt: new Date(3_000), lastActivity: new Date(4_000), renderedAt: new Date(5_000),
  };
  const deps: Record<string, unknown> = {
    "server-only": {}, "@/server/db": { prisma: db }, "@/server/pipeline/api.server": { latestBoard: async () => [] },
    "@/server/pipeline/api": { loadExecutionFacts: async () => [] },
    "@/server/runners/api.server": { readRunnerState: async (projectId: string) => { asked.push(projectId); return view; } },
    "../model/runner": { signinCode }, "../model/turn": { deriveTurn: () => ({ kind: "setup", steps: [], current: 1 }) },
  };
  const exports = {} as { loadTurn: typeof loadTurn };
  runInNewContext(code, { exports, Date, require: (name: string) => Object.hasOwn(deps, name) ? deps[name] : require(name) });
  const data = await exports.loadTurn("p");
  assert.deepEqual(asked, ["p"]);
  assert.deepEqual(JSON.parse(JSON.stringify(data.runner)), {
    runner: { mode: "session", host: "desk", branch: null, permission: null, autostart: false, state: "working", waitReason: null, stopReason: null, signinCode: null,
      seenAt: new Date(2_000).toISOString(), lastActivity: new Date(4_000).toISOString() },
    paused: true, renderedAt: new Date(5_000).toISOString(),
  });
});

it("passes a refused sign-in start's code to the banner and never the stored text of other rows", () => {
  const code = ts.transpileModule(readFileSync("src/fsd/widgets/turn-banner/api/turn-data.server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const require = createRequire(import.meta.url);
  const deps: Record<string, unknown> = { "server-only": {}, "@/server/db": { prisma: {} }, "@/server/pipeline/api.server": {}, "@/server/pipeline/api": {},
    "@/server/runners/api.server": {}, "../model/runner": { signinCode }, "../model/turn": {} };
  const exports = {} as { runnerFacts: typeof runnerFacts };
  runInNewContext(code, { exports, Date, require: (name: string) => Object.hasOwn(deps, name) ? deps[name] : require(name) });
  const row = (stopReason: string | null, lastResult: string | null) => ({ runner: { session: "s", mode: "resident", host: "desk", branch: "main", permission: null, autostart: true,
    state: "stopped", waitReason: null, lastResult, lastLog: null, stopReason, startedAt: new Date(0), seenAt: new Date(0) },
  pausedAt: null, lastActivity: null, renderedAt: new Date(0) }) as unknown as Parameters<typeof runnerFacts>[0];
  assert.equal(exports.runnerFacts(row("signin", "push-url")).runner?.signinCode, "push-url");
  assert.equal(exports.runnerFacts(row("signin", "free text")).runner?.signinCode, "other");
  assert.equal(exports.runnerFacts(row("owner", "dirty")).runner?.signinCode, null);
});
