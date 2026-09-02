// 탭 뱃지와 배너가 같은 수가 아니라는 사실을 고정한다.
// 뱃지는 결재함 목록과 같은 술어로 세고(on_hold 포함, product-copy.md §7),
// 배너는 on_hold를 세지 않는다(§5). 예전에는 뱃지가 배너 쪽을 따라가서
// on_hold만 남은 프로젝트가 "뱃지 0인데 카드가 보이는" 상태였다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isGateSource, needsHumanDecision, pendingInboxCount } from "./gate-source";

describe("pendingInboxCount", () => {
  it("counts the same statuses the inbox list renders", () => {
    const statuses = ["proposed", "in_review", "planning", "done"];
    assert.equal(pendingInboxCount(statuses), statuses.filter(needsHumanDecision).length);
  });

  it("counts a resumable on_hold item that never owns the banner", () => {
    // 이 한 줄이 회귀의 핵심이다 — 배너 술어(isGateSource)로 세면 0이 된다.
    assert.equal(isGateSource("on_hold"), false);
    assert.equal(needsHumanDecision("on_hold"), true);
    assert.equal(pendingInboxCount(["on_hold"]), 1);
  });

  it("is zero when nothing waits on a person", () => {
    assert.equal(pendingInboxCount(["planning", "implementing", "done"]), 0);
    assert.equal(pendingInboxCount([]), 0);
  });
});
