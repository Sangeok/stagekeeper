import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FIELD_BUDGET, isOverBudget } from "@/fsd/entities/board-item";
import { buildBriefing, daysOnBoard, firstSentence } from "./briefing.ts";
import { identityFor, initialOf } from "./known-agents.ts";

// roster = 이 프로젝트의 Workspace.agent 목록(examples/apch/harness.json 순서: web → admin → backend).
const ROSTER = ["web-dev", "admin-dev", "backend-dev"];
const TODAY = new Date(Date.UTC(2026, 7, 15)); // 2026-08-15

// 픽스처는 DB 행 → toBoardSections 가 만드는 형(BoardSection[])을 그대로 흉내 낸다.
// v1 픽스처는 ApcH 한국어 보드 마크다운이었다 — 영문 식별자 전환으로 객체 픽스처로 바꿨다.
// overBudget은 toBoardItem이 계산해 넣는 필드라 픽스처도 같은 규칙으로 채운다 — 손으로 적지 않는다.
const item = (o) => {
  const row = {
    checked: false, id: "X-0", title: "", agent: null, area: null,
    status: null, reason: null, result: null, validation: null, ...o,
  };
  return { ...row, overBudget: isOverBudget([row.reason, row.result]) };
};
const BOARD = [
  { heading: "2026-08-14", items: [
    item({ id: "FEAT-05", title: "Pick a new feature", agent: "web-dev", area: "apps/web", status: "proposed", reason: "pm picked it today.", validation: "fixture violation — must be nulled by the model" }),
    item({ id: "FEAT-04", title: "Pipeline overhaul", agent: "admin-dev", area: "apps/admin", status: "in_review", reason: "Plan is up.", result: "Draft plan done.", validation: "clean pass (2026-08-14, 1 round, no edits)" }),
    item({ id: "FEAT-06", title: "Planning-stage item", agent: "admin-dev", area: "apps/admin", status: "planning", reason: "Plan requested." }),
    item({ id: "FEAT-07", title: "Implementing-stage item", agent: "web-dev", area: "apps/web", status: "implementing", reason: "Approved." }),
    item({ id: "FEAT-02", title: "Finished item", agent: "web-dev", area: "apps/web", status: "done", checked: true, reason: "Old reason.", result: "Shipped the fix. Verified in prod." }),
    item({ id: "FEAT-03", title: "Parked item", agent: "backend-dev", area: "apps/backend", status: "on_hold", reason: "Blocked.", result: "Owner decision — waiting on the API." }),
  ] },
  { heading: "2026-08-02", items: [
    item({ id: "FEAT-01", title: "Old proposal", agent: "backend-dev", area: "apps/backend", status: "proposed", reason: "x".repeat(151) }),
    item({ id: "FEAT-02", title: "Finished item", agent: "web-dev", area: "apps/web", status: "proposed", reason: "Stale history row — must be ignored." }),
  ] },
];

describe("daysOnBoard", () => {
  it("counts UTC day difference from section date", () => {
    assert.equal(daysOnBoard("2026-08-14", TODAY), 1);
    assert.equal(daysOnBoard("2026-08-02", TODAY), 13);
    assert.equal(daysOnBoard("2026-08-15", TODAY), 0);
  });
  it("clamps future section dates to 0", () => assert.equal(daysOnBoard("2026-08-20", TODAY), 0));
  it("returns null for non-date headings", () => assert.equal(daysOnBoard("Today", TODAY), null));
});

describe("firstSentence", () => {
  it("cuts at the first terminator followed by space or end", () => {
    assert.equal(firstSentence("Shipped the fix. Verified in prod."), "Shipped the fix.");
    assert.equal(firstSentence("Really? Yes."), "Really?");
  });
  it("ignores a period inside a token like board.ts", () => {
    assert.equal(firstSentence("Touched board.ts and nothing else. Done."), "Touched board.ts and nothing else.");
  });
  it("returns the whole string when there is no terminator", () => assert.equal(firstSentence("no terminator here"), "no terminator here"));
  it("returns empty string for empty input", () => assert.equal(firstSentence("   "), ""));
});

