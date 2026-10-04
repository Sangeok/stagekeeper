import assert from "node:assert/strict";
import { it } from "node:test";
import { STATUS_LABEL, statusLabel } from "./status-label";

it("preserves known labels and null while unknown and inherited keys remain strings", () => {
  for (const [key, label] of Object.entries(STATUS_LABEL)) assert.equal(statusLabel(key), label);
  assert.equal(statusLabel(null), "Not on board");
  for (const key of ["constructor", "toString", "__proto__", "unknown", ""]) assert.equal(statusLabel(key), key);
});
