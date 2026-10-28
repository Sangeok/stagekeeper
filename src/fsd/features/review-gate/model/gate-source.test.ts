import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsHumanDecision, pendingInboxCount, reopenTargetsFor } from "./gate-source";

describe("reopenTargetsFor", () => {
  it("done reopens to planning or implementing; nothing else reopens; done is still not an inbox card", () => {
    assert.deepEqual(reopenTargetsFor("done"), ["planning", "implementing"]);
    for (const s of ["proposed", "planning", "in_review", "implementing", "on_hold"]) assert.deepEqual(reopenTargetsFor(s), [], s);
    assert.equal(needsHumanDecision({ status: "done", gate: null }), false);
  });
});

describe("pendingInboxCount", () => {
  it("counts the same rows the inbox list renders", () => {
    const rows = [
      { status: "proposed", gate: "before-plan" },
      { status: "in_review", gate: "before-implement" },
      { status: "planning", gate: null },
      { status: "done", gate: null },
    ];
    assert.equal(pendingInboxCount(rows), rows.filter(needsHumanDecision).length);
  });

  it("a gate the graph removed is not a card, whatever the status says", () => {
    assert.equal(needsHumanDecision({ status: "proposed", gate: null }), false);
    assert.equal(needsHumanDecision({ status: "proposed", gate: "before-plan" }), true);
    assert.equal(needsHumanDecision({ status: "in_review", gate: "before-verify" }), true);
  });

  it("counts a resumable on_hold item that never owns the banner", () => {
    assert.equal(needsHumanDecision({ status: "on_hold", gate: null }), true);
    assert.equal(pendingInboxCount([{ status: "on_hold", gate: null }]), 1);
  });

  it("is zero when nothing waits on a person", () => {
    assert.equal(pendingInboxCount([{ status: "planning", gate: null }, { status: "implementing", gate: null }, { status: "done", gate: null }]), 0);
    assert.equal(pendingInboxCount([]), 0);
  });
});
