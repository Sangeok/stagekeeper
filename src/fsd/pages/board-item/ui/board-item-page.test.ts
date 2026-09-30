import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { DOC_LINK_NOTE } from "@/fsd/entities/board-item";
import { toItemDocs } from "../model/item-docs";
import { BoardItemPage, type BoardItemView } from "./board-item-page";

const at = new Date("2026-09-30T01:49:00.000Z");
const repo = { owner: "owner", repo: "repo", branch: "main" };
const reports = [{ id: "r1", at, actor: "main-loop", path: "docs/acceptance.md", commit: "abcdef123", isAcceptance: true, acceptedAt: at }];
const item: BoardItemView = {
  key: "K-1", title: "Keep every round", area: "web", agent: "dev", status: "done", reason: "Traceable decisions",
  results: ["Implemented"], validation: null, proposedOn: at, acceptedAt: at, updatedAt: at.toISOString(), repo, reports,
  events: [{ id: "e1", at: new Date(at.getTime() - 1), actor: "pipeline", channel: null, from: "implementing", to: "done", note: null },
    { id: "e2", at, actor: "agent", channel: null, from: "done", to: "done", note: "report" }],
  docs: toItemDocs({ planPath: "docs/plan.md", planCommit: "plan123", acceptedAt: at, reports }, repo), historyTruncated: true,
};
const noop = () => {};
const router = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, bfcacheId: "test" };
const render = (patch: Partial<BoardItemView> = {}, canWrite = true) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
  createElement(BoardItemPage, { item: { ...item, ...patch }, canWrite, transition: async () => ({ success: true as const, data: undefined }) })));

it("preserves Documents, reopen and UTC header while replacing only History", () => {
  const html = render();
  assert.match(html, /Proposed 2026-09-30 01:49/);
  assert.match(html, /Accepted 2026-09-30 01:49/);
  assert.match(html, /Not verified/);
  assert.match(html, /href="https:\/\/github.com\/owner\/repo\/blob\/plan123\/docs\/plan.md"/);
  assert.match(html, /Reopen implementation/);
  assert.match(html, /Reopen planning instead/);
  const documents = html.indexOf(">Documents<");
  const reopen = html.indexOf(">Reopen<");
  const history = html.indexOf(">History<");
  assert.ok(documents > 0 && reopen > documents && history > reopen);
  assert.equal(html.split(DOC_LINK_NOTE).length - 1, 1);
  const timeline = html.slice(history);
  assert.ok(timeline.indexOf("implementing → done") < timeline.indexOf("Acceptance record"));
  assert.match(timeline, /pipeline · auto/);
  assert.ok(!timeline.includes("done → done"));
  assert.ok(!timeline.includes("/items/K-1"));
  assert.match(timeline, /History older than 30 days opens on Pro\./);
});

it("preserves read-only and non-done reopen restrictions and optional sections", () => {
  assert.ok(!render({}, false).includes("Reopen implementation"));
  const html = render({ status: "planning", acceptedAt: null, docs: [], reports: [], historyTruncated: false });
  assert.ok(!html.includes(">Documents<"));
  assert.ok(!html.includes("Reopen implementation"));
  assert.ok(!html.includes("Accepted 2026"));
  assert.ok(!html.includes(DOC_LINK_NOTE));
  assert.ok(!html.includes("History older than 30 days"));
});
