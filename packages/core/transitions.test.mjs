import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDiscard, canPropose, canRecordValidation, checkText, findRule, isOpen, STATUSES } from "./transitions.mjs";

describe("transitions", () => {
  it("gates are human-only", () => {
    assert.equal(findRule("human", "승인대기", "계획지시").kind, "gate");
    assert.equal(findRule("human", "검토대기", "구현승인").kind, "gate");
    assert.equal(findRule("agent", "승인대기", "계획지시"), null);
    assert.equal(findRule("agent", "검토대기", "구현승인"), null);
  });
  it("agent transitions and their prerequisites", () => {
    const plan = findRule("agent", "계획지시", "검토대기");
    assert.equal(plan.kind, "plan"); assert.equal(plan.requiresPlan, true);
    const done = findRule("agent", "구현승인", "완료");
    assert.equal(done.kind, "done"); assert.equal(done.requiresResult, true); assert.equal(done.requiresReport, true);
    assert.equal(findRule("agent", "계획지시", "보류").requiresResult, true);
    assert.equal(findRule("agent", "구현승인", "보류").requiresResult, true);
    assert.equal(findRule("human", "구현승인", "완료"), null); // 완료는 검증을 거친 에이전트만
  });
  it("human rejects: bounce clears validation, hold needs result, resume", () => {
    const bounce = findRule("human", "검토대기", "계획지시");
    assert.equal(bounce.kind, "bounce"); assert.equal(bounce.clearsValidation, true);
    assert.equal(findRule("human", "승인대기", "보류").requiresResult, true);
    assert.equal(findRule("human", "검토대기", "보류").requiresResult, true);
    assert.equal(findRule("human", "보류", "계획지시").clearsValidation, true);
    assert.equal(findRule("human", "보류", "구현승인").kind, "resume");
    assert.equal(findRule("human", "승인대기", "계획지시").clearsValidation, undefined);
  });
  it("nothing leaves 완료; unknown statuses rejected", () => {
    for (const s of STATUSES) assert.equal(findRule("human", "완료", s), null);
    assert.equal(findRule("human", "__proto__", "계획지시"), null);
    assert.equal(findRule("agent", "계획지시", "toString"), null);
  });
  it("discard only from 승인대기/검토대기", () => {
    assert.equal(canDiscard("승인대기"), true); assert.equal(canDiscard("검토대기"), true);
    assert.equal(canDiscard("구현승인"), false); assert.equal(canDiscard("보류"), false);
  });
  it("open = not 완료/보류; propose cap 2; validation only in 검토대기", () => {
    assert.equal(isOpen("승인대기"), true); assert.equal(isOpen("완료"), false); assert.equal(isOpen("보류"), false);
    assert.equal(canPropose(0), true); assert.equal(canPropose(1), true); assert.equal(canPropose(2), false);
    assert.equal(canRecordValidation("검토대기"), true); assert.equal(canRecordValidation("구현승인"), false);
  });
  it("150-char fields", () => {
    assert.equal(checkText("reason", "x".repeat(150)), null);
    assert.match(checkText("reason", "x".repeat(151)), /150/);
    assert.match(checkText("result", ""), /비어/);
  });
});
