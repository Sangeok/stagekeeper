import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultGraph, refStep } from "@harness/core/pipeline/pipeline.mjs";
import { check, hasUngatedRunnable, preview, insertRef, addNode, addSlot, moveSlot, insertGate, removeGate, removeNode, swapTail } from "./rail-state";

const definitionOf = (plan: string) => { const graph = defaultGraph(plan); return { steps: graph.nodes, gates: graph.gates }; };
const pro = () => definitionOf("pro");

it("rejects absent IDs before no-op/insertion and preserves the entire input graph", () => {
  const graph = { steps: ["doc-auditor", "plan", "implement", "accept"], gates: ["before-doc-auditor"] };
  const before = structuredClone(graph);
  for (const [result, reason] of [
    [addSlot(graph, "doc-auditor", "missing", "pro"), "unknown destination"],
    [moveSlot(graph, "doc-auditor#9", null, "pro"), "unknown source"],
    [moveSlot(graph, "doc-auditor#9", "doc-auditor#9", "pro"), "unknown source"],
    [moveSlot(graph, "doc-auditor", "missing", "pro"), "unknown destination"],
  ] as const) {
    assert.deepEqual(result, { ok: false, reason });
    assert.deepEqual(graph, before);
  }
  const unchanged = moveSlot(graph, "doc-auditor", "doc-auditor", "pro");
  assert.ok(unchanged.ok);
  assert.deepEqual(unchanged.definition, graph);
  const end = moveSlot(graph, "doc-auditor", null, "pro");
  assert.ok(end.ok);
  assert.deepEqual(end.definition.steps, ["plan", "implement", "accept", "doc-auditor"]);
  assert.deepEqual(end.definition.gates, graph.gates);
  assert.deepEqual(graph, before);
  assert.equal(addSlot(definitionOf("free"), "doc-auditor", null, "free").ok, false);
});

it("repeating, moving and deleting slots preserve other identities and attached gates", () => {
  const first = addSlot({ steps: ["doc-audit", "plan", "implement", "accept"], gates: ["before-doc-audit"] }, "doc-auditor", "accept", "pro");
  assert.ok(first.ok);
  assert.deepEqual(first.definition.gates, ["before-doc-auditor"]);
  assert.ok(first.definition.steps.includes("doc-auditor#2"));
  const moved = moveSlot(first.definition, "doc-auditor", "implement", "pro");
  assert.ok(moved.ok);
  assert.deepEqual(moved.definition.steps, ["plan", "doc-auditor", "implement", "doc-auditor#2", "accept"]);
  const deleted = removeNode(moved.definition, "doc-auditor", "pro");
  assert.ok(deleted.ok);
  assert.ok(deleted.definition.steps.includes("doc-auditor#2"));
  assert.deepEqual(deleted.definition.gates, []);
  const restored = addNode({ ...deleted.definition, steps: [...deleted.definition.steps] }, "verify", "pro");
  assert.ok(restored.ok);
  assert.ok(restored.definition.steps.includes("doc-auditor#2"), "restoring an anchor must not discard free slots");
});