describe("buildBriefing", () => {
  const briefing = buildBriefing(BOARD, TODAY, ROSTER);

  it("puts only proposed·in_review in the inbox, in board order", () => {
    assert.deepEqual(briefing.inbox.map((s) => s.id), ["FEAT-05", "FEAT-04", "FEAT-01"]);
  });

  it("puts the complement in the feed, preserving order", () => {
    assert.deepEqual(briefing.feed.map((s) => s.id), ["FEAT-06", "FEAT-07", "FEAT-02", "FEAT-03"]);
  });

  it("keeps only the latest row when an ID repeats across sections", () => {
    // FEAT-02는 옛 섹션에 proposed 이력 행이 있다 — 유령으로 결재 목록에 되살아나면 안 된다.
    assert.ok(!briefing.inbox.some((s) => s.id === "FEAT-02"));
    assert.equal(briefing.feed.find((s) => s.id === "FEAT-02").status, "done");
  });

  it("voices inbox items: pm for proposed, item agent for in_review, with a day tag", () => {
    const [feat05, feat04, feat01] = briefing.inbox;

    assert.equal(feat05.speaker.id, "pm");
    assert.equal(feat05.line, "FEAT-05 · waiting for a plan request · 1 day");
    assert.equal(feat05.detail, "pm picked it today.");
    assert.equal(feat05.tone, "pending");

    assert.equal(feat04.speaker.id, "admin-dev");
    assert.equal(feat04.line, "FEAT-04 · plan submitted · in review for 1 day");
    assert.equal(feat04.detail, "Draft plan done."); // result 우선

    assert.equal(feat01.speaker.id, "pm");
    assert.equal(feat01.line, "FEAT-01 · waiting for a plan request · 13 days");
  });

  it("omits the day tag on day 0 and on unreadable headings", () => {
    const today = buildBriefing([{ heading: "2026-08-15", items: [item({ id: "A-1", status: "proposed", reason: "r" }), item({ id: "A-2", agent: "web-dev", status: "in_review", reason: "r" })] }], TODAY, ROSTER);
    assert.equal(today.inbox[0].line, "A-1 · waiting for a plan request");
    assert.equal(today.inbox[1].line, "A-2 · plan submitted · in review");
    const undated = buildBriefing([{ heading: "Today", items: [item({ id: "A-1", status: "proposed", reason: "r" })] }], TODAY, ROSTER);
    assert.equal(undated.inbox[0].line, "A-1 · waiting for a plan request");
  });

  it("prefixes every feed line with its own item id", () => {
    for (const s of briefing.feed) assert.ok(s.line.startsWith(s.id), `feed line must start with ${s.id}: ${s.line}`);
  });

  it("flags board fields over the 150-char budget", () => {
    assert.equal(FIELD_BUDGET, 150);
    assert.equal(isOverBudget(["x".repeat(150)]), false);
    assert.equal(isOverBudget(["x".repeat(151)]), true);
    assert.equal(isOverBudget([null]), false);
    // 건별로 잰다 — 이어붙인 길이로 재던 시절에는 이 줄이 true였다(보드에만 있던 거짓 양성).
    assert.equal(isOverBudget(["x".repeat(100), "y".repeat(100)]), false);
    assert.equal(briefing.inbox.find((s) => s.id === "FEAT-01").overBudget, true);
    assert.equal(briefing.inbox.find((s) => s.id === "FEAT-05").overBudget, false);
  });

  it("voices feed items by status with deterministic lines and tones", () => {
    const byId = new Map(briefing.feed.map((s) => [s.id, s]));
    assert.equal(byId.get("FEAT-06").line, "FEAT-06 · writing the plan");
    assert.equal(byId.get("FEAT-06").tone, "active");
    assert.equal(byId.get("FEAT-06").detail, "Plan requested.");
    assert.equal(byId.get("FEAT-07").line, "FEAT-07 · implementing");
    assert.equal(byId.get("FEAT-07").tone, "active");
    assert.equal(byId.get("FEAT-02").line, "FEAT-02 · Shipped the fix."); // 첫 문장만
    assert.equal(byId.get("FEAT-02").tone, "done");
    assert.equal(byId.get("FEAT-02").detail, "Shipped the fix. Verified in prod.");
    assert.equal(byId.get("FEAT-03").line, "FEAT-03 · Owner decision — waiting on the API.");
    assert.equal(byId.get("FEAT-03").tone, "hold");
  });

  it("falls back to Done / On hold when there is no summary text", () => {
    const b = buildBriefing([{ heading: "2026-08-14", items: [
      item({ id: "D-1", agent: "web-dev", status: "done" }),
      item({ id: "H-1", agent: "web-dev", status: "on_hold" }),
    ] }], TODAY, ROSTER);
    assert.deepEqual(b.feed.map((s) => s.line), ["D-1 · Done", "H-1 · On hold"]);
  });

  it("derives team roster in fixed order with state per agent", () => {
    assert.deepEqual(
      briefing.team.map((m) => m.identity.id),
      ["pm", "web-dev", "admin-dev", "backend-dev", "plan-verifier", "doc-auditor", "feature-scout"],
    );
    const byId = new Map(briefing.team.map((m) => [m.identity.id, m]));
    assert.equal(byId.get("pm").state, "2 awaiting your approval");
    assert.equal(byId.get("pm").heldId, null);
    assert.equal(byId.get("pm").tone, "pending");
    // admin-dev: in_review(FEAT-04)가 최우선 — ID는 heldId로 분리, state는 짧아진다
    assert.equal(byId.get("admin-dev").state, "Awaiting review");
    assert.equal(byId.get("admin-dev").heldId, "FEAT-04");
    assert.equal(byId.get("admin-dev").tone, "pending");
    // web-dev: FEAT-07 implementing이 FEAT-02 done보다 먼저
    assert.equal(byId.get("web-dev").state, "Working on FEAT-07");
    assert.equal(byId.get("web-dev").tone, "active");
    // backend-dev: proposed는 pm 몫이고 자기 것 중 on_hold가 남는다
    assert.equal(byId.get("backend-dev").state, "On hold");
    assert.equal(byId.get("backend-dev").heldId, "FEAT-03");
    // plan-verifier: 보드 agent 필드에 없으나 in_review(FEAT-04) 존재 → Verifying, 그 계획서가 heldId
    assert.equal(byId.get("plan-verifier").state, "Verifying FEAT-04");
    assert.equal(byId.get("plan-verifier").heldId, "FEAT-04");
    assert.equal(byId.get("plan-verifier").tone, "active");
    assert.equal(byId.get("doc-auditor").state, "Idle");
    assert.equal(byId.get("doc-auditor").tone, "muted");
  });

  it("shows plan-verifier Idle·muted when no in_review item exists", () => {
    const b = buildBriefing([{ heading: "2026-08-14", items: [item({ id: "P-1", status: "planning", agent: "web-dev", reason: "r" })] }], TODAY, ROSTER);
    const verifier = b.team.find((m) => m.identity.id === "plan-verifier");
    assert.equal(verifier.state, "Idle");
    assert.equal(verifier.tone, "muted");
    assert.equal(b.team.find((m) => m.identity.id === "pm").state, "No new proposals");
    assert.equal(b.team.find((m) => m.identity.id === "web-dev").state, "Working on P-1");
  });

  it("formats today as 'Mon D' in UTC", () => {
    assert.equal(briefing.today, "Aug 15");
  });

  it("passes the validation record to in_review inbox items, null for proposed and feed", () => {
    assert.equal(briefing.inbox.find((s) => s.id === "FEAT-04").validation, "clean pass (2026-08-14, 1 round, no edits)");
    assert.equal(briefing.inbox.find((s) => s.id === "FEAT-05").validation, null); // 픽스처 값이 있어도 null
    for (const s of briefing.feed) assert.equal(s.validation, null);
  });

  it("passes null validation for an in_review item without a record", () => {
    const b = buildBriefing([{ heading: "2026-08-14", items: [item({ id: "R-1", agent: "web-dev", status: "in_review", reason: "plan only" })] }], TODAY, ROSTER);
    assert.equal(b.inbox[0].status, "in_review");
    assert.equal(b.inbox[0].validation, null);
  });

});

