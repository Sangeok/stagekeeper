import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HINT, decideHead, decideNext } from "./run-rules.ts";

const base = { key: "FEAT-01", version: 2, status: "planning", planCommit: null, agent: "web-dev", handoff: null, capReason: null };

describe("decideNext (H.4)", () => {
  it("a closed run is done", () => {
    assert.deepEqual(decideNext({ ...base, node: null }), { key: "FEAT-01", node: null, version: 2, action: "done" });
  });
  it("a gate waits — boundary gates carry the boundary, others null", () => {
    assert.deepEqual(decideNext({ ...base, node: "before-plan", status: "proposed" }),
      { key: "FEAT-01", node: "before-plan", version: 2, action: "wait", on: "gate", gate: "before-plan", boundary: { from: "proposed", to: "planning" }, planCommit: null });
    assert.equal(decideNext({ ...base, node: "before-verify", status: "in_review", planCommit: "3f2a9c1" }).boundary, null);
    assert.equal(decideNext({ ...base, node: "before-verify", status: "in_review", planCommit: "3f2a9c1" }).planCommit, "3f2a9c1");
  });
  it("accept comes before handoff", () => {
    assert.equal(decideNext({ ...base, node: "accept", status: "done", handoff: { note: "x" } }).action, "accept");
  });
  it("a handoff on plan waits with the note", () => {
    assert.deepEqual(decideNext({ ...base, node: "plan", handoff: { note: "docs/plans/FEAT-01.md" } }),
      { key: "FEAT-01", node: "plan", version: 2, action: "wait", on: "handoff", note: "docs/plans/FEAT-01.md" });
  });
  it("the cap waits with its sentence", () => {
    const r = decideNext({ ...base, node: "plan", capReason: "dispatch cap reached on the free plan (60) — counted over the last 30 days" });
    assert.equal(r.action, "wait");
    assert.equal(r.on, "cap");
    assert.match(r.reason, /last 30 days/);
  });
  it("plan and implement dispatch the item's dev; doc-audit dispatches doc-auditor; hint comes from HINT", () => {
    assert.deepEqual(decideNext({ ...base, node: "plan" }), { key: "FEAT-01", node: "plan", version: 2, action: "dispatch", agent: "web-dev", hint: HINT.plan });
    assert.equal(decideNext({ ...base, node: "implement", status: "implementing" }).agent, "web-dev");
    assert.equal(decideNext({ ...base, node: "doc-audit", status: "done" }).agent, "doc-auditor");
    assert.equal(decideNext({ ...base, node: "propose", status: "proposed" }).agent, "pm");
  });
  it("HINT has the six sentences and verify mentions validation_record", () => {
    assert.deepEqual(Object.keys(HINT).sort(), ["doc-audit", "implement", "plan", "propose", "scout", "verify"]);
    assert.match(HINT.verify, /validation_record/);
  });
});

describe("decideHead (H.4)", () => {
  it("no propose node → none with the Backlog-tab reason", () => {
    const r = decideHead({ hasPropose: false, openCount: 0, capReason: null });
    assert.equal(r.action, "none");
    assert.match(r.reason, /Backlog tab/);
  });
  it("two open items → none with the pm sentence", () => {
    assert.deepEqual(decideHead({ hasPropose: true, openCount: 2, capReason: null }), { action: "none", reason: "open items: 2 (max 2)" });
  });
  it("the cap → none with its sentence; otherwise dispatch pm with HINT.propose", () => {
    assert.equal(decideHead({ hasPropose: true, openCount: 1, capReason: "dispatch cap reached on the free plan (60)" }).reason, "dispatch cap reached on the free plan (60)");
    assert.deepEqual(decideHead({ hasPropose: true, openCount: 1, capReason: null }), { action: "dispatch", agent: "pm", hint: HINT.propose });
  });
});
