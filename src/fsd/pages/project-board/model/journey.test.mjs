import assert from "node:assert/strict";
import { describe, it } from "node:test";

// journey.ts는 임포트가 없어(board.ts와 동종) mock.module 없이 직접 import한다.
import { deriveJourney } from "./journey.ts";

const CATALOG_LABELS = ["Proposed", "Plan requested", "Plan", "Verified", "Approved", "Implemented", "Accepted"];
const CATALOG_ACTORS = ["pm", "user", "agent", "verifier", "user", "agent", "loop"];

// 진행 중 넷 + in_review 이분 = 매핑되는 다섯 경우. [status, validation, 기대 currentIndex]
const PROGRESS_CASES = [
  ["proposed", null, 1],
  ["planning", null, 2],
  ["in_review", null, 3],
  ["in_review", "clean pass (2026-08-27, 1 round, no edits)", 4],
  ["implementing", null, 5],
];

describe("deriveJourney — 전 status 매핑", () => {
  it("proposed → Plan requested(1), user Your turn, next Plan", () => {
    const v = deriveJourney("proposed", null);
    assert.equal(v.currentIndex, 1);
    assert.equal(v.currentLabel, "Plan requested");
    assert.equal(v.waitingActor, "user");
    assert.equal(v.waitingLabel, "Your turn");
    assert.equal(v.nextLabel, "Plan");
    assert.equal(v.stages[0].state, "done");
    assert.equal(v.stages[1].state, "current");
    for (let i = 2; i <= 6; i++) assert.equal(v.stages[i].state, "upcoming");
  });

  it("planning → Plan(2), agent In progress, next Verified", () => {
    const v = deriveJourney("planning", null);
    assert.equal(v.currentIndex, 2);
    assert.equal(v.currentLabel, "Plan");
    assert.equal(v.waitingActor, "agent");
    assert.equal(v.waitingLabel, "In progress");
    assert.equal(v.nextLabel, "Verified");
    assert.deepEqual(v.stages.map((s) => s.state), ["done", "done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("in_review(판정 없음) → Verified(3), verifier Verifying, next Approved", () => {
    const v = deriveJourney("in_review", null);
    assert.equal(v.currentIndex, 3);
    assert.equal(v.currentLabel, "Verified");
    assert.equal(v.waitingActor, "verifier");
    assert.equal(v.waitingLabel, "Verifying");
    assert.equal(v.nextLabel, "Approved");
    assert.deepEqual(v.stages.map((s) => s.state), ["done", "done", "done", "current", "upcoming", "upcoming", "upcoming"]);
  });

  it("implementing → Implemented(5), agent In progress, next Accepted", () => {
    const v = deriveJourney("implementing", null);
    assert.equal(v.currentIndex, 5);
    assert.equal(v.currentLabel, "Implemented");
    assert.equal(v.waitingActor, "agent");
    assert.equal(v.waitingLabel, "In progress");
    assert.equal(v.nextLabel, "Accepted");
    assert.deepEqual(v.stages.map((s) => s.state), ["done", "done", "done", "done", "done", "current", "upcoming"]);
  });

  it("done·on_hold·null·미지 status → 모두 null(여정 밖·미렌더)", () => {
    // done을 build(5)로, on_hold를 어느 단계로 매핑하는 오구현을 잡는다.
    assert.equal(deriveJourney("done", null), null);
    assert.equal(deriveJourney("on_hold", null), null);
    assert.equal(deriveJourney(null, null), null);
    assert.equal(deriveJourney("verified", null), null);
    assert.equal(deriveJourney("검토대기", null), null); // 옛 한글 식별자는 상태가 아니다
  });
});

describe("deriveJourney — in_review 이분(검증 기록으로 갈린다)", () => {
  it("기록 없으면 Verified(3), 있으면 Approved(4)", () => {
    // 두 단언이 함께 있어야 "항상 3" / "항상 4" 오구현이 둘 다 사멸한다.
    assert.equal(deriveJourney("in_review", null).currentIndex, 3);
    assert.equal(deriveJourney("in_review", "clean pass (2026-08-27, 1 round, no edits)").currentIndex, 4);
  });

  it("판정은 내용이 아니라 존재다 — 다른 비-null 문자열도 Approved(4)", () => {
    // 검증 값 내용을 파싱하는 오구현을 잡는다("존재=통과").
    assert.equal(deriveJourney("in_review", "x").currentIndex, 4);
  });
});

describe("deriveJourney — state 부여 불변식(off-by-one 방어)", () => {
  for (const [status, validation, expectedIndex] of PROGRESS_CASES) {
    it(`${status}/${validation ?? "null"}: 길이 7·current 1개·앞 done·뒤 upcoming·waitingActor 일치`, () => {
      const v = deriveJourney(status, validation);
      assert.equal(v.stages.length, 7);
      assert.equal(v.currentIndex, expectedIndex);

      const currents = v.stages.filter((s) => s.state === "current");
      assert.equal(currents.length, 1); // 정확히 1개
      assert.equal(v.stages[expectedIndex].state, "current");

      for (let i = 0; i < 7; i++) {
        const expected = i < expectedIndex ? "done" : i === expectedIndex ? "current" : "upcoming";
        assert.equal(v.stages[i].state, expected);
      }
      assert.equal(v.waitingActor, v.stages[v.currentIndex].actor);
    });
  }
});

describe("deriveJourney — 단계 카탈로그 고정", () => {
  it("label·actor 시퀀스가 결재선 순서로 고정", () => {
    // 단계 순서·주체를 바꾸는 오구현(예 게이트②를 agent로)을 잡는다 —
    // "게이트=사용자" 색 매핑의 근원이라 고정한다.
    const v = deriveJourney("proposed", null);
    assert.deepEqual(v.stages.map((s) => s.label), CATALOG_LABELS);
    assert.deepEqual(v.stages.map((s) => s.actor), CATALOG_ACTORS);
  });
});

describe("deriveJourney — 다음 라벨", () => {
  it("nextLabel = stages[currentIndex+1].label (진행 중 넷은 next가 항상 존재)", () => {
    for (const [status, validation, expectedIndex] of PROGRESS_CASES) {
      const v = deriveJourney(status, validation);
      assert.equal(v.nextLabel, v.stages[expectedIndex + 1].label);
      assert.notEqual(v.nextLabel, null);
    }
  });
});

describe("deriveJourney — 대기 낱말 매핑", () => {
  it("user→Your turn, verifier→Verifying, agent→In progress", () => {
    assert.equal(deriveJourney("proposed", null).waitingLabel, "Your turn");
    assert.equal(deriveJourney("in_review", null).waitingLabel, "Verifying");
    assert.equal(deriveJourney("planning", null).waitingLabel, "In progress");
  });
});
