import assert from "node:assert/strict";
import { it } from "node:test";

import { countNoun } from "./count-noun";

it("uses the singular only for exactly one", () => {
  assert.equal(countNoun(1, "open agent run"), "1 open agent run");
  assert.equal(countNoun(0, "open agent run"), "0 open agent runs");
  assert.equal(countNoun(3, "open board item"), "3 open board items");
});

it("takes an irregular plural when the noun needs one", () => {
  assert.equal(countNoun(1, "repository", "repositories"), "1 repository");
  assert.equal(countNoun(5, "repository", "repositories"), "5 repositories");
});
