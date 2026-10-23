import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as core from "@harness/core/project-slug.mjs";

import { RESERVED_SLUGS, SLUG_RE } from "./slug-rule";
import { SLUG_MAX, availableSlug, slugCandidate } from "./slug-rule";

it("uses the same core slug policy for registration and automatic naming", () => {
  assert.equal(SLUG_MAX, core.SLUG_MAX);
  assert.equal(SLUG_RE, core.SLUG_RE);
  assert.equal(RESERVED_SLUGS, core.RESERVED_SLUGS);
});

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

  it("reports exhaustion after all supported collision suffixes are taken", () => {
    const taken = new Set(["project", ...Array.from({ length: 998 }, (_, index) => `project-${index + 2}`)]);
    assert.throws(() => availableSlug("...", taken), /could not derive a free slug/);
  });
});
