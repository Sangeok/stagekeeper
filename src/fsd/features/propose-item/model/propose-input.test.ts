import assert from "node:assert/strict";
import { it } from "node:test";
import { proposeInputSchema } from "./propose-input";

it("propose rejects malformed transport and strips authority while preserving reason bytes", () => {
  const valid = { key: "KEY", agent: "dev", reason: " owner " };
  assert.deepEqual(proposeInputSchema.parse({ ...valid, actor: "forged", projectId: "other", userId: "other" }), valid);
  assert.ok(proposeInputSchema.safeParse({ ...valid, reason: "" }).success);
  for (const input of [null, [], 0, {}, { ...valid, key: "" }, { ...valid, key: {} }, { ...valid, agent: 0 }, { ...valid, agent: "" }, { ...valid, reason: null }, { ...valid, reason: 0 }, { ...valid, reason: undefined }]) assert.equal(proposeInputSchema.safeParse(input).success, false);
});
