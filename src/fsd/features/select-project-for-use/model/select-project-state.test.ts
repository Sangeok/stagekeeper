import assert from "node:assert/strict";
import { it } from "node:test";
import { availabilityLabel, replacementSummary, selectionControlKey, selectionIsFull, type ProjectSelectionModel } from "./select-project-state";

it("names what the replaced project still has open, singular for one", () => {
  assert.equal(replacementSummary({ name: "A", openItems: 1, openRuns: 1 }), "A will no longer be selected. 1 open board item · 1 open agent run.");
  assert.equal(replacementSummary({ name: "B", openItems: 3, openRuns: 0 }), "B will no longer be selected. 3 open board items · 0 open agent runs.");
});

it("writes the availability count the way product-copy §10 does", () => {
  assert.equal(availabilityLabel({ availableCount: 1, limit: 1 }), "1 / 1 available");
  assert.equal(availabilityLabel({ availableCount: 3, limit: null }), "3 available · unlimited");
});

it("uses available count for selection capacity, and changes the key on a plan-only update", () => {
  const model: ProjectSelectionModel = { plan: "free", limit: 1, version: 7, availableCount: 1, projects: [
    { id: "a", name: "A", available: true, openItems: 0, openRuns: 0 },
    { id: "b", name: "B", available: false, openItems: 1, openRuns: 1 },
  ] };
  assert.equal(selectionIsFull(model), true);
  assert.equal(selectionIsFull({ ...model, plan: "pro", limit: 5 }), false);
  assert.equal(selectionIsFull({ ...model, plan: "max", limit: null }), false);
  assert.notEqual(selectionControlKey("b", model), selectionControlKey("b", { ...model, plan: "pro" }));
});
