import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyLock, lockFailure, missingUnits } from "@/fsd/shared/lib/copy-lock";
import { ProjectHistoryPage } from "./project-history-page";

const at = new Date("2026-09-30T00:00:00.123Z");
const cursor = `${at.toISOString()}.r.c1`;
const base: Extract<ComponentProps<typeof ProjectHistoryPage>, { mode: "events" }> = {
  slug: "sample", mode: "events", view: "key", events: [], reports: [], repo: { owner: "owner", repo: "repo", branch: "main" },
  currentRounds: new Map([["K-1", "current"]]), nextCursor: null, hasBefore: false, historyTruncated: false,
};
const render = (patch: Partial<typeof base> = {}) => renderToStaticMarkup(createElement(ProjectHistoryPage, { ...base, ...patch }));
const report = { id: "c1", at, actor: "dev", path: "docs/r.md", commit: "abcdef123", isAcceptance: false,
  acceptedAt: null, boardItemId: "current", key: "K-1" };

it("locks the copy across mutually exclusive states without mixing empty-state branches", () => {
  const keyEmpty = render();
  const allEmpty = render({ view: "all" });
  const middle = render({ reports: [report], nextCursor: cursor, hasBefore: true, historyTruncated: true });
  const itemCases = renderItems() + renderItems({ items: [{ ...summary, discardedAt: at }], expanded })
    + renderItems({ items: [summary], expanded: { ...expanded, reports: [], nextCursor: null } });
  const missing = missingUnits(copyLock("history-tab"), keyEmpty + allEmpty + middle + itemCases);
  assert.deepEqual(missing, [], lockFailure("history-tab", missing));
  assert.match(keyEmpty, /No key events yet\./);
  assert.match(keyEmpty, /href="\/p\/sample\/history\?mode=events&amp;view=all"[^>]*>Show all/);
  assert.ok(!keyEmpty.includes("Nothing has happened yet."));
  assert.match(allEmpty, /Nothing has happened yet\./);
  assert.ok(!allEmpty.includes("Show all"));
  assert.ok(!allEmpty.includes("No key events yet."));
  assert.ok(!middle.includes("No key events yet."));
  assert.ok(!middle.includes("Nothing has happened yet."));
});

it("preserves view only for pagination and resets before on both view links", () => {
  for (const view of ["key", "all"] as const) {
    const html = render({ view, reports: [report], nextCursor: cursor, hasBefore: true });
    const links = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)]
      .map(([, href, label]) => ({ url: new URL(href.replaceAll("&amp;", "&"), "https://example.test"), label }));
    for (const label of ["Key events", "All"]) {
      const link = links.find(link => link.label === label);
      assert.ok(link);
      assert.equal(link.url.searchParams.has("before"), false);
      assert.equal(link.url.searchParams.get("view"), label === "All" ? "all" : null);
      assert.equal(link.url.searchParams.get("mode"), "events");
    }
    const older = links.find(link => link.label === "Older →");
    const newest = links.find(link => link.label === "← Newest");
    assert.ok(older && newest);
    assert.equal(older.url.searchParams.get("before"), cursor);
    assert.equal(newest.url.searchParams.has("before"), false);
    assert.equal(older.url.searchParams.get("view"), view === "all" ? "all" : null);
    assert.equal(newest.url.searchParams.get("view"), view === "all" ? "all" : null);
    assert.match(html, /href="\/p\/sample\/items\/K-1"/);
  }
});

const summary = { id: "item1", key: "K-1", title: "Improve practice history", status: "done", discardedAt: null, at };
const itemBase: Extract<ComponentProps<typeof ProjectHistoryPage>, { mode: "items" }> = {
  slug: "sample", mode: "items", items: [], before: null, expanded: null, repo: base.repo,
  nextCursor: null, hasBefore: false, historyTruncated: false,
};
const expanded = { key: summary.key, events: [], reports: [report], currentRounds: base.currentRounds, nextCursor: cursor, hasBefore: true };
const renderItems = (patch: Partial<typeof itemBase> = {}) => renderToStaticMarkup(createElement(ProjectHistoryPage, { ...itemBase, ...patch }));

