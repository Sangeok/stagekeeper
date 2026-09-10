import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProjectBoardPage } from "../ui/project-board-page.tsx";
import { buildBriefing, firstSentence } from "./briefing.ts";
import { NODE_KINDS, defaultGraph } from "@harness/core/pipeline.mjs";

const ROSTER = ["web-dev", "admin-dev", "backend-dev"];
const TODAY = new Date("2026-08-15T00:01:00Z");

const row = ({ key = "X-0", ...fields } = {}) => ({
  agent: "web-dev",
  status: "proposed",
  reason: "Observed evidence.",
  results: [],
  proposedOn: new Date("2026-08-14T23:59:00Z"),
  backlogItem: { key },
  // 기본 그래프에서 그 상태가 서는 자리 — 게이트 여부는 상태 기계가 아니라 런의 커서가 말한다(§E.4).
  gate: { proposed: "before-plan", in_review: "before-implement" }[fields.status ?? "proposed"] ?? null,
  // 기본은 "세션이 그 일을 돌리고 있다" — 디스패치 전 상태는 그 자리에서 따로 세운다.
  dispatched: true,
  ...fields,
});

// latestBoard가 반환하는 순서와 형태: 항목별 최신 행 하나, proposedOn 내림차순.
const BOARD = [
  row({ key: "FEAT-05", status: "proposed", reason: "pm picked it today." }),
  row({ key: "FEAT-04", status: "in_review", agent: "admin-dev", results: ["Draft plan done."] }),
  row({ key: "FEAT-06", status: "planning", agent: "admin-dev" }),
  row({ key: "FEAT-07", status: "implementing" }),
  row({ key: "FEAT-02", status: "done", results: ["Shipped the fix. Verified in prod."] }),
  row({ key: "FEAT-03", status: "on_hold", agent: "backend-dev", results: ["Owner decision — waiting on the API."] }),
  row({ key: "FEAT-01", status: "proposed", agent: "backend-dev", reason: "x".repeat(151), proposedOn: new Date("2026-08-02T12:00:00Z") }),
];

describe("firstSentence", () => {
  it("cuts at the first terminator followed by space or end", () => {
    assert.equal(firstSentence("Shipped the fix. Verified in prod."), "Shipped the fix.");
    assert.equal(firstSentence("Really? Yes."), "Really?");
  });
  it("ignores a period inside a token like board.ts", () => {
    assert.equal(firstSentence("Touched board.ts and nothing else. Done."), "Touched board.ts and nothing else.");
  });
  it("returns the whole string when there is no terminator", () => {
    assert.equal(firstSentence("no terminator here"), "no terminator here");
  });
  it("returns empty string for empty input", () => assert.equal(firstSentence("   "), ""));
});

