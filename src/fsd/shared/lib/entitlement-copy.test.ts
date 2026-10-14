import assert from "node:assert/strict";
import { it } from "node:test";
import * as copy from "./entitlement-copy";

it("keeps shared plan labels without exposing the Billing-only model", () => {
  assert.deepEqual(Object.keys(copy), ["planLabel"]);
  assert.equal(copy.planLabel("free"), "Free");
  assert.equal(copy.planLabel("pro"), "Pro");
  assert.equal(copy.planLabel("max"), "Max");
});
