import assert from "node:assert/strict";
import { it } from "node:test";
import { usageSnapshot } from "./usage-window.mjs";

const anchor = new Date("2026-10-02T09:10:00.000Z");
it("recovers exactly five hours after the first run and idle reads do not start a window", () => {
  assert.deepEqual(usageSnapshot("free", null, 0, anchor).startedAt, null);
  const before = usageSnapshot("free", anchor, 20, new Date("2026-10-02T14:09:59.999Z"));
  assert.equal(before.reached, true); assert.equal(before.percent, 100);
  const end = usageSnapshot("free", anchor, 20, new Date("2026-10-02T14:10:00.000Z"));
  assert.equal(end.used, 0); assert.equal(end.percent, 0); assert.equal(end.resetAt, null); assert.equal(end.startedAt, null);
});
it("floors percentages, clamps downgraded accounts and retains Max's counter", () => {
  assert.equal(usageSnapshot("pro", anchor, 99, anchor).percent, 99);
  assert.equal(usageSnapshot("free", anchor, 1, anchor).percent, 5);
  assert.equal(usageSnapshot("free", anchor, 99, anchor).percent, 100);
  const max = usageSnapshot("max", anchor, 999, anchor);
  assert.equal(max.used, 999); assert.equal(max.percent, null); assert.equal(max.reached, false);
  assert.equal(usageSnapshot("pro", max.startedAt, max.used, anchor).reached, true);
});
it("does not turn corrupted stored counters or clocks into zero usage", () => {
  for (const count of [-1, 1.5, NaN]) assert.throws(() => usageSnapshot("free", anchor, count, anchor));
  assert.throws(() => usageSnapshot("free", null, 1, anchor));
  assert.throws(() => usageSnapshot("free", anchor, 0, new Date(NaN)));
});
it("does not lose an integer percentage to floating-point division", () => {
  const at = new Date("2026-10-02T00:00:00Z");
  for (let count = 0; count <= 100; count++) assert.equal(usageSnapshot("pro", at, count, at).percent, count);
});
