import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRepoUrl, slugFromRepo } from "./repo-url";

describe("parseRepoUrl", () => {
  const ref = { owner: "Sangeok", repo: "harness-smoke" };

  it("accepts the forms GitHub actually hands out", () => {
    assert.deepEqual(parseRepoUrl("https://github.com/Sangeok/harness-smoke"), ref);
    assert.deepEqual(parseRepoUrl("https://github.com/Sangeok/harness-smoke.git"), ref);
    assert.deepEqual(parseRepoUrl("https://www.github.com/Sangeok/harness-smoke/"), ref);
    assert.deepEqual(parseRepoUrl("github.com/Sangeok/harness-smoke"), ref);
    assert.deepEqual(parseRepoUrl("git@github.com:Sangeok/harness-smoke.git"), ref);
    assert.deepEqual(parseRepoUrl("  https://github.com/Sangeok/harness-smoke  "), ref);
  });

  it("ignores trailing path, query and hash", () => {
    assert.deepEqual(parseRepoUrl("https://github.com/Sangeok/harness-smoke/tree/main"), ref);
    assert.deepEqual(parseRepoUrl("https://github.com/Sangeok/harness-smoke/blob/main/README.md"), ref);
    assert.deepEqual(parseRepoUrl("https://github.com/Sangeok/harness-smoke?tab=readme"), ref);
  });

  it("accepts the bare owner/repo shorthand", () => {
    assert.deepEqual(parseRepoUrl("Sangeok/harness-smoke"), ref);
  });

  it("rejects anything that is not a github repo reference", () => {
    for (const bad of ["", "   ", "Sangeok", "https://github.com/Sangeok", "https://gitlab.com/a/b", "example.com/a/b"]) {
      assert.equal(parseRepoUrl(bad), null, bad);
    }
  });
});

describe("slugFromRepo", () => {
  it("lowercases and keeps only slug characters", () => {
    assert.equal(slugFromRepo("harness-smoke"), "harness-smoke");
    assert.equal(slugFromRepo("My_Repo.Name"), "my-repo-name");
    assert.equal(slugFromRepo("--edge--"), "edge");
  });
  it("caps at the server limit of 40", () => {
    assert.equal(slugFromRepo("a".repeat(60)).length, 40);
  });
});
