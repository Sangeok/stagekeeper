import assert from "node:assert/strict";
import { it } from "node:test";
import { SEGMENT } from "@harness/core/repo-url.mjs";
import { REPO_SEGMENT } from "./slug-rule";

it("the server repository segment rule matches the shared core policy", () => {
  assert.equal(REPO_SEGMENT.source, SEGMENT.source);
  assert.equal(REPO_SEGMENT.flags, SEGMENT.flags);
});
