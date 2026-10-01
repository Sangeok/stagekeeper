import assert from "node:assert/strict";
import { it } from "node:test";
import { selectedRepository } from "./repository-selection";

it("submits only the current URL identity and drops the previous identity for blank or invalid URLs", () => {
  assert.deepEqual(selectedRepository({ source: "url", url: "https://github.com/alpha/repo-a" }), { owner: "alpha", repo: "repo-a" });
  for (const url of ["", " ", "not a URL", "https://gitlab.com/alpha/repo-a"]) assert.equal(selectedRepository({ source: "url", url }), null);
  assert.deepEqual(selectedRepository({ source: "url", url: "beta/repo-b" }), { owner: "beta", repo: "repo-b" });
});

it("picker requires a selection while direct entry requires both current fields", () => {
  assert.equal(selectedRepository({ source: "picker", repository: null }), null);
  const repository = { owner: "alpha", repo: "repo-a" };
  assert.deepEqual(selectedRepository({ source: "picker", repository }), repository);
  assert.deepEqual(selectedRepository({ source: "direct", ...repository }), repository);
  for (const [owner, repo] of [["", "repo"], ["owner", ""], [" ", "repo"]]) assert.equal(selectedRepository({ source: "direct", owner, repo }), null);
});
