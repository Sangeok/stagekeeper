import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProjectBoardPage } from "./project-board-page.tsx";
import { buildBriefing } from "../model/briefing.ts";
import { BOARD, ROSTER, TODAY, row } from "../model/briefing.fixture.mjs";
import { NODE_KINDS } from "@harness/core/pipeline.mjs";

const renderBoard = (rows = BOARD, roster = ROSTER) =>
  renderToStaticMarkup(createElement(ProjectBoardPage, {
    slug: "sample", briefing: buildBriefing(rows, TODAY, roster, NODE_KINDS),
  }));

const activityLinks = (html) => Array.from(
  html.matchAll(/<a\b[^>]*href="(\/p\/sample\/items\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g),
  ([, href, body]) => ({ href, body }),
);

describe("ProjectBoardPage", () => {
  it("renders the model order, item links, separate keys and status labels", () => {
    const links = activityLinks(renderBoard());
    assert.deepEqual(links.map((link) => link.href),
      ["FEAT-05", "FEAT-04", "FEAT-01", "FEAT-06", "FEAT-07", "FEAT-02", "FEAT-03"].map((key) => "/p/sample/items/" + key));
    assert.match(links[0].body, />FEAT-05<\/span>waiting for a plan request · 1 day/);
    assert.match(links[1].body, />In review<\/span>/);
    assert.match(links[5].body, />Done<\/span>/);
  });

  it("keeps active rows dark and done or held rows quiet", () => {
    const links = activityLinks(renderBoard());
    assert.match(links[3].body, /<span class="text-sm">/);
    assert.match(links[5].body, /<span class="text-sm text-quiet">/);
    assert.match(links[6].body, /<span class="text-sm text-quiet">/);
  });

  it("shows the over-budget badge and tooltip only for an over-budget row", () => {
    const links = activityLinks(renderBoard());
    assert.doesNotMatch(links[0].body, /Over 150 characters/);
    assert.match(links[2].body, /Over 150 characters/);
    assert.match(links[2].body, /title="This summary is over 150 characters. Move the details to docs\/agents\/."/);
  });

  it("preserves a key written inside result text and the empty-summary display", () => {
    const links = activityLinks(renderBoard([
      row({ key: "K-1", status: "done", results: ["K-1 · Updated board.ts. More."] }),
      row({ key: "E-1", status: "done", reason: "" }),
    ]));
    assert.match(links[0].body, />K-1<\/span>K-1 · Updated board.ts\./);
    assert.match(links[1].body, />E-1<\/span>E-1/);
  });

  it("renders Team handles and their states in the model order", () => {
    const html = renderBoard();
    const handles = Array.from(html.matchAll(/<b\b[^>]*>([^<]+)<\/b>/g), ([, handle]) => handle);
    assert.deepEqual(handles, ["pm", ...ROSTER, "plan-verifier", "doc-auditor", "feature-scout"]);
    assert.match(html, /web-dev<\/b>Working on FEAT-07/);
    // BOARD의 in_review 항목은 게이트 2에 서 있다 — 검증자는 끝났다.
    assert.match(html, /plan-verifier<\/b>Idle/);
  });

  it("keeps the empty Activity message and fixed Team roles", () => {
    const html = renderBoard([], []);
    assert.match(html, />Activity<\/h2>/);
    assert.match(html, /No activity yet\./);
    assert.match(html, />Team<\/h2>/);
    assert.match(html, /pm<\/b>No new proposals/);
  });
});
