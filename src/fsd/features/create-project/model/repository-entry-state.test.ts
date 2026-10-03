import assert from "node:assert/strict";
import { it } from "node:test";
import { initialRepositoryEntry, transitionRepositoryEntry } from "./repository-entry-state";
import { selectedRepository } from "./repository-selection";

it("preserves editing and URL draft through picker selection and collapse", () => {
  const context = { defaultOwner: "me", slugTouched: false };
  let state = initialRepositoryEntry(true);
  state = transitionRepositoryEntry(state, { type: "paste", value: "https://github.com/o/original" }, context).state;
  state = transitionRepositoryEntry(state, { type: "edit" }, context).state;
  state = transitionRepositoryEntry(state, { type: "picker" }, context).state;
  assert.ok(state.editing); assert.equal(state.urlDraft, "https://github.com/o/original");
  const picked = transitionRepositoryEntry(state, { type: "pick", option: { name: "chosen", defaultBranch: "release" } }, context);
  assert.equal(picked.slug, "chosen"); assert.equal(picked.branch, "release");
  state = transitionRepositoryEntry(picked.state, { type: "edit" }, context).state;
  assert.equal(state.editing, false); assert.deepEqual(selectedRepository(state.selection), { owner: "me", repo: "chosen" });
  const manual = transitionRepositoryEntry(state, { type: "manual" }, context);
  assert.equal(manual.slug, "original"); assert.equal(manual.state.query, "");
});

it("invalid URL cannot reuse an old repository, and reset preserves entry mode", () => {
  const context = { defaultOwner: "me", slugTouched: true };
  const valid = transitionRepositoryEntry(initialRepositoryEntry(true), { type: "paste", value: "https://github.com/o/r" }, context);
  assert.equal(valid.slug, undefined);
  const invalid = transitionRepositoryEntry(valid.state, { type: "paste", value: "invalid" }, context);
  assert.equal(selectedRepository(invalid.state.selection), null);
  for (const manual of [true, false]) {
    const reset = transitionRepositoryEntry({ ...invalid.state, manual, editing: true, query: "q" }, { type: "reset" }, context);
    assert.deepEqual(reset.state, initialRepositoryEntry(manual));
    assert.equal(reset.slug, ""); assert.equal(reset.branch, "main"); assert.ok(reset.resetDetails);
  }
});
