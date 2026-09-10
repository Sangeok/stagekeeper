import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { advance, cursorForStatus, DEFAULT_GATES, defaultGraph, dispatcherFor, gateId, NODE_KINDS, nodeDone, sequence, validateGraph } from "./pipeline.mjs";

const full = { nodes: [...NODE_KINDS], gates: [...DEFAULT_GATES] };
const facts = (o = {}) => ({ status: "proposed", validation: null, accepted: false, approvedGates: [], closedAgents: [], ...o });

describe("defaultGraph", () => {
  it("free has no verify or doc-audit; pro and max have every node but scout; gates are the two boundaries", () => {
    assert.deepEqual(defaultGraph("free").nodes, ["propose", "plan", "implement", "accept"]);
    assert.deepEqual(defaultGraph("pro").nodes, NODE_KINDS.filter((k) => k !== "scout"));
    assert.deepEqual(defaultGraph("max").gates, DEFAULT_GATES);
  });
  it("scout is opt-in — absent from every default graph, valid once added on a plan that has feature-scout", () => {
    for (const plan of ["free", "pro", "max"]) assert.equal(defaultGraph(plan).nodes.includes("scout"), false, plan);
    assert.equal(validateGraph({ nodes: [...defaultGraph("free").nodes, "scout"], gates: [] }, "free").ok, true);
  });
});

describe("validateGraph", () => {
  it("accepts the defaults on their own plan", () => {
    for (const plan of ["free", "pro", "max"]) assert.equal(validateGraph(defaultGraph(plan), plan).ok, true, plan);
  });
  it("refuses removing plan, implement, or accept", () => {
    assert.match(validateGraph({ nodes: ["propose", "plan", "implement"], gates: [] }, "max").reason, /accept can't be removed/);
  });
  it("refuses a node the plan does not allow, and a gate with no node after it", () => {
    assert.match(validateGraph({ nodes: ["plan", "verify", "implement", "accept"], gates: [] }, "free").reason, /verify is not on the free plan/);
    assert.match(validateGraph({ nodes: ["plan", "implement", "accept"], gates: [gateId("verify")] }, "max").reason, /has no node after it/);
    assert.match(validateGraph({ nodes: ["propose", "plan", "implement", "accept"], gates: [gateId("propose")] }, "max").reason, /has no node after it/);
  });
  it("keeps the head order and lets the tail swap", () => {
    assert.equal(validateGraph({ nodes: ["plan", "implement", "verify", "accept"], gates: [] }, "max").ok, false);
    assert.equal(validateGraph({ nodes: ["plan", "implement", "accept", "scout", "doc-audit"], gates: [] }, "max").ok, true);
  });
  it("allows zero gates", () => {
    assert.equal(validateGraph({ nodes: ["plan", "implement", "accept"], gates: [] }, "max").ok, true);
  });
});

describe("sequence and cursorForStatus", () => {
  it("interleaves each gate before its node", () => {
    assert.deepEqual(sequence(full), ["propose", "before-plan", "plan", "verify", "before-implement", "implement", "accept", "doc-audit", "scout"]);
  });
  it("proposed waits at before-plan when gated, else at plan; in_review goes to verify when present", () => {
    assert.equal(cursorForStatus(full, "proposed"), "before-plan");
    assert.equal(cursorForStatus({ nodes: full.nodes, gates: [] }, "proposed"), "plan");
    assert.equal(cursorForStatus(full, "in_review"), "verify");
    assert.equal(cursorForStatus({ nodes: ["plan", "implement", "accept"], gates: [] }, "in_review"), "implement");
    assert.equal(cursorForStatus(full, "on_hold"), null);
  });
});

describe("advance", () => {
  it("stops at a gate until it is approved", () => {
    const r = advance(full, "propose", facts());
    assert.equal(r.cursor, "before-plan");
    assert.deepEqual(r.transitions, []);
  });
  it("with no gate before plan, crosses proposed → planning itself and stops at plan", () => {
    const r = advance({ nodes: full.nodes, gates: [gateId("implement")] }, "propose", facts());
    assert.equal(r.cursor, "plan");
    assert.deepEqual(r.transitions, [{ from: "proposed", to: "planning" }]);
    assert.deepEqual(r.entered, ["plan"]);
  });
  it("a run that starts on plan (no propose node, or put on the board from the web) still crosses proposed → planning", () => {
    const r = advance({ nodes: ["plan", "implement", "accept"], gates: [] }, "plan", facts());
    assert.equal(r.cursor, "plan");
    assert.deepEqual(r.transitions, [{ from: "proposed", to: "planning" }]);
  });
  it("entering a gate counts as entered — the server refreshes enteredAt there too", () => {
    assert.deepEqual(advance(full, "propose", facts()).entered, ["before-plan"]);
  });
  it("with no gate before implement, a validation record carries the item into implementing", () => {
    const r = advance({ nodes: full.nodes, gates: [gateId("plan")] }, "verify", facts({ status: "in_review", validation: "clean pass" }));
    assert.equal(r.cursor, "implement");
    assert.deepEqual(r.transitions, [{ from: "in_review", to: "implementing" }]);
  });
  it("closes after the last node completes", () => {
    const r = advance({ nodes: ["plan", "implement", "accept"], gates: [] }, "accept", facts({ status: "done", accepted: true }));
    assert.equal(r.cursor, null);
  });
  it("nodeDone judges by evidence only", () => {
    assert.equal(nodeDone("plan", facts({ status: "planning" })), false);
    assert.equal(nodeDone("plan", facts({ status: "in_review" })), true);
    assert.equal(nodeDone("accept", facts({ status: "done" })), false);
    assert.equal(nodeDone("doc-audit", facts({ closedAgents: ["doc-auditor"] })), true);
  });
});

describe("dispatcherFor", () => {
  it("names the agent that actually turns the node", () => {
    // 화면이 "지금 이 일을 하는 run이 열려 있나"를 물을 때 쓴다.
    assert.equal(dispatcherFor("plan", "web-dev"), "web-dev");
    assert.equal(dispatcherFor("implement", "web-dev"), "web-dev");
    assert.equal(dispatcherFor("verify", "web-dev"), "plan-verifier");
    assert.equal(dispatcherFor("propose", "web-dev"), "pm");
    assert.equal(dispatcherFor("doc-audit", "web-dev"), "doc-auditor");
    assert.equal(dispatcherFor("scout", "web-dev"), "feature-scout");
  });

  it("accept dispatches nobody — the main loop runs it", () => {
    assert.equal(dispatcherFor("accept", "web-dev"), null);
  });

  it("is not the item's dev outside plan and implement, so a stale dev run cannot pass for verification", () => {
    assert.notEqual(dispatcherFor("verify", "web-dev"), "web-dev");
  });
});
