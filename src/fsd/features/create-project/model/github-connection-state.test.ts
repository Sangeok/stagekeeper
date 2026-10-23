import assert from "node:assert/strict";
import { it } from "node:test";
import { authorizedRepositorySchema, combineRepositories, type AuthorizedRepository, type PublicRepository } from "./github-connection-state";
import { initialRepositoryEntry, transitionRepositoryEntry } from "./repository-entry-state";
import { selectedRepository } from "./repository-selection";

const privateRepo: AuthorizedRepository = { source: "authorized", repositoryId: "2", installationId: "9", repositoryPage: 1, owner: "org", name: "service",
  fullName: "org/service", defaultBranch: "release", visibility: "private", connectionRevision: 4 };

it("uses canonical organization identity and resets the branch only on explicit selection", () => {
  const picked = transitionRepositoryEntry(initialRepositoryEntry(false), { type: "pick", option: privateRepo }, { defaultOwner: "me", slugTouched: true });
  assert.deepEqual(selectedRepository(picked.state.selection), { owner: "org", repo: "service" });
  assert.equal(picked.slug, undefined);
  assert.equal(picked.branch, "release");
  const editing = transitionRepositoryEntry(picked.state, { type: "edit" }, { defaultOwner: "me", slugTouched: true });
  assert.equal(editing.state.selection.source, "authorized");
  assert.deepEqual(transitionRepositoryEntry(editing.state, { type: "edit" }, { defaultOwner: "me", slugTouched: true }).state.selection, picked.state.selection);
  const query = transitionRepositoryEntry(picked.state, { type: "query", value: "service" }, { defaultOwner: "me", slugTouched: true });
  assert.equal(query.branch, undefined);
  assert.deepEqual(query.state.selection, picked.state.selection);
});

it("requires branch input when linked metadata has no default and preserves manual input semantics", () => {
  const picked = transitionRepositoryEntry(initialRepositoryEntry(false), { type: "pick", option: { ...privateRepo, defaultBranch: null } }, { defaultOwner: "me", slugTouched: false });
  assert.equal(picked.branch, "");
  assert.equal(picked.state.editing, true);
  const edited = transitionRepositoryEntry(picked.state, { type: "direct", owner: "other", repo: "manual" }, { defaultOwner: "me", slugTouched: false });
  assert.deepEqual(edited.state.selection, { source: "direct", owner: "other", repo: "manual" });
});

it("deduplicates by stable ID while retaining Public behavior and distinct owners with equal names", () => {
  const publicRepo: PublicRepository = { source: "public", repositoryId: "1", owner: "me", name: "service", defaultBranch: "main" };
  const duplicate = { ...privateRepo, repositoryId: "1", owner: "me", visibility: "public" as const };
  assert.deepEqual(combineRepositories([publicRepo], [duplicate, privateRepo]), [publicRepo, privateRepo]);
  assert.equal(authorizedRepositorySchema.safeParse({ ...privateRepo, visibility: "internal" }).success, false);
});
