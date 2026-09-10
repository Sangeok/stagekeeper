import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAN_COUNT, PLAN_IDS, planLabel, planMatrix } from "./entitlement-copy";

describe("entitlement-copy", () => {
  it("covers every plan in LIMITS — a new plan must not silently miss the table", () => {
    assert.equal(PLAN_IDS.length, PLAN_COUNT);
    for (const row of planMatrix()) {
      for (const plan of PLAN_IDS) assert.ok(row.values[plan], `${row.label} / ${plan}`);
    }
  });
  it("renders the unlimited axes as words, not Infinity", () => {
    const rows = planMatrix();
    const text = rows.flatMap((r) => PLAN_IDS.map((p) => r.values[p])).join(" ");
    assert.doesNotMatch(text, /Infinity/);
    assert.match(text, /Unlimited/);
  });
  it("reads the numbers from LIMITS rather than repeating them", () => {
    const projects = planMatrix().find((r) => r.label === "Projects");
    assert.equal(projects?.values.free, "1");
    assert.equal(projects?.values.pro, "5");
    assert.equal(projects?.values.max, "Unlimited");
  });
  it("labels plans for people", () => {
    assert.equal(planLabel("free"), "Free");
    assert.equal(planLabel("max"), "Max");
  });
});

// 파이프라인 축 둘이 표에 줄로 선다 — 값은 LIMITS에서 읽으므로 표와 코드가 어긋날 수 없다.
describe("planMatrix — pipeline rows", () => {
  it("shows who may edit the graph", () => {
    const row = planMatrix().find((r) => r.label === "Pipeline editing");
    assert.ok(row);
    assert.deepEqual(row.values, { free: "Default only", pro: "Yes", max: "Yes" });
  });
  it("shows the dispatch cap with its window in the label", () => {
    const row = planMatrix().find((r) => r.label.startsWith("Agent dispatches per "));
    assert.ok(row, "the dispatch row is missing");
    assert.equal(row.label, "Agent dispatches per 30 days");
    assert.deepEqual(row.values, { free: "60", pro: "600", max: "Unlimited" });
  });
});
