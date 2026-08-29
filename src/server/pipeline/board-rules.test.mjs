import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideDiscard, decidePlanSubmit, decidePropose, decideTransition, decideValidation } from "./board-rules.ts";

const base = { backlogExists: true, hasOpenRow: false, openCount: 0, roster: ["web-dev", "admin-dev"], agent: "web-dev", reason: "근거" };
const row = (o = {}) => ({ status: "계획지시", planPath: null, reportCount: 0, results: [], validation: null, ...o });

describe("decidePropose", () => {
  it("rejects when 2 items are open", () => assert.match(decidePropose({ ...base, openCount: 2 }).reason, /max 2/));
  it("rejects agent outside roster", () => assert.match(decidePropose({ ...base, agent: "ops" }).reason, /roster/));
  it("rejects reason over 150 chars", () => assert.match(decidePropose({ ...base, reason: "x".repeat(151) }).reason, /150/));
  it("rejects an already-open key and a removed backlog item", () => {
    assert.equal(decidePropose({ ...base, hasOpenRow: true }).ok, false);
    assert.equal(decidePropose({ ...base, backlogExists: false }).ok, false);
  });
  it("accepts otherwise", () => assert.equal(decidePropose(base).ok, true));
});

describe("decideTransition", () => {
  it("agent cannot open gates", () => {
    assert.equal(decideTransition(row({ status: "승인대기" }), "agent", "계획지시", undefined).ok, false);
    assert.equal(decideTransition(row({ status: "검토대기" }), "agent", "구현승인", undefined).ok, false);
  });
  it("검토대기 needs plan_submit first", () => {
    assert.match(decideTransition(row(), "agent", "검토대기", undefined).reason, /plan_submit/);
    assert.equal(decideTransition(row({ planPath: "docs/plans/FEAT-01.md" }), "agent", "검토대기", undefined).ok, true);
  });
  it("완료 needs a report and a result; result accumulates; completes flag set", () => {
    const r = row({ status: "구현승인", results: ["첫 결과"] });
    assert.match(decideTransition(r, "agent", "완료", "끝").reason, /report_submit/);
    const d = decideTransition({ ...r, reportCount: 1 }, "agent", "완료", "끝");
    assert.equal(d.ok, true); assert.deepEqual(d.value.results, ["첫 결과", "끝"]); assert.equal(d.value.completes, true);
    assert.match(decideTransition({ ...r, reportCount: 1 }, "agent", "완료", "").reason, /비어/);
  });
  it("bounce clears validation; resume to 구현승인 keeps it; hold needs result", () => {
    const r = row({ status: "검토대기", validation: "클린 패스" });
    const b = decideTransition(r, "human", "계획지시", undefined);
    assert.equal(b.ok, true); assert.equal(b.value.validation, null);
    assert.equal(decideTransition(r, "human", "보류", undefined).ok, false);
    assert.equal(decideTransition(r, "human", "보류", "사용자 결정 — 대기").ok, true);
    const s = decideTransition(row({ status: "보류", validation: "클린 패스" }), "human", "구현승인", undefined);
    assert.equal(s.ok, true); assert.equal(s.value.validation, "클린 패스");
  });
});

describe("discard / validation / plan_submit", () => {
  it("discard only from 승인대기·검토대기", () => { assert.equal(decideDiscard("검토대기").ok, true); assert.equal(decideDiscard("구현승인").ok, false); });
  it("validation only in 검토대기 and within 150", () => {
    assert.equal(decideValidation("검토대기", "클린 패스").ok, true);
    assert.equal(decideValidation("구현승인", "x").ok, false);
    assert.equal(decideValidation("검토대기", "x".repeat(151)).ok, false);
  });
  it("plan_submit only in 계획지시", () => { assert.equal(decidePlanSubmit("계획지시").ok, true); assert.equal(decidePlanSubmit("승인대기").ok, false); });
});
