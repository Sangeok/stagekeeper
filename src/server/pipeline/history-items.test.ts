import assert from "node:assert/strict";
import { it } from "node:test";
import { formatHistoryItemCursor, historyItemsQuery, parseHistoryItemCursor } from "./history-items";

it("round-trips item cursors and rejects event cursors, invalid dates and malformed identities", () => {
  const cursor = { at: new Date("2026-09-30T00:00:00.123Z"), id: "item-one_2" };
  assert.deepEqual(parseHistoryItemCursor(formatHistoryItemCursor(cursor)), cursor);
  for (const raw of [undefined, "", "invalid", "2026-09-30T00:00:00.123Z.r.c1",
    "2026-02-30T00:00:00.123Z.i.c1", "2026-09-30T00:00:00.123Z.i.", "2026-09-30T00:00:00.123Z.i.x.y"]) {
    assert.equal(parseHistoryItemCursor(raw), null);
  }
});

it("binds project/window/cursor values, groups all rounds before paging and retains NULL notes", () => {
  const since = new Date("2026-09-01T00:00:00.000Z");
  const before = { at: new Date("2026-09-30T00:00:00.000Z"), id: "untrusted' OR TRUE --" };
  const query = historyItemsQuery("owned'project", { since, before });
  assert.ok(!query.text.includes(before.id));
  assert.ok(!query.text.includes("owned'project"));
  assert.equal(query.values.filter(value => value === "owned'project").length, 4);
  assert.ok(query.values.includes(since));
  assert.ok(query.values.includes(before.at));
  assert.ok(query.values.includes(before.id));
  assert.equal(query.values.at(-1), 51);
  assert.match(query.text, /IS DISTINCT FROM 'report'/);
  assert.ok(query.text.indexOf("GROUP BY") < query.text.indexOf('WHERE (activity."at", item."id"'));
  assert.match(query.text, /UNION ALL/);
  assert.match(query.text, /JOIN LATERAL/);
  assert.ok(!query.text.includes('"discardedAt" IS NULL'));
  assert.ok(!query.text.includes('"removedAt" IS NULL'));
  assert.throws(() => historyItemsQuery("p", { since: null, before: null, limit: 0 }), RangeError);
  assert.throws(() => historyItemsQuery("p", { since: null, before: null, limit: 1.5 }), RangeError);
});
