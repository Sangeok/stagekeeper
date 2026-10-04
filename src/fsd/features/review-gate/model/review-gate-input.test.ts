import assert from "node:assert/strict";
import { it } from "node:test";
import { retryAcceptanceInputSchema, transitionInputSchema, approveGateInputSchema, discardInputSchema } from "./review-gate-input";

const base = { key: "KEY", expectedUpdatedAt: "1970-01-01T00:00:00.000Z" };
const entries = [
  [retryAcceptanceInputSchema, base], [discardInputSchema, base],
  [transitionInputSchema, { ...base, to: "on_hold", result: "" }],
  [approveGateInputSchema, { ...base, gate: "before-implement" }],
] as const;

it("all review inputs reject malformed shape/key/date without coercion", () => {
  for (const [schema, input] of entries) {
    assert.ok(schema.safeParse(input).success);
    for (const bad of [null, [], {}, 1, "payload"]) assert.equal(schema.safeParse(bad).success, false);
    for (const key of [undefined, null, 0, {}, ""]) assert.equal(schema.safeParse({ ...input, key }).success, false);
    for (const expectedUpdatedAt of [undefined, null, 0, {}, "", "invalid"]) assert.equal(schema.safeParse({ ...input, expectedUpdatedAt }).success, false);
    assert.ok(schema.safeParse({ ...input, expectedUpdatedAt: "January 1, 1970" }).success);
    const parsed = schema.parse({ ...input, actor: "forged", projectId: "other", userId: "other" });
    assert.deepEqual(parsed, input);
  }
});

it("transition and optional gate entry preserve raw strings and reject non-string members", () => {
  for (const result of [undefined, "", " unchanged "]) assert.ok(transitionInputSchema.safeParse({ ...base, to: "domain-checks-this", result }).success);
  for (const result of [null, 1, {}]) assert.equal(transitionInputSchema.safeParse({ ...base, to: "done", result }).success, false);
  for (const to of [undefined, "", null, 1]) assert.equal(transitionInputSchema.safeParse({ ...base, to }).success, false);
  const approve = { ...base, gate: "before-implement" };
  for (const gateEntry of [undefined, { runId: "run", entryId: "entry" }]) assert.ok(approveGateInputSchema.safeParse({ ...approve, gateEntry }).success);
  for (const gateEntry of [null, [], 1, {}, { runId: 1, entryId: "entry" }, { runId: "run", entryId: "" }, { runId: "run", entryId: null }]) assert.equal(approveGateInputSchema.safeParse({ ...approve, gateEntry }).success, false);
  assert.deepEqual(approveGateInputSchema.parse({ ...approve, gateEntry: { runId: "run", entryId: "entry", actor: "forged" } }).gateEntry, { runId: "run", entryId: "entry" });
});
