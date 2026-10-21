import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESERVED_SLUGS, SLUG_RE } from "./slug-rule";
import { SLUG_MAX, availableSlug, slugCandidate } from "./slug-rule";

describe("slugCandidate", () => {
  it("passes through a name that is already a valid slug", () => {
    assert.equal(slugCandidate("stagekeeper"), "stagekeeper");
    assert.equal(slugCandidate("my-repo-2"), "my-repo-2");
  });

  it("folds case and non-slug characters into single dashes", () => {
    assert.equal(slugCandidate("StageKeeper"), "stagekeeper");
    assert.equal(slugCandidate("my_repo.name"), "my-repo-name");
    assert.equal(slugCandidate("a//b??c"), "a-b-c");
  });

  it("trims leading and trailing dashes rather than emitting an invalid slug", () => {
    assert.equal(slugCandidate("_repo_"), "repo");
    assert.equal(slugCandidate("...x-y..."), "x-y");
  });

  it("truncates to the shared maximum", () => {
    const long = "a".repeat(SLUG_MAX + 20);
    const out = slugCandidate(long);
    assert.equal(out?.length, SLUG_MAX);
    assert.match(out ?? "", SLUG_RE);
  });

  it("returns null when nothing valid survives", () => {
    assert.equal(slugCandidate(""), null);
    assert.equal(slugCandidate("..."), null);
    assert.equal(slugCandidate("a"), null);
  });

  it("returns null for a reserved slug so the caller suffixes it", () => {
    for (const reserved of RESERVED_SLUGS) assert.equal(slugCandidate(reserved), null);
  });
});

describe("availableSlug", () => {
  it("uses the plain candidate when nothing has taken it", () => {
    assert.equal(availableSlug("stagekeeper", new Set()), "stagekeeper");
  });

  it("suffixes only when the name is genuinely taken by something else", () => {
    assert.equal(availableSlug("stagekeeper", new Set(["stagekeeper"])), "stagekeeper-2");
    assert.equal(availableSlug("stagekeeper", new Set(["stagekeeper", "stagekeeper-2"])), "stagekeeper-3");
  });

  it("falls back when the repo name yields no valid candidate", () => {
    assert.equal(availableSlug("...", new Set()), "project");
    assert.equal(availableSlug("...", new Set(["project"])), "project-2");
  });

  it("keeps the suffixed slug inside the maximum and still valid", () => {
    const taken = new Set([("b".repeat(SLUG_MAX))]);
    const out = availableSlug("b".repeat(SLUG_MAX + 5), taken);
    assert.ok(out.length <= SLUG_MAX, `${out.length} > ${SLUG_MAX}`);
    assert.match(out, SLUG_RE);
    assert.ok(!taken.has(out));
  });

  it("never returns a reserved slug", () => {
    assert.ok(!RESERVED_SLUGS.has(availableSlug("new", new Set())));
  });
});
