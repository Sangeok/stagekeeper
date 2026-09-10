// 탭 뱃지와 배너가 같은 수가 아니라는 사실을 고정한다.
// 뱃지는 결재함 목록과 같은 술어로 세고(on_hold 포함, product-copy.md §7),
// 배너는 on_hold를 세지 않는다(§5). 예전에는 뱃지가 배너 쪽을 따라가서
// on_hold만 남은 프로젝트가 "뱃지 0인데 카드가 보이는" 상태였다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATUSES, findRule } from "@harness/core/transitions.mjs";
import { isAtGate, needsHumanDecision, pendingInboxCount, reopenTargetsFor, type RuleKind } from "./gate-source";

// RuleKind는 여기와 src/server/pipeline/board-rules.ts 두 곳에 있다 — FSD와 서버가 서로를
// import할 수 없어서다. 이 테스트가 두 목록과 packages/core의 RULES를 묶어 둔다:
// RULES에 새 kind가 생기면 여기서 깨지고, 그때 두 곳을 함께 고치게 된다.
const DECLARED: RuleKind[] = ["gate", "auto", "bounce", "hold", "resume", "plan", "done", "reopen"];

describe("RuleKind", () => {
  it("covers every kind the state machine actually produces", () => {
    const seen = new Set<string>();
    for (const actor of ["human", "agent", "pipeline"]) {
      for (const from of STATUSES as string[]) {
        for (const to of STATUSES as string[]) {
          const kind = findRule(actor, from, to)?.kind;
          if (typeof kind === "string") seen.add(kind);
        }
      }
    }
    assert.ok(seen.size > 0, "state machine produced no rules — the walk is wrong, not the union");
    for (const kind of seen) {
      assert.ok(DECLARED.includes(kind as RuleKind), `RULES has kind "${kind}" that RuleKind does not declare`);
    }
  });
});

describe("reopenTargetsFor", () => {
  it("done reopens to planning or implementing; nothing else reopens; done is still not an inbox card", () => {
    assert.deepEqual(reopenTargetsFor("done"), ["planning", "implementing"]);
    for (const s of ["proposed", "planning", "in_review", "implementing", "on_hold"]) assert.deepEqual(reopenTargetsFor(s), [], s);
    // Inbox 자격은 런이 게이트에 서 있거나 재개 가능한 것뿐 — 게이트 없는 done은 카드가 아니다.
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
    // 상태만 보면 proposed는 게이트지만, 그래프가 before-plan을 빼면 카드가 아니다(§E.1).
    assert.equal(needsHumanDecision({ status: "proposed", gate: null }), false);
    assert.equal(needsHumanDecision({ status: "proposed", gate: "before-plan" }), true);
    // 비경계 게이트도 카드다 — 상태 기계에는 그 자리에 사람 규칙이 없다.
    assert.equal(needsHumanDecision({ status: "in_review", gate: "before-verify" }), true);
  });

  it("counts a resumable on_hold item that never owns the banner", () => {
    // 이 한 줄이 회귀의 핵심이다 — 배너 술어(isAtGate)로 세면 0이 된다.
    assert.equal(isAtGate({ status: "on_hold", gate: null }), false);
    assert.equal(needsHumanDecision({ status: "on_hold", gate: null }), true);
    assert.equal(pendingInboxCount([{ status: "on_hold", gate: null }]), 1);
  });

  it("is zero when nothing waits on a person", () => {
    assert.equal(pendingInboxCount([{ status: "planning", gate: null }, { status: "implementing", gate: null }, { status: "done", gate: null }]), 0);
    assert.equal(pendingInboxCount([]), 0);
  });
});
