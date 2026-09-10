// 레일 버튼의 활성/비활성 근거. 각 조작은 결과 그래프를 validateGraph에 통과시켜야만 ok를 돌려주므로,
// 화면은 규칙을 다시 구현하지 않고 이유를 그대로 보여 준다(§E.6).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultGraph } from "@harness/core/pipeline.mjs";
import { addNode, insertGate, removeGate, removeNode, swapTail } from "./rail-state";

const pro = () => defaultGraph("pro") as { nodes: string[]; gates: string[] };

describe("rail-state", () => {
  it("inserts a gate on an edge that has a node after it", () => {
    const r = insertGate(pro(), "before-verify", "pro");
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.graph.gates.includes("before-verify"));
  });

  it("refuses a gate whose node the graph does not have", () => {
    const noScout = insertGate(pro(), "before-scout", "pro");
    assert.equal(noScout.ok, false);
    if (!noScout.ok) assert.match(noScout.reason, /has no node after it/);
  });

  it("refuses to remove a required node and says which one", () => {
    const r = removeNode(pro(), "accept", "pro");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /accept can't be removed/);
  });

  it("removes an optional node together with the gate in front of it", () => {
    const gated = insertGate(pro(), "before-verify", "pro");
    assert.ok(gated.ok);
    if (!gated.ok) return;
    const r = removeNode(gated.graph, "verify", "pro");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(!r.graph.nodes.includes("verify"));
      assert.ok(!r.graph.gates.includes("before-verify"), "게이트가 남으면 뒤에 노드가 없어 저장이 막힌다");
    }
  });

  it("adds an opt-in node back in skeleton order", () => {
    const r = addNode(pro(), "scout", "pro");
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.graph.nodes.slice(-2), ["doc-audit", "scout"]);
  });

  it("refuses a node the plan does not allow", () => {
    const free = defaultGraph("free") as { nodes: string[]; gates: string[] };
    const r = addNode(free, "verify", "free");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /verify is not on the free plan/);
  });

  it("swaps the two tail nodes and keeps the head order", () => {
    const withScout = addNode(pro(), "scout", "pro");
    assert.ok(withScout.ok);
    if (!withScout.ok) return;
    const r = swapTail(withScout.graph, "pro");
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.graph.nodes.slice(-2), ["scout", "doc-audit"]);
  });

  it("keeps a swapped tail when another node is added back", () => {
    // addNode가 전체를 골격 순서로 다시 세우면 방금 바꿔 둔 꼬리 순서가 조용히 풀린다.
    const withScout = addNode(pro(), "scout", "pro");
    assert.ok(withScout.ok);
    if (!withScout.ok) return;
    const swapped = swapTail(withScout.graph, "pro");
    assert.ok(swapped.ok);
    if (!swapped.ok) return;
    const trimmed = removeNode(swapped.graph, "verify", "pro");
    assert.ok(trimmed.ok);
    if (!trimmed.ok) return;
    const r = addNode(trimmed.graph, "verify", "pro");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.graph.nodes.slice(-2), ["scout", "doc-audit"]);
      assert.deepEqual(r.graph.nodes.slice(0, 5), ["propose", "plan", "verify", "implement", "accept"]);
    }
  });

  it("removes a gate without touching the nodes", () => {
    const r = removeGate(pro(), "before-plan", "pro");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.graph.gates, ["before-implement"]);
      assert.deepEqual(r.graph.nodes, pro().nodes);
    }
  });
});
