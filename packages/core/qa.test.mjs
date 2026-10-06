import assert from "node:assert/strict";
import { it } from "node:test";
import { parseQaConfig, parseQaReport } from "./qa.mjs";
import { advance, defaultGraph, dispatcherFor, isItemNode, nodeDone, validateGraph } from "./pipeline.mjs";

const config = { environment: "test", baseUrl: "http://127.0.0.1:3000", mcpUrl: "http://127.0.0.1:8931/mcp", scenariosPath: "docs/qa/scenarios.md" };
const report = { verdict: "pass", targetCommit: "a".repeat(40), baseUrl: config.baseUrl, scenarios: [{ id: "save", status: "pass", expected: "saved after reload", actual: "saved after reload", evidence: ["snapshot at /settings; request 200"] }] };

it("QA is opt-in, item-bound and available only between implementation and acceptance", () => {
  const graph = { nodes: ["plan", "implement", "qa", "accept"], gates: [] };
  for (const plan of ["free", "pro", "max"]) assert.ok(!defaultGraph(plan).nodes.includes("qa"));
  assert.equal(validateGraph(graph, "pro").ok, true);
  assert.equal(validateGraph(graph, "free").ok, false);
  for (const nodes of [["qa", "plan", "implement", "accept"], ["plan", "implement", "accept", "qa"], ["plan", "implement", "qa", "qa", "accept"]]) assert.equal(validateGraph({ nodes, gates: [] }, "max").ok, false);
  assert.equal(dispatcherFor("qa", "dev"), "qa-verifier");
  assert.equal(isItemNode("qa"), true);
  const facts = { format: "slots-v1", status: "implementing", validation: null, accepted: false, closedAgents: ["qa-verifier"], approvedGates: [], implementationComplete: true };
  assert.equal(advance(graph, "implement", facts).cursor, "qa");
  assert.equal(nodeDone("qa", facts), false);
  assert.equal(advance(graph, "qa", facts).cursor, "qa");
  assert.deepEqual(advance(graph, "implement", facts).transitions, [{ from: "implementing", to: "done" }]);
  assert.deepEqual(advance(graph, "qa", { ...facts, status: "done", qaComplete: true }).transitions, []);
});
it("requires explicit test settings and refuses release origins and escaping scenario paths", () => {
  assert.equal(parseQaConfig(undefined), null);
  assert.deepEqual(parseQaConfig(config), config);
  for (const change of [{ environment: "production" }, { mcpUrl: "https://remote.example/mcp" }, { scenariosPath: "../secrets" }, { scenariosPath: "C:/secret" }, { baseUrl: "https://user:pass@test.example" }]) assert.throws(() => parseQaConfig({ ...config, ...change }));
  assert.throws(() => parseQaConfig(config, { baseUrl: config.baseUrl + "/production" }), /release origin/);
});
it("an empty, partial, failed or unrun result cannot become a QA pass", () => {
  assert.deepEqual(parseQaReport(report), report);
  for (const change of [{ scenarios: [] }, { targetCommit: "HEAD" }, { scenarios: [{ ...report.scenarios[0], evidence: [] }] }, { scenarios: [{ ...report.scenarios[0], status: "blocked" }] }]) assert.throws(() => parseQaReport({ ...report, ...change }));
  assert.equal(parseQaReport({ ...report, verdict: "blocked", baseUrl: null, scenarios: [{ ...report.scenarios[0], status: "blocked", actual: "No test environment configured" }] }).baseUrl, null);
  assert.throws(() => parseQaReport({ ...report, baseUrl: null }));
});
