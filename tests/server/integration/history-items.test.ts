import assert from "node:assert/strict";
import { it } from "node:test";
import { historyCutoff } from "../../../packages/core/entitlement.mjs";
import { createBoardService } from "../../../src/server/pipeline/board";
import type { HistoryItemCursor, HistoryItemRecord } from "../../../src/server/pipeline/history-items";
import type { HistoryCursor, HistoryRecord } from "../../../src/server/pipeline/history-page";
import { cleanup, connections, fixture, type Fixture } from "./support";

it("pages unique items by latest activity across all rounds and enforces project and plan boundaries", async (t) => {
  const pool = connections(1);
  const db = pool.all[0];
  const owned: Fixture[] = [];
  try {
    const a = await fixture(db);
    owned.push(a);
    const b = await fixture(db);
    owned.push(b);
    const board = createBoardService(db);
    const now = new Date("2026-09-30T12:00:00.000Z");
    const since = historyCutoff("free", now);
    assert.ok(since);
    const prefix = a.id.replaceAll("-", "");
    const items = Array.from({ length: 55 }, (_, index) => ({ id: `${prefix}item${String(index).padStart(3, "0")}`,
      projectId: a.projectId, key: `ITEM-${index + 2}`, title: `Work ${index}`, area: "web", source: "test" }));
    await db.backlogItem.createMany({ data: items });
    await db.boardItem.createMany({ data: items.map((item, index) => ({ id: `${item.id}round`, projectId: a.projectId,
      backlogItemId: item.id, agent: "dev", status: index % 2 ? "on_hold" : "done", reason: "test", proposedOn: now })) });
    await db.transitionEvent.createMany({ data: items.map(item => ({ boardItemId: `${item.id}round`, actor: "human", to: "done", at: now })) });
    await db.backlogItem.update({ where: { id: items[0].id }, data: { removedAt: now, removedReason: "done" } });
    await db.boardItem.update({ where: { id: a.boardItemId }, data: { proposedOn: now } });
    const previous = await db.boardItem.create({ data: { projectId: a.projectId, backlogItemId: a.backlogItemId,
      agent: "dev", status: "done", reason: "past round", proposedOn: new Date(now.getTime() - 1000) } });
    const discarded = await db.boardItem.create({ data: { projectId: a.projectId, backlogItemId: a.backlogItemId,
      agent: "dev", status: "planning", reason: "discarded", proposedOn: new Date(now.getTime() + 1000), discardedAt: now } });
    await db.transitionEvent.createMany({ data: Array.from({ length: 120 }, (_, index) => ({
      boardItemId: a.boardItemId, actor: "agent", to: "planning", at: new Date(now.getTime() + 2000 - index),
    })) });
    await db.transitionEvent.createMany({ data: [previous.id, discarded.id].map(boardItemId => ({ boardItemId, actor: "human", to: "done", at: now })) });
    await db.transitionEvent.create({ data: { boardItemId: a.boardItemId, actor: "human", note: "report", to: "done", at: new Date(now.getTime() + 9999) } });
    await db.transitionEvent.create({ data: { boardItemId: b.boardItemId, actor: "human", to: "done", at: new Date(now.getTime() + 3000) } });

    const collectItems = async (cutoff: Date | null) => {
      const rows: HistoryItemRecord[] = [];
      let before: HistoryItemCursor | null = null;
      do {
        const page = await board.projectHistoryItems(a.projectId, { since: cutoff, before });
        assert.ok(page.rows.length <= 50);
        rows.push(...page.rows);
        before = page.next;
        assert.ok(rows.length < 100, "pagination must terminate");
      } while (before);
      return rows;
    };
    await t.test("many events occupy one item row; equal-time items traverse all pages exactly once", async () => {
      const rows = await collectItems(null);
      const expected = [a.backlogItemId, ...items.map(item => item.id).sort().reverse()];
      assert.deepEqual(rows.map(row => row.id), expected);
      assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
      assert.equal(rows[0].at.getTime(), now.getTime() + 2000);
      assert.equal(rows[0].status, "planning");
      assert.ok(rows[0].discardedAt);
      assert.ok(rows.some(row => row.id === items[0].id));
      assert.ok(rows.some(row => row.status === "on_hold"));
      assert.ok(rows.every(row => row.id !== b.backlogItemId));
    });

    await t.test("expanded history retains past/discarded rounds and stays within the selected key and project", async () => {
      const rows: HistoryRecord[] = [];
      let before: HistoryCursor | null = null;
      do {
        const page = await board.projectHistory(a.projectId, { key: a.key, view: "all", since, before });
        rows.push(...page.rows);
        before = page.next;
        assert.ok(rows.length < 200);
      } while (before);
      assert.equal(rows.length, 122);
      assert.ok(rows.some(row => row.boardItemId === previous.id));
      assert.ok(rows.some(row => row.boardItemId === discarded.id));
      assert.ok(rows.every(row => row.key === a.key && row.boardItemId !== b.boardItemId));
      assert.equal(new Set(rows.map(row => row.source + row.id)).size, rows.length);
    });

    const addItem = async (suffix: string, at: Date, report: boolean) => {
      const item = await db.backlogItem.create({ data: { projectId: a.projectId, key: suffix, title: suffix, area: "web", source: "test" } });
      const round = await db.boardItem.create({ data: { projectId: a.projectId, backlogItemId: item.id, agent: "dev", status: "done", reason: "test", proposedOn: at } });
      if (report) await db.report.create({ data: { boardItemId: round.id, actor: "dev", path: "docs/report.md", commit: "abc123", at } });
      else await db.transitionEvent.create({ data: { boardItemId: round.id, actor: "agent", to: "planning", at } });
      return item;
    };
    const old = await addItem("OLD", new Date(since.getTime() - 1), false);
    const boundary = await addItem("BOUNDARY", since, true);
    const reportOnly = await addItem("REPORT", new Date(now.getTime() + 500), true);
    const empty = await db.backlogItem.create({ data: { projectId: a.projectId, key: "EMPTY", title: "No board history", area: "web", source: "test" } });
    await t.test("report-only and cutoff-boundary items appear; out-of-window and activity-free items do not", async () => {
      for (const plan of ["free", "pro", "max"] as const) {
        const rows = await collectItems(historyCutoff(plan, now));
        assert.equal(rows.some(row => row.id === old.id), plan !== "free");
        assert.ok(rows.some(row => row.id === boundary.id));
        assert.ok(rows.some(row => row.id === reportOnly.id));
        assert.ok(!rows.some(row => row.id === empty.id));
      }
      const page = await board.projectHistoryItems(a.projectId, { since, before: { at: since, id: "anotherprojectsitem" } });
      assert.ok(page.rows.every(row => row.at >= since && row.id !== old.id && row.id !== b.backlogItemId));
      assert.equal(await board.hasProjectHistoryBefore(a.projectId, "all", since), true);
    });
  } finally {
    try {
      const results = await Promise.allSettled(owned.map(record => cleanup(db, record.userId)));
      if (results.some(result => result.status === "rejected")) throw new Error("Item-history fixture cleanup failed.");
    } finally { await pool.disconnect(); }
  }
});
