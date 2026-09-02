import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveTurn, nextStepLine, type TurnItem } from "./turn";

const ready = { tokenIssued: true, rosterSynced: true, backlogCount: 2 };
const item = (key: string, status: string, validation: string | null = null, agent = "dev"): TurnItem => ({
  key,
  status,
  agent,
  validation,
});

describe("deriveTurn — setup", () => {
  it("shows the checklist while the board is empty, pointing at the first undone step", () => {
    const turn = deriveTurn([], { tokenIssued: true, rosterSynced: false, backlogCount: 0 });
    assert.equal(turn.kind, "setup");
    if (turn.kind !== "setup") return;
    assert.equal(turn.current, 2);
    assert.deepEqual(
      turn.steps.map((s) => s.done),
      [true, false, false, false],
    );
  });
  it("stops at step 4 when everything else is done but pm never ran", () => {
    const turn = deriveTurn([], ready);
    assert.equal(turn.kind, "setup");
    if (turn.kind === "setup") assert.equal(turn.current, 4);
  });
});

describe("deriveTurn — mine", () => {
  it("names a single item and says why pm is blocked at two open items", () => {
    const turn = deriveTurn([item("FEAT-01", "proposed"), item("FEAT-02", "planning")], ready);
    assert.equal(turn.kind, "mine");
    if (turn.kind !== "mine") return;
    assert.equal(turn.count, 1);
    assert.equal(turn.detail, "FEAT-01 needs a plan request");
    assert.equal(turn.why, "pm can't propose anything new until you clear one.");
  });
  it("counts several and orders approval before plan requests", () => {
    const turn = deriveTurn(
      [item("FEAT-03", "in_review", "clean pass"), item("FEAT-01", "proposed"), item("FEAT-02", "proposed")],
      ready,
    );
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-03 is ready for your approval · 2 items need a plan request");
    assert.equal(turn.count, 3);
  });
  it("treats an unverified plan as yours, with the verify step as the next line", () => {
    const turn = deriveTurn([item("FEAT-04", "in_review", null)], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-04 needs verification before approval");
    assert.equal(turn.why, null);
    assert.deepEqual(turn.next, [{ key: "FEAT-04", line: "Continue the runbook for FEAT-04: step 4 — verify the plan." }]);
  });
  it("on_hold never owns the banner", () => {
    const turn = deriveTurn([item("FEAT-05", "on_hold"), item("FEAT-01", "proposed")], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.count, 1);
  });
});

describe("deriveTurn — theirs and none", () => {
  it("lists what agents are doing with the runbook line to continue", () => {
    const turn = deriveTurn([item("FEAT-01", "implementing"), item("FEAT-02", "planning", null, "web-dev")], ready);
    assert.equal(turn.kind, "theirs");
    if (turn.kind !== "theirs") return;
    assert.equal(turn.detail, "dev is implementing FEAT-01 · web-dev is writing the plan for FEAT-02");
    assert.deepEqual(
      turn.next.map((n) => n.line),
      [
        "Continue the runbook for FEAT-01: step 6 — dev implements.",
        "Continue the runbook for FEAT-02: step 3 — web-dev writes the plan.",
      ],
    );
  });
  // on_hold는 배너를 소유하지 않는다(product-copy.md §5) — 결재함 목록과 탭 뱃지는 다르다.
  it("is none when only done and on_hold remain", () => {
    const turn = deriveTurn([item("FEAT-01", "done"), item("FEAT-05", "on_hold")], ready);
    assert.equal(turn.kind, "none");
  });
});

describe("nextStepLine", () => {
  it("has no line for states that wait on nobody in the terminal", () => {
    assert.equal(nextStepLine(item("FEAT-01", "proposed")), null);
    assert.equal(nextStepLine(item("FEAT-01", "in_review", "clean pass")), null);
    assert.equal(nextStepLine(item("FEAT-01", "done")), null);
  });
});
