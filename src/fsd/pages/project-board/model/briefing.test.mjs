import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildBriefing, firstSentence } from "./briefing.ts";
import { BOARD, ROSTER, TODAY, row } from "./briefing.fixture.mjs";
import { NODE_KINDS, defaultGraph } from "@harness/core/pipeline/pipeline.mjs";

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
    assert.equal(briefing.team.find((member) => member.agent === "plan-verifier").state, "Idle");
  });

  it("keeps the six status lines and tones with the key separate from the body", () => {
    const briefing = buildBriefing(BOARD, TODAY, ROSTER, NODE_KINDS);
    assert.deepEqual(briefing.activity.map(({ key, line, tone }) => ({ key, line, tone })), [
      { key: "FEAT-05", line: "waiting for a plan request · 1 day", tone: "pending" },
      { key: "FEAT-04", line: "plan submitted · proposed 1 day ago", tone: "pending" },
      { key: "FEAT-01", line: "waiting for a plan request · 13 days", tone: "pending" },
      { key: "FEAT-06", line: "writing the plan", tone: "active" },
      { key: "FEAT-07", line: "implementing", tone: "active" },
      { key: "FEAT-02", line: "Shipped the fix.", tone: "done" },
      { key: "FEAT-03", line: "Owner decision — waiting on the API.", tone: "hold" },
    ]);
  });

  for (const [label, proposedOn, proposedLine, reviewLine] of [
    ["UTC midnight crossing", "2026-08-14T23:59:00Z", "waiting for a plan request · 1 day", "plan submitted · proposed 1 day ago"],
    ["same UTC date", "2026-08-15T00:00:00Z", "waiting for a plan request", "plan submitted · in review"],
    ["future date", "2026-08-16T00:00:00Z", "waiting for a plan request", "plan submitted · in review"],
    ["multiple UTC days", "2026-08-02T12:00:00Z", "waiting for a plan request · 13 days", "plan submitted · proposed 13 days ago"],
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

  it("reports proposal age even when review started today and matches canonical copy", () => {
    const reviewEnteredAt = new Date("2026-08-15T00:00:00Z");
    const rows = [row({
      key: "FEAT-04",
      status: "in_review",
      proposedOn: new Date("2026-08-13T23:59:00Z"),
      updatedAt: reviewEnteredAt,
      transitions: [{ from: "planning", to: "in_review", at: reviewEnteredAt }],
    })];
    const line = buildBriefing(rows, TODAY, ROSTER, NODE_KINDS).activity[0].line;
    assert.equal(line, "plan submitted · proposed 2 days ago");
    const copy = readFileSync(new URL("../../../../../docs/conventions/product-copy.md", import.meta.url), "utf8");
    const section = copy.split("## 6.")[1].split("## 7.")[0];
    assert.ok(section.includes(line));
    assert.ok(!line.includes("in review for"));
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
      { agent: "impl-verifier", state: "Idle" },
      { agent: "qa-verifier", state: "Idle" },
      { agent: "doc-auditor", state: "Idle" },
      { agent: "feature-scout", state: "Idle" },
    ]);
  });

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

    it("ignores held cursors and prefers working eligible items over queued ones", () => {
      const held = row({ key: "H-1", status: "on_hold", node: "verify", gate: null, dispatched: true });
      const queued = row({ key: "Q-1", status: "in_review", node: "verify", gate: null, dispatched: false });
      const working = row({ key: "W-1", status: "in_review", node: "verify", gate: null, dispatched: true });
      assert.equal(verifierOf([held]), "Idle");
      assert.equal(verifierOf([held, queued]), "Ready for Q-1");
      assert.equal(verifierOf([held, queued, working]), "Verifying W-1");
      assert.equal(buildBriefing([held], TODAY, ROSTER, NODE_KINDS).activity[0].tone, "hold");
    });
  });

  it("lists only the agents the current graph dispatches, in graph order", () => {
    assert.deepEqual(
      buildBriefing(BOARD, TODAY, ROSTER, defaultGraph("free").nodes).team.map((m) => m.agent),
      ["pm", ...ROSTER],
    );
    assert.deepEqual(
      buildBriefing(BOARD, TODAY, ROSTER, ["propose", "plan", "implement", "accept", "doc-audit"], false).team.map((m) => m.agent),
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
        { agent: "impl-verifier", state: "Idle" },
        { agent: "qa-verifier", state: "Idle" },
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
    const rows = [row({ key: "N-1", agent: "web-dev", status: "planning", gate: null, dispatched: false })];
    const briefing = buildBriefing(rows, TODAY, ["web-dev"], NODE_KINDS);
    assert.deepEqual(briefing.activity.map(({ line, tone }) => ({ line, tone })), [{ line: "waiting for web-dev", tone: "pending" }]);
    assert.equal(briefing.team.find((t) => t.agent === "web-dev").state, "Ready for N-1");
  });

  it("shows an item-bound verifier at its own node in Activity and in its Team row", () => {
    for (const [node, agent] of [["impl-verify", "impl-verifier"], ["qa", "qa-verifier"]]) {
      for (const dispatched of [false, true]) {
        const briefing = buildBriefing([row({ key: "V-1", status: "done", node, gate: null, dispatched })], TODAY, ROSTER, NODE_KINDS);
        assert.deepEqual(briefing.activity.map(({ line, tone }) => ({ line, tone })), [{ line: `${dispatched ? "working: " : "waiting for "}${agent} · ${node}`, tone: dispatched ? "active" : "pending" }], `${node} ${dispatched}`);
        assert.equal(briefing.team.find((t) => t.agent === agent).state, `${dispatched ? "Working on" : "Ready for"} V-1`, `${node} ${dispatched}`);
      }
    }
  });

  it("says the agent is working once a run is open", () => {
    const rows = [row({ key: "N-1", agent: "web-dev", status: "planning", gate: null, dispatched: true })];
    const briefing = buildBriefing(rows, TODAY, ["web-dev"], NODE_KINDS);
    assert.deepEqual(briefing.activity.map(({ line, tone }) => ({ line, tone })), [{ line: "writing the plan", tone: "active" }]);
    assert.equal(briefing.team.find((t) => t.agent === "web-dev").state, "Working on N-1");
  });

  for (const [node, agent] of [
    ["qa", "qa-verifier"], ["impl-verify", "impl-verifier"],
    ["doc-auditor", "doc-auditor"], ["doc-auditor#2", "doc-auditor"],
    ["feature-scout", "feature-scout"], ["feature-scout#2", "feature-scout"],
  ]) {
    it(`${agent} at ${node} prefers dispatched work and preserves order within each priority`, () => {
      const member = (rows) => buildBriefing(rows, TODAY, ROSTER, [node]).team.find((m) => m.agent === agent).state;
      const makeRow = (key, dispatched, status = "done") => row({ key, status, node, gate: null, dispatched });
      const held = makeRow("H", true, "on_hold");
      const queued = makeRow("Q", false), olderQueued = makeRow("Q-old", false);
      const working = makeRow("W", true), olderWorking = makeRow("W-old", true);
      assert.equal(member([held, queued, working, olderWorking]), "Working on W");
      assert.equal(member([held, queued, olderQueued]), "Ready for Q");
      assert.equal(member([working, olderWorking]), "Working on W");
      assert.equal(member([held]), "Idle");
      assert.equal(member([]), "Idle");
    });
  }

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


describe("workspace work belongs to the current dispatcher", () => {
  for (const node of ["doc-auditor", "doc-auditor#2", "feature-scout", "feature-scout#2"]) {
    for (const dispatched of [false, true]) {
      it(`${node}, dispatched=${dispatched}, never assigns slot work to the dev`, () => {
        const nodes = ["plan", "implement", node, "accept"];
        const slot = row({ key: "S-1", status: "implementing", node, gate: null, dispatched });
        const member = (rows) => buildBriefing(rows, TODAY, ["web-dev"], nodes).team.find(m => m.agent === "web-dev").state;
        assert.equal(member([slot]), "Idle");
        assert.equal(member([slot, row({ key: "D-1", status: "planning", dispatched: true })]), "Working on D-1");
        assert.equal(member([slot, row({ key: "D-1", status: "implementing", dispatched: false })]), "Ready for D-1");
      });
    }
  }
  it("does not queue a dev at a gate or a missing cursor", () => {
    for (const gate of [null, "before-doc-auditor"]) {
      const briefing = buildBriefing([row({ status: "implementing", node: null, gate, dispatched: false })], TODAY, ["web-dev"], ["plan", "implement", "accept"]);
      assert.equal(briefing.team.find(member => member.agent === "web-dev").state, "Idle");
    }
  });
});