describe("rail-state", () => {
  it("inserts a gate on an edge that has a node after it", () => {
    const r = insertGate(pro(), "before-verify", "pro");
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.definition.gates.includes("before-verify"));
  });

  it("refuses a gate whose node the graph does not have", () => {
    const noScout = insertGate(pro(), "before-scout", "pro");
    assert.equal(noScout.ok, false);
    if (!noScout.ok) assert.match(noScout.reason, /has no node after it/);
  });

  it("refuses to remove a required node and says which one", () => {
    const r = removeNode(pro(), "accept", "pro", { pipelineId: "default", definitions: { default: pro() }, mustRun: ["default"] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /accept can't be removed/);
  });

  it("removes an optional node together with the gate in front of it", () => {
    const gated = insertGate(pro(), "before-verify", "pro");
    assert.ok(gated.ok);
    if (!gated.ok) return;
    const r = removeNode(gated.definition, "verify", "pro");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(!r.definition.steps.includes("verify"));
      assert.ok(!r.definition.gates.includes("before-verify"), "게이트가 남으면 뒤에 노드가 없어 저장이 막힌다");
    }
  });

  it("adds an opt-in node back in skeleton order", () => {
    const r = addNode(pro(), "scout", "pro");
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.definition.steps.slice(-2), ["doc-audit", "scout"]);
  });

  it("adds impl-verify right before qa, or before accept when qa is absent", () => {
    const withQa = addNode(pro(), "qa", "pro");
    assert.ok(withQa.ok);
    if (!withQa.ok) return;
    const both = addNode(withQa.definition, "impl-verify", "pro");
    assert.ok(both.ok);
    if (both.ok) assert.deepEqual(both.definition.steps.slice(both.definition.steps.indexOf("implement"), both.definition.steps.indexOf("accept") + 1), ["implement", "impl-verify", "qa", "accept"]);
    const alone = addNode(pro(), "impl-verify", "pro");
    assert.ok(alone.ok);
    if (alone.ok) assert.equal(alone.definition.steps[alone.definition.steps.indexOf("accept") - 1], "impl-verify");
  });

  it("refuses a node the plan does not allow", () => {
    const free = definitionOf("free") as { steps: string[]; gates: string[] };
    const r = addNode(free, "verify", "free");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /verify is not on the free plan/);
  });

  it("swaps the two tail steps and keeps the head order", () => {
    const withScout = addNode(pro(), "scout", "pro");
    assert.ok(withScout.ok);
    if (!withScout.ok) return;
    const r = swapTail(withScout.definition, "pro");
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.definition.steps.slice(-2), ["scout", "doc-audit"]);
  });

  it("keeps a swapped tail when another node is added back", () => {
    const withScout = addNode(pro(), "scout", "pro");
    assert.ok(withScout.ok);
    if (!withScout.ok) return;
    const swapped = swapTail(withScout.definition, "pro");
    assert.ok(swapped.ok);
    if (!swapped.ok) return;
    const trimmed = removeNode(swapped.definition, "verify", "pro");
    assert.ok(trimmed.ok);
    if (!trimmed.ok) return;
    const r = addNode(trimmed.definition, "verify", "pro");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.definition.steps.slice(-2), ["scout", "doc-audit"]);
      assert.deepEqual(r.definition.steps.slice(0, 6), ["discover-work", "assign-work", "plan", "verify", "implement", "accept"]);
    }
  });

  it("removes a gate without touching the steps", () => {
    const r = removeGate(pro(), "before-plan", "pro");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.definition.gates, ["before-implement"]);
      assert.deepEqual(r.definition.steps, pro().steps);
    }
  });
});

it("starts empty drafts, appends references, reserves nested slots, and warns only for executable ungated results", () => {
  const empty = { steps: [], gates: [] };
  assert.equal(check(empty, "pro").ok, false);
  assert.ok(addNode(empty, "plan", "pro").ok);
  const definitions = {
    block: { steps: ["doc-auditor", "doc-auditor#2"], gates: [] },
    draft: { steps: [refStep("block"), "doc-auditor#3"], gates: [] },
  };
  const context = { pipelineId: "draft", definitions, mustRun: [] };
  const before = structuredClone(definitions);
  const added = addSlot(definitions.draft, "doc-auditor", null, "pro", context);
  assert.ok(added.ok); assert.equal(added.definition.steps.at(-1), "doc-auditor#4");
  assert.deepEqual(definitions, before);
  assert.ok(insertRef(empty, "block", null, "pro", context).ok);
  assert.equal(hasUngatedRunnable(preview(definitions.draft, "pro", context)), false);
  const composed = { part: { steps: ["qa"], gates: ["before-qa"] }, parent: { steps: ["plan", "implement", refStep("part"), "accept"], gates: [] } };
  const parentContext = { pipelineId: "part", definitions: composed, mustRun: ["parent"] };
  assert.equal(hasUngatedRunnable(preview(composed.part, "pro", parentContext)), false);
  assert.equal(hasUngatedRunnable(preview({ steps: ["qa"], gates: [] }, "pro", parentContext)), true);
  assert.equal(removeNode({ steps: ["plan", "qa"], gates: [] }, "plan", "pro").ok, true, "fragment anchors can be removed");
});
