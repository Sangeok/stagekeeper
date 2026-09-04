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
