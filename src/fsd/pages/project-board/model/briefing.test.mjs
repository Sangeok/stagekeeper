import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBriefing, firstSentence } from "./briefing.ts";
import { BOARD, ROSTER, TODAY, row } from "./briefing.fixture.mjs";
import { NODE_KINDS, defaultGraph } from "@harness/core/pipeline.mjs";

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
    // 둘 다 게이트 2에 서 있다 — 검증자가 할 일은 남지 않았다.
    assert.equal(briefing.team.find((member) => member.agent === "plan-verifier").state, "Idle");
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
      { agent: "plan-verifier", state: "Idle" },
      { agent: "doc-auditor", state: "Idle" },
      { agent: "feature-scout", state: "Idle" },
    ]);
  });

  // 상태만 보면 in_review인 동안 내내 "Verifying"이 된다 — 부르기 전에도, 끝나고 게이트에서
  // 기다리는 동안에도. 자리는 상태가 아니라 런의 커서가 말한다(F7 실측).
  describe("plan-verifier state follows the cursor, not the status", () => {
    const verifierOf = (rows) =>
      buildBriefing(rows, TODAY, ROSTER, NODE_KINDS).team.find((m) => m.agent === "plan-verifier").state;

    it("is ready, not verifying, before anyone dispatched it", () => {
      assert.equal(verifierOf([row({ key: "R-1", status: "in_review", node: "verify", gate: null, dispatched: false })]), "Ready for R-1");
    });

    it("is verifying only while its own run is open", () => {
      assert.equal(verifierOf([row({ key: "R-1", status: "in_review", node: "verify", gate: null, dispatched: true })]), "Verifying R-1");
    });

    it("is idle once validation moved the item to the gate", () => {
      assert.equal(verifierOf([row({ key: "R-1", status: "in_review", node: null, gate: "before-implement", dispatched: false })]), "Idle");
    });

    it("names the first item at the verify node when two are tied", () => {
      assert.equal(verifierOf([
        row({ key: "R-2", status: "in_review", node: "verify", gate: null, dispatched: true }),
        row({ key: "R-1", status: "in_review", node: "verify", gate: null, dispatched: true }),
      ]), "Verifying R-2");
    });

    it("is idle when nothing is in review", () => {
      assert.equal(verifierOf([row({ key: "D-1", status: "done", node: null, gate: null })]), "Idle");
    });
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