describe("buildBriefing", () => {
  it("puts gate items first while preserving server order within each group", () => {
    const briefing = buildBriefing(BOARD, TODAY, ROSTER, NODE_KINDS);
    assert.deepEqual(briefing.activity.map((item) => item.key),
      ["FEAT-05", "FEAT-04", "FEAT-01", "FEAT-06", "FEAT-07", "FEAT-02", "FEAT-03"]);
  });

  it("preserves tied-date order and chooses the first matching team item", () => {
    const rows = [
      row({ key: "W-2", status: "planning" }),
      row({ key: "W-1", status: "implementing" }),
      row({ key: "R-2", status: "in_review", agent: "admin-dev" }),
      row({ key: "R-1", status: "in_review", agent: "admin-dev" }),
    ];
    const briefing = buildBriefing(rows, TODAY, ROSTER, NODE_KINDS);
    assert.deepEqual(briefing.activity.map((item) => item.key), ["R-2", "R-1", "W-2", "W-1"]);
    assert.equal(briefing.team.find((member) => member.agent === "web-dev").state, "Working on W-2");
    assert.equal(briefing.team.find((member) => member.agent === "plan-verifier").state, "Verifying R-2");
  });

  it("keeps the six status lines and tones with the key separate from the body", () => {
    const briefing = buildBriefing(BOARD, TODAY, ROSTER, NODE_KINDS);
    assert.deepEqual(briefing.activity.map(({ key, line, tone }) => ({ key, line, tone })), [
      { key: "FEAT-05", line: "waiting for a plan request · 1 day", tone: "pending" },
      { key: "FEAT-04", line: "plan submitted · in review for 1 day", tone: "pending" },
      { key: "FEAT-01", line: "waiting for a plan request · 13 days", tone: "pending" },
      { key: "FEAT-06", line: "writing the plan", tone: "active" },
      { key: "FEAT-07", line: "implementing", tone: "active" },
      { key: "FEAT-02", line: "Shipped the fix.", tone: "done" },
      { key: "FEAT-03", line: "Owner decision — waiting on the API.", tone: "hold" },
    ]);
  });

  for (const [label, proposedOn, proposedLine, reviewLine] of [
    ["UTC midnight crossing", "2026-08-14T23:59:00Z", "waiting for a plan request · 1 day", "plan submitted · in review for 1 day"],
    ["same UTC date", "2026-08-15T00:00:00Z", "waiting for a plan request", "plan submitted · in review"],
    ["future date", "2026-08-16T00:00:00Z", "waiting for a plan request", "plan submitted · in review"],
    ["multiple UTC days", "2026-08-02T12:00:00Z", "waiting for a plan request · 13 days", "plan submitted · in review for 13 days"],
  ]) {
    it("formats gate day tags for " + label, () => {
      const briefing = buildBriefing([
        row({ key: "P-1", status: "proposed", proposedOn: new Date(proposedOn) }),
        row({ key: "R-1", status: "in_review", proposedOn: new Date(proposedOn) }),
      ], TODAY, ROSTER, NODE_KINDS);
      assert.deepEqual(briefing.activity.map((item) => item.line), [proposedLine, reviewLine]);
    });
  }

  it("joins results in recorded order before extracting the first sentence", () => {
    const briefing = buildBriefing([
      row({ status: "done", reason: "Unused reason.", results: ["First part", "second part. Later."] }),
    ], TODAY, ROSTER, NODE_KINDS);
    assert.equal(briefing.activity[0].line, "First part second part.");
  });

  it("uses the reason when results are empty, including unknown status strings", () => {
    const briefing = buildBriefing(["done", "on_hold", "unknown"].map((status) =>
      row({ key: status, status, reason: "Reason first. Later." }),
    ), TODAY, ROSTER, NODE_KINDS);
    assert.deepEqual(briefing.activity.map(({ line, tone }) => ({ line, tone })), [
      { line: "Reason first.", tone: "done" },
      { line: "Reason first.", tone: "hold" },
      { line: "Reason first.", tone: "muted" },
    ]);
  });

  it("retains the key as the body for an empty summary without falling back to another source", () => {
    const briefing = buildBriefing([
      row({ key: "D-1", status: "done", reason: "" }),
      row({ key: "H-1", status: "on_hold", results: ["   "] }),
    ], TODAY, ROSTER, NODE_KINDS);
    assert.deepEqual(briefing.activity.map((item) => item.line), ["D-1", "H-1"]);
  });

  for (const [label, fields, expected] of [
    ["150-character reason", { reason: "x".repeat(150) }, false],
    ["151-character reason", { reason: "x".repeat(151) }, true],
    ["151-character result", { results: ["x".repeat(151)] }, true],
    ["two 100-character results", { results: ["x".repeat(100), "y".repeat(100)] }, false],
    ["long source after a short first sentence", { results: ["Done. " + "x".repeat(150)] }, true],
  ]) {
    it("checks the original per-field budget for " + label, () => {
      const briefing = buildBriefing([row({ status: "done", ...fields })], TODAY, ROSTER, NODE_KINDS);
      assert.equal(briefing.activity[0].overBudget, expected);
    });
  }

  it("derives the fixed and workspace team order with current state wording", () => {
    assert.deepEqual(buildBriefing(BOARD, TODAY, ROSTER, NODE_KINDS).team, [
      { agent: "pm", state: "2 awaiting your approval" },
      { agent: "web-dev", state: "Working on FEAT-07" },
      { agent: "admin-dev", state: "Awaiting review" },
      { agent: "backend-dev", state: "On hold" },
      { agent: "plan-verifier", state: "Verifying FEAT-04" },
      { agent: "doc-auditor", state: "Idle" },
      { agent: "feature-scout", state: "Idle" },
    ]);
  });

  it("lists only the agents the current graph dispatches, in graph order", () => {
    // Free 기본 그래프에는 verify·doc-audit이 없다 — plan-verifier·doc-auditor·feature-scout가 빠진다.
    assert.deepEqual(
      buildBriefing(BOARD, TODAY, ROSTER, defaultGraph("free").nodes).team.map((m) => m.agent),
      ["pm", ...ROSTER],
    );
    // propose 노드가 없으면 pm도 빠지고, 꼬리에 doc-audit만 있으면 doc-auditor만 붙는다.
    assert.deepEqual(
      buildBriefing(BOARD, TODAY, ROSTER, ["plan", "implement", "accept", "doc-audit"]).team.map((m) => m.agent),
      [...ROSTER, "doc-auditor"],
    );
  });

  it("prioritizes worker review, work, hold, done, then idle even when newer rows have lower priority", () => {
    const rows = [
      row({ key: "D-1", status: "done" }),
      row({ key: "H-1", status: "on_hold" }),
      row({ key: "W-1", status: "implementing" }),
      row({ key: "R-1", status: "in_review" }),
    ];
    const states = [4, 3, 2, 1, 0].map((count) =>
      buildBriefing(rows.slice(0, count), TODAY, ROSTER, NODE_KINDS).team.find((member) => member.agent === "web-dev").state,
    );
    assert.deepEqual(states, ["Awaiting review", "Working on W-1", "On hold", "Recently done", "Idle"]);
  });

  it("shows fixed idle roles for an empty board and roster", () => {
    assert.deepEqual(buildBriefing([], TODAY, [], NODE_KINDS), {
      activity: [],
      team: [
        { agent: "pm", state: "No new proposals" },
        { agent: "plan-verifier", state: "Idle" },
        { agent: "doc-auditor", state: "Idle" },
        { agent: "feature-scout", state: "Idle" },
      ],
    });
  });

  it("keeps a dynamic workspace agent's handle and work state", () => {
    const briefing = buildBriefing([row({ key: "M-1", status: "planning", agent: "mobile-dev" })], TODAY, ["mobile-dev"], NODE_KINDS);
    assert.equal(briefing.team[1].agent, "mobile-dev");
    assert.equal(briefing.team[1].state, "Working on M-1");
  });

  it("does not claim work is happening before anyone was dispatched", () => {
    // 게이트를 열자마자 status는 planning이 된다. 사람이 세션을 돌리기 전까지는
    // 아무도 계획서를 쓰고 있지 않다(실측). 보드도 배너와 같은 판정을 써야 한다.
    const rows = [row({ key: "N-1", agent: "web-dev", status: "planning", gate: null, dispatched: false })];
    const briefing = buildBriefing(rows, TODAY, ["web-dev"], NODE_KINDS);
    assert.deepEqual(briefing.activity.map(({ line, tone }) => ({ line, tone })), [{ line: "waiting for web-dev", tone: "pending" }]);
    assert.equal(briefing.team.find((t) => t.agent === "web-dev").state, "Ready for N-1");
  });

  it("says the agent is working once a run is open", () => {
    const rows = [row({ key: "N-1", agent: "web-dev", status: "planning", gate: null, dispatched: true })];
    const briefing = buildBriefing(rows, TODAY, ["web-dev"], NODE_KINDS);
    assert.deepEqual(briefing.activity.map(({ line, tone }) => ({ line, tone })), [{ line: "writing the plan", tone: "active" }]);
    assert.equal(briefing.team.find((t) => t.agent === "web-dev").state, "Working on N-1");
  });

  it("does not change rows, result arrays, dates, or the roster", () => {
    const rows = Object.freeze(BOARD.map((item) => Object.freeze({
      ...item,
      results: Object.freeze([...item.results]),
      backlogItem: Object.freeze({ ...item.backlogItem }),
    })));
    const roster = Object.freeze([...ROSTER]);
    const before = structuredClone({ rows, roster });
    buildBriefing(rows, TODAY, roster, NODE_KINDS);
    assert.deepEqual({ rows, roster }, before);
  });
});

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
    assert.match(html, /plan-verifier<\/b>Verifying FEAT-04/);
  });

  it("keeps the empty Activity message and fixed Team roles", () => {
    const html = renderBoard([], []);
    assert.match(html, />Activity<\/h2>/);
    assert.match(html, /No activity yet\./);
    assert.match(html, />Team<\/h2>/);
    assert.match(html, /pm<\/b>No new proposals/);
  });
});