function itemLinks(html: string) {
  return [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)]
    .map(([, href, label]) => ({ url: new URL(href.replaceAll("&amp;", "&"), "https://example.test"), label }));
}

it("shows each item once with its title, latest status and UTC activity; retains discarded and held items", () => {
  const html = renderItems({ items: [summary,
    { ...summary, id: "item2", key: "K-2", title: "Discarded work", discardedAt: at },
    { ...summary, id: "item3", key: "K-3", title: "Held work", status: "on_hold" },
  ] });
  assert.equal(html.split('id="history-item-K-1"').length - 1, 1);
  assert.match(html, /Improve practice history/);
  assert.match(html, />Done</);
  assert.match(html, />Discarded</);
  assert.match(html, />On hold</);
  assert.match(html, /Last activity · 2026-09-30 00:00/);
  assert.equal(html.split('aria-expanded="false"').length - 1, 3);
  assert.ok(!html.includes("Key events"));
  assert.ok(!html.includes("Includes past and discarded rounds."));
  assert.match(renderItems(), /No item history yet\./);
});

it("expands an item's retained history and keeps list and detail cursors separate", () => {
  const before = `${at.toISOString()}.i.item9`;
  const html = renderItems({ items: [summary], before, hasBefore: true, nextCursor: before, expanded });
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-controls="history-item-K-1-events"/);
  assert.match(html, /Includes past and discarded rounds\./);
  assert.match(html, /Implementation report/);
  assert.match(html, /View current item/);
  const links = itemLinks(html);
  const olderEvents = links.find(link => link.label === "Older events →");
  const newestEvents = links.find(link => link.label === "← Newest events");
  assert.ok(olderEvents && newestEvents);
  assert.equal(olderEvents.url.searchParams.get("before"), before);
  assert.equal(olderEvents.url.searchParams.get("item"), "K-1");
  assert.equal(olderEvents.url.searchParams.get("itemBefore"), cursor);
  assert.equal(newestEvents.url.searchParams.get("before"), before);
  assert.equal(newestEvents.url.searchParams.has("itemBefore"), false);
  const olderItems = links.find(link => link.label === "Older →");
  assert.ok(olderItems);
  assert.equal(olderItems.url.searchParams.get("before"), before);
  assert.equal(olderItems.url.searchParams.has("item"), false);
  assert.equal(olderItems.url.searchParams.has("itemBefore"), false);
  const collapse = links.find(link => link.label.includes(summary.title));
  assert.ok(collapse);
  assert.equal(collapse.url.searchParams.get("before"), before);
  assert.equal(collapse.url.searchParams.has("item"), false);
  for (const label of ["Items", "Events"]) {
    const link = links.find(link => link.label === label);
    assert.ok(link);
    assert.equal(link.url.searchParams.has("before"), false);
    assert.equal(link.url.searchParams.has("itemBefore"), false);
    assert.equal(link.url.searchParams.has("item"), false);
  }
});

it("allows returning from an empty detail page and hides the current-item link when no live round exists", () => {
  const html = renderItems({ items: [summary], expanded: { ...expanded, reports: [], nextCursor: null, currentRounds: new Map() } });
  assert.match(html, /No events on this page\./);
  assert.match(html, /← Newest events/);
  assert.ok(!html.includes("View current item"));
  assert.ok(!html.includes("Older events →"));
});

it("offers Newest on an empty past page and only offers Older when next exists", () => {
  assert.ok(!render().includes("← Newest"));
  assert.ok(!render().includes("Older →"));
  const past = render({ hasBefore: true, historyTruncated: true });
  assert.match(past, /← Newest/);
  assert.ok(!past.includes("Older →"));
  assert.match(past, /History older than 30 days opens on Pro\./);
  assert.ok(!render().includes("History older than 30 days"));
});

it("renders descending mixed-source rows with only current-round key links", () => {
  const html = render({ reports: [report], events: [
    { id: "e1", at: new Date(at.getTime() - 1), actor: "human", channel: "web", from: "proposed", to: "planning", note: null, key: "K-1", boardItemId: "previous" },
  ] });
  assert.ok(html.indexOf("Implementation report") < html.indexOf("proposed → planning"));
  assert.equal(html.split('href="/p/sample/items/K-1"').length - 1, 1);
});
