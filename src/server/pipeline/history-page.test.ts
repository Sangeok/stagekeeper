import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afterCursor, eventWhere, formatHistoryCursor, mergeHistoryPage, parseHistoryCursor,
  type HistoryCursor, type HistoryEventRecord, type HistoryReportRecord } from "./history-page";

const at = new Date("2026-09-30T12:00:00.123Z");
const event = (id: string, time = at): HistoryEventRecord => ({ source: "event", id, at: time, boardItemId: "board", key: "K-1",
  actor: "human", channel: "web", from: "in_review", to: "implementing", note: null });
const report = (id: string, time = at): HistoryReportRecord => ({ source: "report", id, at: time, boardItemId: "board", key: "K-1",
  actor: "dev", path: "docs/report.md", commit: "abcdef123", isAcceptance: false, acceptedAt: null });

it("keeps NULL transitions in both views and combines key conditions with report exclusion", () => {
  const withoutReport = { OR: [{ note: null }, { note: { not: "report" } }] };
  assert.deepEqual(eventWhere("all"), withoutReport);
  assert.deepEqual(eventWhere("key"), { AND: [withoutReport, { OR: [
    { actor: "human" }, { note: "validation" }, { to: { in: ["done", "on_hold"] } },
  ] }] });
});

it("uses the four source tie-break cases without losing the older-time branch", () => {
  assert.deepEqual(afterCursor("event", null), {});
  for (const source of ["event", "report"] as const) {
    for (const cursorSource of ["event", "report"] as const) {
      const cursor = { at, source: cursorSource, id: "c2" };
      const equal = source === cursorSource ? [{ at, id: { lt: "c2" } }]
        : source === "event" ? [{ at }] : [];
      assert.deepEqual(afterCursor(source, cursor), { OR: [{ at: { lt: at } }, ...equal] });
    }
  }
});

describe("cursor parsing", () => {
  it("round-trips both sources including the ISO decimal point and an unknown valid id", () => {
    for (const source of ["event", "report"] as const) {
      const cursor = { at, source, id: "notstored123" };
      assert.deepEqual(parseHistoryCursor(formatHistoryCursor(cursor)), cursor);
    }
  });
  it("rejects malformed or normalized dates, sources, ids and trailing input", () => {
    for (const raw of [undefined, "", "garbage", `${at.toISOString()}.x.c1`, `${at.toISOString()}.r.`,
      `${at.toISOString()}.r.C1`, `${at.toISOString()}.r.c-1`, `${at.toISOString()}.r.c1.extra`,
      "2026-02-30T12:00:00.123Z.r.c1", "2026-13-01T12:00:00.123Z.e.c1",
      "2026-09-30T12:00:00Z.r.c1", "2026-09-30T12:00:00.123+00:00.r.c1",
      ` ${at.toISOString()}.r.c1`, `${at.toISOString()}.r.c1\n`]) {
      assert.equal(parseHistoryCursor(raw), null, raw);
    }
  });
});

describe("page merge", () => {
  it("merges by time and source while preserving each source's DB order without mutation", () => {
    const events = Object.freeze([event("e9"), event("e1"), event("e0", new Date(at.getTime() - 1))]);
    const reports = Object.freeze([report("r9"), report("r1")]);
    const page = mergeHistoryPage(events, reports, 3);
    assert.deepEqual(page.rows.map(r => r.id), ["r9", "r1", "e9"]);
    assert.deepEqual(page.next, { at, source: "event", id: "e9" });
    assert.deepEqual(events.map(r => r.id), ["e9", "e1", "e0"]);
  });
  for (const count of [0, 49, 50, 51]) {
    it(`sets next only beyond a full page (${count} rows, each source and combined)`, () => {
      const ids = Array.from({ length: count }, (_, i) => `c${String(count - i).padStart(3, "0")}`);
      for (const mode of ["events", "reports", "mixed"]) {
        const events = ids.filter((_, i) => mode === "events" || mode === "mixed" && i % 2 === 0).map(id => event(id));
        const reports = ids.filter((_, i) => mode === "reports" || mode === "mixed" && i % 2 !== 0).map(id => report(id));
        const page = mergeHistoryPage(events, reports, 50);
        assert.equal(page.rows.length, Math.min(count, 50));
        assert.equal(page.next !== null, count > 50);
      }
    });
  }
  it("visits every same-time id exactly once across pages and both source boundaries", () => {
    const ids = Array.from({ length: 105 }, (_, i) => `c${String(104 - i).padStart(3, "0")}`);
    const events = ids.map(id => event(id));
    const reports = ids.map(id => report(id));
    const after = (row: HistoryCursor, cursor: HistoryCursor | null) => {
      const filter = afterCursor(row.source, cursor);
      return !filter.OR || filter.OR.some(part => part.at instanceof Date
        ? row.at.getTime() === part.at.getTime() && (!("id" in part) || !part.id || row.id < part.id.lt)
        : row.at < part.at.lt);
    };
    for (const limit of [1, 2, 49, 50, 51, 105]) {
      let cursor: HistoryCursor | null = null;
      const visited: string[] = [];
      do {
        const page = mergeHistoryPage(events.filter(r => after(r, cursor)).slice(0, limit + 1),
          reports.filter(r => after(r, cursor)).slice(0, limit + 1), limit);
        visited.push(...page.rows.map(r => `${r.source}:${r.id}`));
        cursor = page.next;
        assert.ok(visited.length <= 210, "cursor must make progress");
      } while (cursor);
      assert.deepEqual(visited, [...ids.map(id => `report:${id}`), ...ids.map(id => `event:${id}`)]);
    }
  });
  it("rejects invalid internal limits", () => {
    for (const limit of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => mergeHistoryPage([], [], limit), RangeError);
  });
});
