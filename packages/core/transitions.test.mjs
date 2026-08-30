import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDiscard, canPropose, canRecordValidation, checkText, findRule, isOpen, STATUSES } from "./transitions.mjs";

describe("transitions", () => {
  it("gates are human-only", () => {
    assert.equal(findRule("human", "proposed", "planning").kind, "gate");
    assert.equal(findRule("human", "in_review", "implementing").kind, "gate");
    assert.equal(findRule("agent", "proposed", "planning"), null);
    assert.equal(findRule("agent", "in_review", "implementing"), null);
  });
  it("agent transitions and their prerequisites", () => {
    const plan = findRule("agent", "planning", "in_review");
    assert.equal(plan.kind, "plan"); assert.equal(plan.requiresPlan, true);
    const done = findRule("agent", "implementing", "done");
    assert.equal(done.kind, "done"); assert.equal(done.requiresResult, true); assert.equal(done.requiresReport, true);
    assert.equal(findRule("agent", "planning", "on_hold").requiresResult, true);
    assert.equal(findRule("agent", "implementing", "on_hold").requiresResult, true);
    assert.equal(findRule("human", "implementing", "done"), null); // done은 검증을 거친 에이전트만
  });
  it("human rejects: bounce clears validation, hold needs result, resume", () => {
    const bounce = findRule("human", "in_review", "planning");
    assert.equal(bounce.kind, "bounce"); assert.equal(bounce.clearsValidation, true);
    assert.equal(findRule("human", "proposed", "on_hold").requiresResult, true);
    assert.equal(findRule("human", "in_review", "on_hold").requiresResult, true);
    assert.equal(findRule("human", "on_hold", "planning").clearsValidation, true);
    assert.equal(findRule("human", "on_hold", "implementing").kind, "resume");
    assert.equal(findRule("human", "proposed", "planning").clearsValidation, undefined);
  });
  it("nothing leaves done; unknown statuses rejected", () => {
    for (const s of STATUSES) assert.equal(findRule("human", "done", s), null);
    assert.equal(findRule("human", "__proto__", "planning"), null);
    assert.equal(findRule("agent", "planning", "toString"), null);
    assert.equal(findRule("human", "승인대기", "planning"), null); // 옛 한글 식별자는 더 이상 상태가 아니다
  });
  it("discard only from proposed/in_review", () => {
    assert.equal(canDiscard("proposed"), true); assert.equal(canDiscard("in_review"), true);
    assert.equal(canDiscard("implementing"), false); assert.equal(canDiscard("on_hold"), false);
  });
  it("open = not done/on_hold; propose cap 2; validation only in in_review", () => {
    assert.equal(isOpen("proposed"), true); assert.equal(isOpen("done"), false); assert.equal(isOpen("on_hold"), false);
    assert.equal(canPropose(0), true); assert.equal(canPropose(1), true); assert.equal(canPropose(2), false);
    assert.equal(canRecordValidation("in_review"), true); assert.equal(canRecordValidation("implementing"), false);
  });
  it("150-char fields", () => {
    assert.equal(checkText("reason", "x".repeat(150)), null);
    assert.match(checkText("reason", "x".repeat(151)), /150/);
    assert.match(checkText("result", ""), /empty/);
  });
});
