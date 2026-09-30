import assert from "node:assert/strict";
import { it } from "node:test";
import { toHistoryRows, type HistoryEventInput, type HistoryReportInput } from "./history-row";

const at = new Date("2026-09-30T01:49:59.123Z");
const repo = { owner: "owner", repo: "repo", branch: "main" };
const event = (patch: Partial<HistoryEventInput> = {}): HistoryEventInput => ({ id: "c1", at, actor: "agent", channel: null,
  from: "planning", to: "planning", note: null, ...patch });
const report = (patch: Partial<HistoryReportInput> = {}): HistoryReportInput => ({ id: "c1", at, actor: "dev", path: "docs/r.md",
  commit: "abcdef123456", isAcceptance: false, acceptedAt: null, ...patch });
const rows = (events: HistoryEventInput[], reports: HistoryReportInput[] = []) => toHistoryRows(events, reports, { repo, order: "desc" });

it("labels evidence and gates, retains unknown notes/statuses, and suppresses duplicate report events", () => {
  for (const [note, text] of [["plan", "Plan submitted"], ["validation", "Validation recorded"],
    ["gate:before-implement", "gate · before Implement"], ["gate:future", "gate · before future"]]) {
    const row = rows([event({ note })])[0];
    assert.equal(row.text, text);
    assert.ok(row.source === "event");
    assert.equal(row.note, null);
  }
  for (const note of ["future-evidence", null]) {
    const row = rows([event({ from: "future", to: "future", note })])[0];
    assert.equal(row.text, "future → future");
    assert.ok(row.source === "event");
    assert.equal(row.note, note);
  }
  assert.equal(rows([event({ from: null, to: "proposed" })])[0].text, "— → proposed");
  assert.equal(rows([event({ to: null, note: "discard" })])[0].text, "planning → discarded");
  assert.deepEqual(rows([event({ note: "report" })]), []);
});

it("displays stored actors, source-specific ids, UTC time, and full commit destinations", () => {
  for (const [actor, channel, label] of [["human", "web", "human"], ["human", "session", "human · session"],
    ["agent", null, "agent"], ["pipeline", null, "pipeline · auto"]] as const) {
    assert.equal(rows([event({ actor, channel })])[0].actor, label);
  }
  const result = rows([event()], [report({ actor: "workspace-dev" })]);
  assert.deepEqual(result.map(r => r.id), ["report:c1", "event:c1"]);
  assert.equal(result[0].actor, "workspace-dev");
  assert.equal(result[0].time, "2026-09-30 01:49");
  assert.ok(result[0].source === "report");
  assert.equal(result[0].commit, "abcdef1");
  assert.equal(result[0].href, "https://github.com/owner/repo/blob/abcdef123456/docs/r.md");
});

it("uses each report's own round acceptance and keeps explicit false", () => {
  const result = rows([], [report({ id: "c3", actor: "main-loop", isAcceptance: true }),
    report({ id: "c2", actor: "main-loop", isAcceptance: null, acceptedAt: at }),
    report({ id: "c1", actor: "main-loop", isAcceptance: false, acceptedAt: at })]);
  assert.deepEqual(result.map(r => r.text), ["Acceptance record", "Acceptance record", "Validation record"]);
});

it("only links the current round and never adds a key column on item detail", () => {
  const events = [event({ id: "c3", key: "K-1", boardItemId: "current" }),
    event({ id: "c2", key: "K-1", boardItemId: "previous" }), event({ id: "c1", key: "K-2", boardItemId: "discarded" })];
  const result = toHistoryRows(events, [], { repo, order: "desc", keyLinks: { slug: "sample", currentRounds: new Map([["K-1", "current"]]) } });
  assert.deepEqual(result.map(r => r.keyHref), ["/p/sample/items/K-1", null, null]);
  assert.ok(rows(events).every(r => r.key === undefined && r.keyHref === null));
});

it("sorts by time, source and ordinal id with ascending exactly the reverse, without mutating inputs", () => {
  const events = Object.freeze([event({ id: "c1" }), event({ id: "c9" }), event({ id: "c0", at: new Date(at.getTime() - 1) })]);
  const reports = Object.freeze([report({ id: "c2" }), report({ id: "c8" })]);
  const desc = toHistoryRows(events, reports, { repo, order: "desc" });
  assert.deepEqual(desc.map(r => r.id), ["report:c8", "report:c2", "event:c9", "event:c1", "event:c0"]);
  assert.deepEqual(toHistoryRows(events, reports, { repo, order: "asc" }).map(r => r.id), desc.map(r => r.id).reverse());
  assert.deepEqual(events.map(e => e.id), ["c1", "c9", "c0"]);
});