describe("identityFor / initialOf", () => {
  it("returns roster identity for known ids", () => {
    assert.deepEqual(identityFor("pm"), { id: "pm", handle: "pm", role: "Selection", emoji: "📋" });
    assert.equal(identityFor("admin-dev", ROSTER).emoji, "🛠️");
    assert.deepEqual(identityFor("backend-dev", ROSTER), { id: "backend-dev", handle: "backend-dev", role: "Development", emoji: "🛠️" });
    assert.deepEqual(identityFor("plan-verifier"), { id: "plan-verifier", handle: "plan-verifier", role: "Plan verification", emoji: "🔬" });
  });

  it("falls back to the raw handle with empty emoji for unknown ids", () => {
    assert.deepEqual(identityFor("scout-x"), { id: "scout-x", handle: "scout-x", role: "Agent", emoji: "" });
  });

  it("returns the system identity for null", () => {
    assert.deepEqual(identityFor(null), { id: "system", handle: "System", role: "Unassigned", emoji: "•" });
  });

  it("initials uppercase the first char, falling back to ? for blank handles", () => {
    assert.equal(initialOf({ id: "x", handle: "web-dev", role: "", emoji: "" }), "W");
    assert.equal(initialOf({ id: "x", handle: "PM", role: "", emoji: "" }), "P");
    assert.equal(initialOf({ id: "x", handle: "   ", role: "", emoji: "" }), "?");
    assert.equal(initialOf({ id: "x", handle: "", role: "", emoji: "" }), "?");
  });
});
