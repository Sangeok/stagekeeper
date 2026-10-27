import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import { LIMITS, PLANS } from "@harness/core/plans/entitlement.mjs";
import { planMatrix } from "./plan-matrix";

it("keeps retired shared entitlement-copy files absent", () => {
  for (const file of ["entitlement-copy.ts", "entitlement-copy.test.ts"]) assert.equal(existsSync(new URL(`../../../shared/lib/${file}`, import.meta.url)), false);
});

describe("planMatrix", () => {
  it("covers every plan in LIMITS — a new plan must not silently miss the table", () => {
    assert.equal(PLANS.length, Object.keys(LIMITS).length);
    for (const row of planMatrix()) {
      for (const plan of PLANS) assert.ok(row.values[plan], `${row.label} / ${plan}`);
    }
  });
  it("renders the unlimited axes as words, not Infinity", () => {
    const rows = planMatrix();
    const text = rows.flatMap((r) => PLANS.map((p) => r.values[p])).join(" ");
    assert.doesNotMatch(text, /Infinity/);
    assert.match(text, /Unlimited/);
  });
  it("reads the numbers from LIMITS rather than repeating them", () => {
    const projects = planMatrix().find((r) => r.label === "Projects");
    assert.equal(projects?.values.free, "1");
    assert.equal(projects?.values.pro, "5");
    assert.equal(projects?.values.max, "Unlimited");
  });

});

describe("planMatrix — pipeline rows", () => {
  it("shows who may edit the graph", () => {
    const row = planMatrix().find((r) => r.label === "Pipeline editing");
    assert.ok(row);
    assert.deepEqual(row.values, { free: "Default only", pro: "Yes", max: "Yes" });
  });
  it("shows the dispatch cap with its window in the label", () => {
    const row = planMatrix().find((r) => r.label.startsWith("New agent runs per "));
    assert.ok(row, "the dispatch row is missing");
    assert.equal(row.label, "New agent runs per 5-hour window");
    assert.deepEqual(row.values, { free: "20", pro: "100", max: "Unlimited" });
  });
});

describe("planMatrix — background runner", () => {
  it("shows the background runner on Pro and Max only", () => {
    const row = planMatrix().find((r) => r.label === "Background runner");
    assert.ok(row, "the background runner row is missing");
    assert.deepEqual(row.values, { free: "—", pro: "Yes", max: "Yes" });
    assert.equal(planMatrix().at(-1)?.label, "Background runner");
  });
});
