import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideDiscard, decidePlanSubmit, decidePropose, decideReportSubmit, decideTransition, decideValidation } from "./board-rules.ts";

const base = { backlogExists: true, hasOpenRow: false, openCount: 0, roster: ["web-dev", "admin-dev"], agent: "web-dev", reason: "evidence" };
const row = (o = {}) => ({ status: "planning", planPath: null, reportCount: 0, results: [], validation: null, ...o });

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
    assert.equal(decideTransition(row({ status: "proposed" }), "agent", "planning", undefined).ok, false);
    assert.equal(decideTransition(row({ status: "in_review" }), "agent", "implementing", undefined).ok, false);
  });
  it("in_review needs plan_submit first", () => {
    assert.match(decideTransition(row(), "agent", "in_review", undefined).reason, /plan_submit/);
    assert.equal(decideTransition(row({ planPath: "docs/plans/FEAT-01.md" }), "agent", "in_review", undefined).ok, true);
  });
  it("done needs a report and a result; result accumulates; completes flag set", () => {
    const r = row({ status: "implementing", results: ["first result"] });
    assert.match(decideTransition(r, "agent", "done", "finished").reason, /report_submit/);
    const d = decideTransition({ ...r, reportCount: 1 }, "agent", "done", "finished");
    assert.equal(d.ok, true); assert.deepEqual(d.value.results, ["first result", "finished"]); assert.equal(d.value.completes, true);
    assert.match(decideTransition({ ...r, reportCount: 1 }, "agent", "done", "").reason, /empty/);
  });
  it("bounce clears validation; resume to implementing keeps it; hold needs result", () => {
    const r = row({ status: "in_review", validation: "clean pass" });
    const b = decideTransition(r, "human", "planning", undefined);
    assert.equal(b.ok, true); assert.equal(b.value.validation, null);
    assert.equal(decideTransition(r, "human", "on_hold", undefined).ok, false);
    assert.equal(decideTransition(r, "human", "on_hold", "owner decision — parked").ok, true);
    const s = decideTransition(row({ status: "on_hold", validation: "clean pass" }), "human", "implementing", undefined);
    assert.equal(s.ok, true); assert.equal(s.value.validation, "clean pass");
  });
});

describe("discard / validation / plan_submit / report_submit", () => {
  it("discard only from proposed·in_review", () => { assert.equal(decideDiscard("in_review").ok, true); assert.equal(decideDiscard("implementing").ok, false); });
  it("validation only in in_review and within 150", () => {
    assert.equal(decideValidation("in_review", "clean pass").ok, true);
    assert.equal(decideValidation("implementing", "x").ok, false);
    assert.equal(decideValidation("in_review", "x".repeat(151)).ok, false);
  });
  it("plan_submit in planning and in_review only", () => {
    // in_review 재제출 = 검증 라운드가 고친 계획서의 커밋 갱신(F3) — 승인 대상이 기록에 남는다.
    assert.equal(decidePlanSubmit("planning").ok, true);
    assert.equal(decidePlanSubmit("in_review").ok, true);
    for (const s of ["proposed", "implementing", "done", "on_hold"]) assert.equal(decidePlanSubmit(s).ok, false, s);
  });
  it("report_submit only in in_review·implementing·done", () => {
    for (const s of ["in_review", "implementing", "done"]) assert.equal(decideReportSubmit(s).ok, true, s);
    for (const s of ["proposed", "planning", "on_hold"]) assert.equal(decideReportSubmit(s).ok, false, s);
  });
});
