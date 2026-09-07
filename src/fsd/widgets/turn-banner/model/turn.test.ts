import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveTurn, nextStepLine, type TurnItem } from "./turn";

const ready = { tokenIssued: true, rosterSynced: true, backlogCount: 2 };
const item = (key: string, status: string, validation: string | null = null, agent = "dev"): TurnItem => ({
  key,
  status,
  agent,
  validation,
  accepted: false,
  handoff: null,
});
const accepted = (key: string): TurnItem => ({ ...item(key, "done"), accepted: true });
const handoff = (key: string, note: string | null, status = "planning", agent = "web-dev"): TurnItem => ({
  ...item(key, status, null, agent),
  handoff: { step: status === "planning" ? "plan" : "report", note },
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
  it("is none when only accepted done and on_hold remain", () => {
    const turn = deriveTurn([accepted("FEAT-01"), item("FEAT-05", "on_hold")], ready);
    assert.equal(turn.kind, "none");
  });
});

describe("deriveTurn — acceptance and handoff", () => {
  it("done without an acceptance record is yours, with step 7 as the line; accepted done owns nothing", () => {
    const turn = deriveTurn([item("FEAT-02", "done")], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-02 needs acceptance");
    assert.deepEqual(turn.next, [{ key: "FEAT-02", line: "Continue the runbook for FEAT-02: step 7 — accept." }]);
    assert.equal(deriveTurn([accepted("FEAT-02")], ready).kind, "none");
  });
  it("a handoff is yours even while the item is planning; the commit line names the prepared file", () => {
    const turn = deriveTurn([handoff("FEAT-01", "docs/plans/FEAT-01.md")], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.count, 1);
    assert.equal(turn.detail, "FEAT-01 is waiting for your commit");
    assert.deepEqual(turn.next, [{ key: "FEAT-01", line: "Commit docs/plans/FEAT-01.md, then continue the runbook for FEAT-01." }]);
    // note가 없는 핸드오프 — 경로 자리를 고정 문구가 채운다.
    assert.equal(nextStepLine(handoff("FEAT-01", null)), "Commit the prepared file, then continue the runbook for FEAT-01.");
  });
  it("orders approval · acceptance · commit, and still says why pm is blocked", () => {
    const turn = deriveTurn(
      [handoff("FEAT-01", "docs/plans/FEAT-01.md"), item("FEAT-02", "done"), item("FEAT-03", "in_review", "clean pass")],
      ready,
    );
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-03 is ready for your approval · FEAT-02 needs acceptance · FEAT-01 is waiting for your commit");
    assert.equal(turn.count, 3);
    assert.equal(turn.why, "pm can't propose anything new until you clear one."); // planning + in_review = 미결 2
    assert.deepEqual(turn.next.map((n) => n.key), ["FEAT-01", "FEAT-02"]); // verified in_review는 터미널 줄이 없다
  });
});

describe("deriveTurn — where the button goes", () => {
  it("opens the inbox when it has cards, the item page when the turn is only acceptance or a handoff", () => {
    const inbox = deriveTurn([item("FEAT-03", "in_review", "clean pass"), item("FEAT-02", "done")], ready);
    if (inbox.kind !== "mine") assert.fail(inbox.kind);
    assert.deepEqual(inbox.open, { kind: "inbox" });
    const page = deriveTurn([item("FEAT-02", "done"), item("FEAT-01", "implementing")], ready);
    if (page.kind !== "mine") assert.fail(page.kind);
    assert.deepEqual(page.open, { kind: "item", key: "FEAT-02" });
    const paused = deriveTurn([handoff("FEAT-01", "docs/plans/FEAT-01.md")], ready);
    if (paused.kind !== "mine") assert.fail(paused.kind);
    assert.deepEqual(paused.open, { kind: "item", key: "FEAT-01" });
    // on_hold는 배너를 소유하지 않지만 결재함 카드라서 버튼은 Inbox로 간다.
    const held = deriveTurn([item("FEAT-02", "done"), item("FEAT-05", "on_hold")], ready);
    if (held.kind !== "mine") assert.fail(held.kind);
    assert.deepEqual(held.open, { kind: "inbox" });
  });
});

describe("nextStepLine", () => {
  it("has no line for states that wait on nobody in the terminal", () => {
    assert.equal(nextStepLine(item("FEAT-01", "proposed")), null);
    assert.equal(nextStepLine(item("FEAT-01", "in_review", "clean pass")), null);
    assert.equal(nextStepLine(accepted("FEAT-01")), null);
  });
});
