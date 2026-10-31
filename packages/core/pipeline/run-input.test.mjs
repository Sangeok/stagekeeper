import assert from "node:assert/strict";
import { it } from "node:test";
import { pipelineInputReason, validateExecutionGraph } from "./run-input.mjs";
import { advance, SLOT_FORMAT } from "./pipeline.mjs";

const checks = { nodes: ["impl-verify", "qa"], gates: [] };
const implemented = { status: "done", active: false, hasPlan: true, hasValidation: true, hasImplementation: true };

it("verification runs without development anchors when its work provides the required inputs", () => {
  assert.deepEqual(validateExecutionGraph(checks, "max"), { ok: true });
  assert.equal(pipelineInputReason(checks, implemented), null);
  assert.match(pipelineInputReason(checks, { ...implemented, hasImplementation: false }), /completed implementation/);
  assert.match(pipelineInputReason(checks, { ...implemented, hasPlan: false }), /original plan/);
  assert.match(pipelineInputReason(checks, { ...implemented, active: true }), /already has a running pipeline/);
});

it("a partial implementation requires a verified plan unless it verifies that plan first", () => {
  const target = { ...implemented, status: "in_review", hasImplementation: false, hasValidation: false };
  assert.match(pipelineInputReason({ nodes: ["implement"], gates: [] }, target), /verified plan/);
  assert.equal(pipelineInputReason({ nodes: ["verify", "implement"], gates: [] }, target), null);
  assert.match(pipelineInputReason({ nodes: ["plan"], gates: [] }, implemented), /new work/);
});

it("standalone execution retains ordering, duplicate, entitlement and gate validation", () => {
  for (const graph of [
    { nodes: ["qa", "impl-verify"], gates: [] }, { nodes: ["qa", "qa"], gates: [] },
    { nodes: ["qa"], gates: ["before-plan"] }, { nodes: ["pipeline:other"], gates: [] },
  ]) assert.equal(validateExecutionGraph(graph, "max").ok, false);
  assert.equal(validateExecutionGraph(checks, "free").ok, false);
});

it("new plans cannot flow into implementation checks without an implementation step", () => {
  const target = { status: "proposed", active: false, hasPlan: false, hasValidation: false, hasImplementation: false };
  assert.match(pipelineInputReason({ nodes: ["plan", "qa"], gates: [] }, target), /Add Implement/);
  assert.equal(pipelineInputReason({ nodes: ["plan", "verify"], gates: [] }, target), null);
  const result = advance({ nodes: ["doc-auditor#1"], gates: [] }, "doc-auditor#1", {
    status: "implementing", format: SLOT_FORMAT, accepted: false, approvedGates: [], closedAgents: [], slotComplete: true,
  });
  assert.deepEqual(result.transitions, []);
});

it("finishing an implementation-only run records implementation completion without accepting work", () => {
  const result = advance({ nodes: ["implement"], gates: [] }, "implement", {
    status: "implementing", format: SLOT_FORMAT, implementationComplete: true, accepted: false,
    approvedGates: [], closedAgents: [], slotComplete: true,
  });
  assert.equal(result.cursor, null);
  assert.deepEqual(result.transitions, [{ from: "implementing", to: "done" }]);
});
