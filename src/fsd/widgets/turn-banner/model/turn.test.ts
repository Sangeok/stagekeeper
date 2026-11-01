import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { copyLock } from "@/fsd/shared/lib/copy-lock";
import { WATCH_LINE, deriveTurn, nextStepLine, type TurnItem } from "./turn";

const ready = { tokenIssued: true, rosterSynced: true };
const cursorFor = (status: string, validation: string | null): { gate: string | null; node: string | null } => {
  switch (status) {
    case "proposed": return { gate: "before-plan", node: "before-plan" };
    case "planning": return { gate: null, node: "plan" };
    case "in_review": return validation === null ? { gate: null, node: "verify" } : { gate: "before-implement", node: "before-implement" };
    case "implementing": return { gate: null, node: "implement" };
    case "done": return { gate: null, node: "accept" };
    default: return { gate: null, node: null };
  }
};
const item = (key: string, status: string, validation: string | null = null, agent = "dev"): TurnItem => ({
  key,
  status,
  agent,
  accepted: false,
  acceptanceFailed: false,
  handoff: null,
  dispatched: true,
  ...cursorFor(status, validation),
});
const failed = (key: string): TurnItem => ({ ...item(key, "done"), acceptanceFailed: true });
const accepted = (key: string): TurnItem => ({ ...item(key, "done"), accepted: true, gate: null, node: null });
const handoff = (key: string, note: string | null, status = "planning", agent = "web-dev"): TurnItem => ({
  ...item(key, status, null, agent),
  handoff: { step: status === "planning" ? "plan" : "report", note },
});

it("failure suppresses its old handoff line and preserves other ready work and gate destination", () => {
  const f = { ...failed("FAILED"), handoff: { step: "report", note: "old.md" } };
  assert.equal(nextStepLine(f), null);
  const turn = deriveTurn([f, item("READY", "planning"), item("GATE", "proposed")], ready);
  if (turn.kind !== "mine") assert.fail(turn.kind);
  assert.deepEqual(turn.open, { kind: "inbox" });
  assert.deepEqual(turn.next.map(n => n.key), ["READY"]);
  assert.equal(turn.detail, "GATE needs a plan request · FAILED failed acceptance");
  const multiple = deriveTurn([failed("A"), failed("B")], ready);
  if (multiple.kind !== "mine") assert.fail(multiple.kind);
  assert.equal(multiple.detail, "2 items failed acceptance");
  for (const dispatched of [true, false]) {
    const turn = deriveTurn([{ ...item("A", "done"), dispatched }], ready);
    if (turn.kind !== "theirs") assert.fail(turn.kind);
    assert.equal(turn.detail, "A is waiting for acceptance");
  }
});

describe("deriveTurn — setup", () => {
  it("describes only the included nodes regardless of deprecated flags", () => {
    const setup = { ...ready, autoScoutEnabled: false };
    const first = deriveTurn([], setup);
    assert.equal(first.kind, "setup");
    if (first.kind === "setup") assert.match(first.steps[2].detail, /Discover work finds candidates when included/);
    const idle = deriveTurn([accepted("DONE")], setup);
    assert.equal(idle.kind, "none");
    if (idle.kind === "none") assert.match(idle.detail, /Add work to the backlog or run a pipeline/);
  });
  it("shows the checklist while the board is empty, pointing at the first undone step", () => {
    const turn = deriveTurn([], { tokenIssued: true, rosterSynced: false });
    assert.equal(turn.kind, "setup");
    if (turn.kind !== "setup") return;
    assert.equal(turn.current, 2);
    assert.deepEqual(
      turn.steps.map((s) => s.done),
      [true, false, false],
    );
  });
  it("stops at step 3 until the pipeline puts an item on the board", () => {
    const turn = deriveTurn([], ready);
    assert.equal(turn.kind, "setup");
    if (turn.kind === "setup") assert.equal(turn.current, 3);
  });
  it("counts the token step done once the repository is connected without a project token", () => {
    const connected = deriveTurn([], { tokenIssued: false, rosterSynced: true });
    assert.equal(connected.kind, "setup");
    if (connected.kind !== "setup") return;
    assert.equal(connected.current, 3);
    assert.deepEqual(connected.steps.map((s) => s.done), [true, true, false]);
    const fresh = deriveTurn([], { tokenIssued: false, rosterSynced: false });
    if (fresh.kind === "setup") assert.equal(fresh.current, 1);
  });
});

