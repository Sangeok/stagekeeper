import assert from "node:assert/strict";

import { it } from "node:test";

import { advance, defaultGraph, dispatcherFor, isItemNode, nodeDone, validateGraph } from "./pipeline.mjs";

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
