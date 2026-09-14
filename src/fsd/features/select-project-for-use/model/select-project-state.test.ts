import assert from "node:assert/strict";
import { it } from "node:test";
import { selectionControlKey, selectionIsFull, type ProjectSelectionModel } from "./select-project-state";

it("uses available count for selection capacity, and changes the key on a plan-only update", () => {
  const model: ProjectSelectionModel = { plan: "free", limit: 1, version: 7, projects: [
    { id: "a", name: "A", available: true, openItems: 0, openRuns: 0 },
    { id: "b", name: "B", available: false, openItems: 1, openRuns: 1 },
  ] };
  assert.equal(selectionIsFull(model), true);
  assert.equal(selectionIsFull({ ...model, plan: "pro", limit: 5 }), false);
  assert.equal(selectionIsFull({ ...model, plan: "max", limit: null }), false);
  assert.notEqual(selectionControlKey("b", model), selectionControlKey("b", { ...model, plan: "pro" }));
});