describe("deriveTurn — mine", () => {
  it("names a single item and says why pm is blocked at two open items", () => {
    const turn = deriveTurn([item("FEAT-01", "proposed"), item("FEAT-02", "planning")], ready);
    assert.equal(turn.kind, "mine");
    if (turn.kind !== "mine") return;
    assert.equal(turn.count, 1);
    assert.equal(turn.detail, "FEAT-01 needs a plan request");
    assert.equal(turn.why, "Assign work waits until you clear one.");
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
  it("an unverified plan on the verify node is theirs — the session's own round and plan-verifier are still ahead", () => {
    const turn = deriveTurn([item("FEAT-04", "in_review", null)], ready);
    if (turn.kind !== "theirs") assert.fail(turn.kind);
    assert.equal(turn.detail, "the plan for FEAT-04 is being verified");
    assert.deepEqual(turn.next, [{ kind: "continue", key: "FEAT-04", line: "Continue the pipeline for FEAT-04: verify — verify the plan." }]);
  });
  it("without a verify node the same item waits at before-implement, ready for approval like a verified one", () => {
    const atGate: TurnItem = { ...item("FEAT-04", "in_review", null), gate: "before-implement", node: "before-implement" };
    const turn = deriveTurn([atGate], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-04 is ready for your approval");
    assert.equal(turn.why, null);
    assert.deepEqual(turn.next, []);
  });
  it("counts verified and unverified plans at before-implement as one approval category", () => {
    const unverified: TurnItem = { ...item("FEAT-04", "in_review", null), gate: "before-implement", node: "before-implement" };
    const turn = deriveTurn([item("FEAT-03", "in_review", "clean pass"), unverified], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "2 plans are ready for your approval");
    assert.equal(turn.count, 2);
  });
  it("a gate the five categories do not name still says where the item stands", () => {
    const atVerify: TurnItem = { ...item("FEAT-06", "in_review", null), gate: "before-verify", node: "before-verify" };
    const turn = deriveTurn([atVerify], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-06 is waiting before Verify");

    const atDocAudit: TurnItem = { ...accepted("FEAT-07"), gate: "before-doc-audit", node: "before-doc-audit" };
    const tail = deriveTurn([atDocAudit], ready);
    if (tail.kind !== "mine") assert.fail(tail.kind);
    assert.equal(tail.detail, "FEAT-07 is waiting before Doc audit");

    const both = deriveTurn([atVerify, atDocAudit], ready);
    if (both.kind !== "mine") assert.fail(both.kind);
    assert.equal(both.detail, "2 items are waiting at a gate");
  });

  it("an acceptance gate says the gate, not the acceptance, so one item asks for one thing", () => {
    const atAccept: TurnItem = { ...item("FEAT-08", "done"), gate: "before-accept", node: "before-accept" };
    const turn = deriveTurn([atAccept], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-08 is waiting before Accept");
    assert.equal((deriveTurn([item("FEAT-08", "done")], ready) as { detail: string }).detail, "FEAT-08 is waiting for acceptance");
  });

  it("on_hold never owns the banner", () => {
    const turn = deriveTurn([item("FEAT-05", "on_hold"), item("FEAT-01", "proposed")], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.count, 1);
  });

  it("a held item keeps its node but nobody is working on it", () => {
    const held = { ...item("FEAT-05", "on_hold"), node: "implement", gate: null };
    assert.equal(deriveTurn([held], ready).kind, "none");
    const withGate = deriveTurn([held, item("FEAT-01", "proposed")], ready);
    if (withGate.kind !== "mine") assert.fail(withGate.kind);
    assert.equal(withGate.count, 1);
  });
});

describe("deriveTurn — theirs and none", () => {
  it("does not claim an agent is working when nobody was dispatched yet", () => {
    const turn = deriveTurn([{ ...item("FEAT-01", "planning"), dispatched: false }], ready);
    if (turn.kind !== "theirs") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-01 is waiting for dev");
    assert.deepEqual(turn.next.map((n) => n.line), ["Continue the pipeline for FEAT-01: plan — dev writes the plan."]);
  });

  it("says the verify node is waiting on verification, not on an agent name", () => {
    const turn = deriveTurn([{ ...item("FEAT-04", "in_review", null), dispatched: false }], ready);
    if (turn.kind !== "theirs") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-04 is waiting for verification");
  });

  it("lists what agents are doing with the runbook line to continue", () => {
    const turn = deriveTurn([item("FEAT-01", "implementing"), item("FEAT-02", "planning", null, "web-dev")], ready);
    assert.equal(turn.kind, "theirs");
    if (turn.kind !== "theirs") return;
    assert.equal(turn.detail, "dev is implementing FEAT-01 · web-dev is writing the plan for FEAT-02");
    assert.deepEqual(
      turn.next.map((n) => n.line),
      [
        "Continue the pipeline for FEAT-01: implement — dev implements.",
        "Continue the pipeline for FEAT-02: plan — web-dev writes the plan.",
      ],
    );
  });

  it("an item at an item-bound verifier node is the session's work, with that verifier's line", () => {
    for (const [node, agent] of [["impl-verify", "impl-verifier"], ["qa", "qa-verifier"]] as const) {
      const turn = deriveTurn([{ ...item("FEAT-09", "done"), node }], ready);
      if (turn.kind !== "theirs") assert.fail(`${node}: ${turn.kind}`);
      assert.deepEqual(turn.next.map((n) => n.line), [`Continue the pipeline for FEAT-09: ${node} — ${agent} runs ${node}.`], node);
    }
  });
  it("is none when only accepted done and on_hold remain", () => {
    const turn = deriveTurn([accepted("FEAT-01"), item("FEAT-05", "on_hold")], ready);
    assert.equal(turn.kind, "none");
  });
});

describe("deriveTurn — acceptance and handoff", () => {
  it("done at accept is the session’s turn; accepted done owns nothing", () => {
    const turn = deriveTurn([item("FEAT-02", "done")], ready);
    if (turn.kind !== "theirs") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-02 is waiting for acceptance");
    assert.deepEqual(turn.next, [{ kind: "continue", key: "FEAT-02", line: "Continue the pipeline for FEAT-02: accept — accept." }]);
    assert.equal(deriveTurn([accepted("FEAT-02")], ready).kind, "none");
  });
  it("a handoff is yours even while the item is planning; the commit line names the prepared file", () => {
    const turn = deriveTurn([handoff("FEAT-01", "docs/plans/FEAT-01.md")], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.count, 1);
    assert.equal(turn.detail, "FEAT-01 is waiting for your commit");
    assert.deepEqual(turn.next, [{ kind: "handoff", key: "FEAT-01", line: "Commit docs/plans/FEAT-01.md, then continue the pipeline for FEAT-01.", note: "docs/plans/FEAT-01.md" }]);
    assert.equal(nextStepLine(handoff("FEAT-01", null)), "Commit the prepared file, then continue the pipeline for FEAT-01.");
  });
  it("orders approval · acceptance · commit, and still says why pm is blocked", () => {
    const turn = deriveTurn(
      [handoff("FEAT-01", "docs/plans/FEAT-01.md"), failed("FEAT-02"), item("FEAT-03", "in_review", "clean pass")],
      ready,
    );
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.detail, "FEAT-03 is ready for your approval · FEAT-02 failed acceptance · FEAT-01 is waiting for your commit");
    assert.equal(turn.count, 3);
    assert.equal(turn.why, "Assign work waits until you clear one.");
    assert.deepEqual(turn.next.map((n) => n.key), ["FEAT-01"]);
  });
});

describe("deriveTurn — where the button goes", () => {
  it("opens the inbox when it has cards, the item page when the turn is only acceptance or a handoff", () => {
    const inbox = deriveTurn([item("FEAT-03", "in_review", "clean pass"), failed("FEAT-02")], ready);
    if (inbox.kind !== "mine") assert.fail(inbox.kind);
    assert.deepEqual(inbox.open, { kind: "inbox" });
    const page = deriveTurn([failed("FEAT-02"), item("FEAT-01", "implementing")], ready);
    if (page.kind !== "mine") assert.fail(page.kind);
    assert.deepEqual(page.open, { kind: "item", key: "FEAT-02" });
    const paused = deriveTurn([handoff("FEAT-01", "docs/plans/FEAT-01.md")], ready);
    if (paused.kind !== "mine") assert.fail(paused.kind);
    assert.deepEqual(paused.open, { kind: "item", key: "FEAT-01" });
    const held = deriveTurn([failed("FEAT-02"), item("FEAT-05", "on_hold")], ready);
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

describe("terminal steps while waiting on the owner", () => {
  it("keeps failed acceptance on the owner while other unstarted work remains visible", () => {
    const turn = deriveTurn([failed("ITEM-02"), { ...item("ITEM-01", "planning"), dispatched: false }], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.equal(turn.count, 1);
    assert.equal(turn.detail, "ITEM-02 failed acceptance");
    assert.equal(turn.why, null);
    assert.deepEqual(turn.open, { kind: "item", key: "ITEM-02" });
    assert.deepEqual(turn.next, [
      { kind: "continue", key: "ITEM-01", line: "Continue the pipeline for ITEM-01: plan — dev writes the plan." },
    ]);
  });
  it("does not duplicate a handoff's node and includes the other unstarted implement step", () => {
    const turn = deriveTurn([handoff("ITEM-02", "docs/plans/ITEM-02.md"), { ...item("ITEM-01", "implementing"), dispatched: false }], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.deepEqual(turn.next, [
      { kind: "handoff", key: "ITEM-02", line: "Commit docs/plans/ITEM-02.md, then continue the pipeline for ITEM-02.", note: "docs/plans/ITEM-02.md" },
      { kind: "continue", key: "ITEM-01", line: "Continue the pipeline for ITEM-01: implement — dev implements." },
    ]);
    assert.equal(turn.count, 1);
  });
  it("keeps a gate's inbox destination and includes verification/repeated project slots, excluding held items", () => {
    const gate = item("GATE", "proposed");
    const verifier = item("VERIFY", "in_review");
    const slot = { ...accepted("SCOUT"), node: "feature-scout#2", dispatched: false };
    const held = { ...item("HELD", "on_hold"), node: "plan" };
    const turn = deriveTurn([gate, verifier, slot, held], ready);
    if (turn.kind !== "mine") assert.fail(turn.kind);
    assert.deepEqual(turn.open, { kind: "inbox" });
    assert.equal(turn.count, 1);
    assert.deepEqual(turn.next.map((step) => step.key), ["VERIFY", "SCOUT"]);
    assert.match(turn.next[1].line, /feature-scout/);
  });
  it("locks the watch sentence to product-copy", () => assert.deepEqual([WATCH_LINE], copyLock("turn-banner-watch")));
});

describe("the first-run connect step", () => {
  it("reads exactly as product-copy.md §5 locks it", () => {
    const turn = deriveTurn([], { tokenIssued: true, rosterSynced: false });
    assert.equal(turn.kind, "setup");
    const connect = turn.kind === "setup" ? turn.steps.find((step) => step.key === "connect") : undefined;
    assert.deepEqual([connect?.detail], copyLock("turn-banner-connect"));
  });
});
