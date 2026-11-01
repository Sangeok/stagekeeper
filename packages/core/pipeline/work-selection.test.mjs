import assert from "node:assert/strict";
import { it } from "node:test";
import { DEFAULT_SELECTION_POLICY, expand, itemGraph, validateDefinition, workPrefix } from "./pipeline.mjs";
import { matchingAgents, readSelectionDecision, selectionReason } from "./work-selection.mjs";

const candidates = [
  { key: "K-1", title: "Broken form", area: "web", source: "Issue #14: form fails on submit", eligible: true, agents: ["web-dev"] },
  { key: "K-2", title: "Search", area: "web", source: "Issue #19: search requested", eligible: true, agents: ["web-dev"] },
];
const context = { contextKey: "current", policy: DEFAULT_SELECTION_POLICY, candidates };
const decision = { contextKey: "current", policy: DEFAULT_SELECTION_POLICY, criterion: "Oldest eligible task", evidence: [{ key: "K-1", quote: "Issue #14: form fails on submit" }], comparisons: [{ key: "K-2", reason: "Newer eligible task" }], readiness: "Source and workspace are available", assignmentReason: "Owns web", uncertainties: [] };

it("requires current facts, real Source evidence, every alternative and workspace ownership", () => {
  assert.equal(selectionReason(decision, context, "K-1", "web-dev"), null);
  for (const invalid of [
    null, {}, { ...decision, contextKey: "old" }, { ...decision, policy: "invented" },
    { ...decision, uncertainties: ["Unknown dependency"] }, { ...decision, readiness: " " },
    { ...decision, evidence: [{ key: "K-1", quote: "Losing millions daily" }] },
    { ...decision, comparisons: [] }, { ...decision, comparisons: [...decision.comparisons, ...decision.comparisons] },
  ]) assert.equal(typeof selectionReason(invalid, context, "K-1", "web-dev"), "string");
  assert.match(selectionReason(decision, context, "K-1", "api-dev"), /workspace/);
  assert.equal(readSelectionDecision(null), null);
  assert.equal(readSelectionDecision(decision), decision);
});

it("enforces the default oldest-candidate rule but allows an explicit custom policy", () => {
  const second = { ...decision, evidence: [{ key: "K-2", quote: "search requested" }], comparisons: [{ key: "K-1", reason: "Lower priority under owner policy" }] };
  assert.match(selectionReason(second, context, "K-2", "web-dev"), /oldest/);
  assert.equal(selectionReason({ ...second, policy: "Search first" }, { ...context, policy: "Search first" }, "K-2", "web-dev"), null);
});

it("matches workspace boundaries without mistaking path prefixes or traversal for ownership", () => {
  const workspaces = [{ path: "web", agent: "web-dev" }, { path: "api", agent: "api-dev" }];
  assert.deepEqual(matchingAgents("./web/components", workspaces), ["web-dev"]);
  for (const area of ["web-other", "../web", "", "web/../api"]) assert.deepEqual(matchingAgents(area, workspaces), []);
});

it("separates optional project work from task execution without inserting discovery", () => {
  const graph = { nodes: ["discover-work", "assign-work", "plan", "implement", "accept", "discover-work#2"], gates: ["before-assign-work", "before-plan"] };
  assert.deepEqual(workPrefix(graph), { nodes: ["discover-work", "assign-work"], gates: ["before-assign-work"] });
  assert.deepEqual(itemGraph(graph), { nodes: ["plan", "implement", "accept", "discover-work#2"], gates: ["before-plan"] });
  assert.deepEqual(workPrefix({ nodes: ["assign-work", "plan"], gates: [] }).nodes, ["assign-work"]);
  assert.deepEqual(workPrefix({ nodes: ["plan", "discover-work"], gates: [] }).nodes, []);
  assert.deepEqual(workPrefix({ nodes: ["discover-work"], gates: [] }).nodes, ["discover-work"]);
  assert.equal(validateDefinition({ steps: ["plan", "assign-work"], gates: [] }, "pro").ok, false);
});

it("uses the policy owned by a referenced Assign work node", () => {
  const expanded = expand("main", { main: { steps: ["pipeline:intake", "plan"], gates: [] }, intake: { steps: ["assign-work"], gates: [], selectionPolicy: "Fixes first" } });
  assert.ok(expanded.ok);
  assert.equal(expanded.graph.selectionPolicy, "Fixes first");
});
