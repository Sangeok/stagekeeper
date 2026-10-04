import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DOC_LINK_NOTE } from "@/fsd/entities/board-item";
import { toHistoryRows } from "../model/history-row";
import { HistoryList } from "./history-list";

const at = new Date("2026-09-30T00:00:00.000Z");
const reports = ["c1", "c2"].map(id => ({ id, at, actor: "dev", commit: "abcdef123", path: "docs/r.md", acceptedAt: null,
  key: "K-1", boardItemId: id === "c1" ? "current" : "past" }));
const rows = toHistoryRows([], reports, { repo: { owner: "o", repo: "r", branch: "main" }, order: "desc",
  keyLinks: { slug: "sample", currentRounds: new Map([["K-1", "current"]]) } });

it("rendered History report anchors preserve reserved filenames and their shared note", () => {
  const path = "docs/#?% 한글.md";
  const encoded = toHistoryRows([], reports.map(report => ({ ...report, path })), { repo: { owner: "o", repo: "r", branch: "feature/branch" }, order: "desc" });
  const html = renderToStaticMarkup(createElement(HistoryList, { rows: encoded }));
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"));
  assert.equal(hrefs.length, 2);
  for (const href of hrefs) {
    const url = new URL(href);
    assert.equal(url.hash, ""); assert.equal(url.search, "");
    assert.equal(decodeURIComponent(url.pathname), `/o/r/blob/abcdef123/${path}`);
  }
  assert.equal(html.split(DOC_LINK_NOTE).length - 1, 1);
});

it("renders current-key and report links with one shared note and machine-readable UTC", () => {
  const html = renderToStaticMarkup(createElement(HistoryList, { rows }));
  assert.equal(html.split(DOC_LINK_NOTE).length - 1, 1);
  assert.equal(html.split('href="/p/sample/items/K-1"').length - 1, 1);
  assert.equal(html.split('href="https://github.com/o/r/blob/abcdef123/docs/r.md"').length - 1, 2);
  assert.equal(html.split('target="_blank" rel="noreferrer"').length - 1, 2);
  assert.match(html, /datetime="2026-09-30T00:00:00.000Z"/i);
  assert.match(html, /Implementation report/);
  assert.match(html, /abcdef1/);
});

it("does not repeat the Documents note on item detail or show it without reports", () => {
  assert.ok(!renderToStaticMarkup(createElement(HistoryList, { rows, showReportNote: false })).includes(DOC_LINK_NOTE));
  assert.ok(!renderToStaticMarkup(createElement(HistoryList, { rows: [] })).includes(DOC_LINK_NOTE));
});

it("escapes untrusted stored text rather than inserting markup", () => {
  const result = toHistoryRows([{ id: "e", at, actor: "<script>alert(1)</script>", channel: null,
    from: "<img>", to: "future", note: "<b>note</b>" }], [], { repo: { owner: "o", repo: "r", branch: "main" }, order: "asc" });
  const html = renderToStaticMarkup(createElement(HistoryList, { rows: result }));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img>"));
  assert.match(html, /&lt;script&gt;/);
});
