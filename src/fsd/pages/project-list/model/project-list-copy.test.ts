import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { activityLines, connectionSummary, selectionNotice } from "./project-list-copy";

describe("connectionSummary", () => {
  it("counts connected repositories against the plan limit in one sentence", () => {
    assert.deepEqual(connectionSummary({ plan: "free", limit: 1, connectedCount: 1 }), { line: "1 of 1 repository connected on the Free plan.", full: true, over: false });
    assert.deepEqual(connectionSummary({ plan: "free", limit: 1, connectedCount: 0 }), { line: "0 of 1 repository connected on the Free plan.", full: false, over: false });
    assert.deepEqual(connectionSummary({ plan: "pro", limit: 5, connectedCount: 3 }), { line: "3 of 5 repositories connected on the Pro plan.", full: false, over: false });
  });

  it("states the overflow a downgrade preserved instead of an impossible 5 of 1", () => {
    assert.deepEqual(connectionSummary({ plan: "free", limit: 1, connectedCount: 5 }), { line: "5 repositories connected. The Free plan allows 1.", full: true, over: true });
  });

  it("drops the limit on Max", () => {
    assert.deepEqual(connectionSummary({ plan: "max", limit: null, connectedCount: 1 }), { line: "1 repository connected on the Max plan.", full: false, over: false });
  });
});

describe("activityLines", () => {
  it("lists only the non-zero counts, singular for one", () => {
    assert.deepEqual(activityLines(3, 1), ["3 open items", "1 open agent run"]);
    assert.deepEqual(activityLines(1, 0), ["1 open item"]);
    assert.deepEqual(activityLines(0, 2), ["2 open agent runs"]);
  });

  it("says nothing is open rather than showing zeros", () => {
    assert.deepEqual(activityLines(0, 0), ["Nothing open"]);
  });
});

describe("selectionNotice", () => {
  it("explains read-only projects, the in-use allowance and the free-slot rule after a downgrade", () => {
    assert.deepEqual(selectionNotice({ plan: "free", limit: 1, notSelectedCount: 4, over: true, kept: { names: ["mathgic"], basis: "recent-agent-activity" } }), [
      "After your plan changed, mathgic stayed in use, chosen by the most recent agent activity.",
      "4 of your connected repositories are not selected, so they are read only. The Free plan allows 1 in use.",
      "Choose Use this project to change which repositories are in use. A new repository needs a free slot, so disconnect the ones you no longer need.",
    ]);
  });

  it("omits the plan-change sentence without a notice and the allowance on Max", () => {
    assert.deepEqual(selectionNotice({ plan: "max", limit: null, notSelectedCount: 1, over: false, kept: null }), [
      "1 of your connected repositories is not selected, so it is read only.",
      "Choose Use this project to change which repositories are in use.",
    ]);
  });

  it("names the plan change without a basis when the event has none", () => {
    assert.equal(selectionNotice({ plan: "pro", limit: 5, notSelectedCount: 2, over: false, kept: { names: ["a", "b"], basis: null } })[0], "After your plan changed, a, b stayed in use.");
  });
});
