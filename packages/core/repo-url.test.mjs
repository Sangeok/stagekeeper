import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEGMENT, parseRepoUrl } from "./repo-url.mjs";

describe("parseRepoUrl", () => {
  const expected = { owner: "Sangeok", repo: "stagekeeper" };

  it("reads the three shapes git remote actually prints", () => {
    for (const url of [
      "git@github.com:Sangeok/stagekeeper.git",
      "https://github.com/Sangeok/stagekeeper.git",
      "https://github.com/Sangeok/stagekeeper",
      "http://www.github.com/Sangeok/stagekeeper",
      "Sangeok/stagekeeper",
    ]) {
      assert.deepEqual(parseRepoUrl(url), expected, url);
    }
  });

  it("tolerates trailing slashes, query strings, and surrounding whitespace", () => {
    for (const url of [
      "  https://github.com/Sangeok/stagekeeper/  ",
      "https://github.com/Sangeok/stagekeeper?tab=readme",
      "https://github.com/Sangeok/stagekeeper/tree/dev",
      "git@github.com:Sangeok/stagekeeper.git/",
    ]) {
      assert.deepEqual(parseRepoUrl(url), expected, url);
    }
  });

  it("returns null rather than guessing", () => {
    for (const url of ["", "   ", "not a url", "https://gitlab.com/a/b", "https://github.com/onlyowner", null, undefined, 42, false, [], {}]) {
      assert.equal(parseRepoUrl(url), null, String(url));
    }
  });

  it("does not mistake a bare host path for owner/repo", () => {
    assert.equal(parseRepoUrl("example.com/thing"), null);
  });

  it("rejects names that SEGMENT forbids", () => {
    assert.equal(parseRepoUrl("git@github.com:Sangeok/bad..git"), null);
    assert.equal(SEGMENT.test("ok-name_1.x"), true);
    assert.equal(SEGMENT.test("-leading"), false);
    assert.equal(SEGMENT.test("trailing."), false);
  });
});
