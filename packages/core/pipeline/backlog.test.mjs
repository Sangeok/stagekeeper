import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEM_TYPES, SCOUT_ITEMS_PER_RUN, nextItemKey, toItemType } from "./backlog.mjs";

test("keys use the greatest numeric ITEM suffix without rounding or reusing old references", () => {
  assert.equal(nextItemKey([]), "ITEM-01");
  assert.equal(nextItemKey(["FEAT-05", "API-3", "ITEM-bad", "ITEM-2x"]), "ITEM-01");
  assert.equal(nextItemKey(["ITEM-99"]), "ITEM-100");
  assert.equal(nextItemKey(["ITEM-100", "ITEM-99"]), "ITEM-101");
  assert.equal(nextItemKey(["ITEM-9007199254740992"]), "ITEM-9007199254740993");
});
test("item types and scout allowance are shared policy", () => {
  assert.deepEqual(ITEM_TYPES, ["feat", "fix", "refactor", "docs"]);
  assert.equal(SCOUT_ITEMS_PER_RUN, 3);
  assert.equal(toItemType("fix"), "fix");
  for (const value of ["", "bug", null, undefined, {}, "FIX"]) assert.equal(toItemType(value), null);
});
