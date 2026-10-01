import assert from "node:assert/strict";
import { it } from "node:test";
import { historyHref, readHistoryQuery } from "./history-navigation";

it("preserves absent/legacy mode while unknown, blank and repeated modes use Items", () => {
  assert.equal(readHistoryQuery({}).mode, "items");
  for (const view of ["all", "key"]) assert.equal(readHistoryQuery({ view }).mode, "events");
  for (const mode of ["", "unknown", ["events"], ["events", "items"]]) assert.equal(readHistoryQuery({ mode, view: "all" }).mode, "items");
  assert.equal(readHistoryQuery({ mode: "events", view: ["all"] }).view, "key");
});

it("passes scalar cursor values unchanged and keeps list and expanded cursors independent", () => {
  for (const value of ["", "malformed", "a/b?c=d"]) {
    const parsed = readHistoryQuery({ before: value, item: "ITEM-01", itemBefore: "expanded" });
    assert.equal(parsed.before, value); assert.equal(parsed.itemBefore, "expanded");
    const href = historyHref("project", { ...parsed, before: parsed.before });
    const query = Object.fromEntries(new URL(href, "https://example.test").searchParams);
    assert.deepEqual(readHistoryQuery(query), { ...parsed, before: value || undefined });
  }
  assert.deepEqual(readHistoryQuery({ before: ["a", "b"], item: ["ITEM-01"], itemBefore: ["x"] }),
    { mode: "items", view: "key", before: undefined, item: undefined, itemBefore: undefined });
  const events = readHistoryQuery(Object.fromEntries(new URL(historyHref("project", { mode: "events", view: "all", before: "event" }), "https://example.test").searchParams));
  assert.deepEqual(events, { mode: "events", view: "all", before: "event", item: undefined, itemBefore: undefined });
});
