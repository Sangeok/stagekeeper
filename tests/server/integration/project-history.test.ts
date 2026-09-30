import assert from "node:assert/strict";
import { it } from "node:test";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { historyCutoff } from "../../../packages/core/entitlement.mjs";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { createBoardService } from "../../../src/server/pipeline/board";
import { type HistoryCursor, type HistoryRecord, type HistoryView } from "../../../src/server/pipeline/history-page";
import { toHistoryRows } from "../../../src/fsd/widgets/history-feed";
import { cleanup, connections, fixture, testDatabaseUrl, type Fixture } from "./support";

// SQL과 바인딩은 메모리에만 보관한다. 실패해도 접속 주소나 파라미터를 출력하지 않는다.
it("reads isolated project history with stable cursors, retained rounds and plan windows", async (t) => {
  const pool = connections(1);
  const db = pool.all[0];
  const owned: Fixture[] = [];
  const sql: { query: string; params: string }[] = [];
  const logged = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl() }), log: [{ emit: "event", level: "query" }] });
  logged.$on("query", event => { sql.push({ query: event.query, params: event.params }); });
  try {
    const a = await fixture(db);
    owned.push(a);
    const b = await fixture(db);
    owned.push(b);
    const notice = await fixture(db);
    owned.push(notice);
    const board = createBoardService(logged);
    const now = new Date("2026-09-30T12:00:00.000Z");
    const cutoff = historyCutoff("free", now);
    assert.ok(cutoff);
    const prefix = a.id.replaceAll("-", "");
    const ids = Array.from({ length: 55 }, (_, i) => `${prefix}c${String(54 - i).padStart(3, "0")}`);
    await db.boardItem.update({ where: { id: a.boardItemId }, data: { proposedOn: now, acceptedAt: now } });
    const previous = await db.boardItem.create({ data: { projectId: a.projectId, backlogItemId: a.backlogItemId,
      agent: "dev", status: "done", reason: "past round", proposedOn: new Date(now.getTime() - 1000) } });
    const discarded = await db.boardItem.create({ data: { projectId: a.projectId, backlogItemId: a.backlogItemId,
      agent: "dev", status: "proposed", reason: "discarded round", proposedOn: new Date(now.getTime() + 1000), discardedAt: now } });
    await db.backlogItem.update({ where: { id: a.backlogItemId }, data: { removedAt: now, removedReason: "owner" } });
    await db.transitionEvent.createMany({ data: ids.map(id => ({ id, boardItemId: a.boardItemId, at: now,
      actor: "human", from: "in_review", to: "implementing", note: null })) });
    await db.report.createMany({ data: ids.map(id => ({ id, boardItemId: a.boardItemId, at: now,
      actor: "dev", path: "docs/r.md", commit: "abcdef123", isAcceptance: false })) });
    await db.transitionEvent.create({ data: { boardItemId: b.boardItemId, at: now, actor: "human", to: "done" } });
    await db.report.create({ data: { boardItemId: b.boardItemId, at: now, actor: "other-owner", path: "private.md", commit: "other" } });

    const collect = async (projectId: string, view: HistoryView, since: Date | null) => {
      const result: HistoryRecord[] = [];
      let before: HistoryCursor | null = null;
      do {
        const page = await board.projectHistory(projectId, { view, since, before });
        assert.ok(page.rows.length <= 50);
        result.push(...page.rows);
        before = page.next;
        assert.ok(result.length < 500, "pagination must finish without duplicates");
      } while (before);
      return result;
    };

    await t.test("same-time pages match independent tuples and the widget; the other owner's rows never leak", async () => {
      for (const view of ["key", "all"] as const) {
        const rows = await collect(a.projectId, view, null);
        const expected = [...ids.map(id => `report:${id}`), ...ids.map(id => `event:${id}`)];
        assert.deepEqual(rows.map(r => `${r.source}:${r.id}`), expected);
        assert.equal(new Set(expected).size, rows.length);
        assert.ok(rows.every(r => r.boardItemId === a.boardItemId));
        const rendered = toHistoryRows(rows.filter(r => r.source === "event"), rows.filter(r => r.source === "report"), {
          repo: { owner: "fixture", repo: "repo", branch: "main" }, order: "desc",
        });
        assert.deepEqual(rendered.map(r => r.id), expected);
      }
    });

    const cases = [
      { id: "pm", actor: "agent", from: null, to: "proposed", note: null, key: false },
      { id: "plan", actor: "agent", from: "planning", to: "planning", note: "plan", key: false },
      { id: "review", actor: "agent", from: "planning", to: "in_review", note: null, key: false },
      { id: "auto", actor: "pipeline", from: "proposed", to: "planning", note: null, key: false },
      { id: "validation", actor: "agent", from: "in_review", to: "in_review", note: "validation", key: true },
      { id: "done", actor: "pipeline", from: "implementing", to: "done", note: null, key: true },
      { id: "hold", actor: "agent", from: "implementing", to: "on_hold", note: null, key: true },
      { id: "human", actor: "human", from: "planning", to: "planning", note: "gate:before-verify", key: true },
      { id: "duplicate", actor: "human", from: "done", to: "done", note: "report", key: false },
    ];
    await db.transitionEvent.createMany({ data: cases.map(record => ({
      id: prefix + record.id, actor: record.actor, from: record.from, to: record.to, note: record.note,
      at: new Date(now.getTime() - 1), boardItemId: a.boardItemId,
    })) });
    await t.test("key/all retain NULL events, apply the OR contract and exclude report events in both views", async () => {
      for (const view of ["key", "all"] as const) {
        const found = new Set((await collect(a.projectId, view, null)).map(r => r.id));
        for (const record of cases) assert.equal(found.has(prefix + record.id), record.note !== "report" && (view === "all" || record.key), record.id);
      }
    });

    await db.transitionEvent.createMany({ data: [previous, discarded].map(row => ({ boardItemId: row.id, at: now, actor: "human", to: "done" })) });
    await t.test("keeps removed backlog and past/discarded rounds, but maps keys to the same current row as detail", async () => {
      const rows = await collect(a.projectId, "key", null);
      assert.ok(rows.some(r => r.boardItemId === previous.id));
      assert.ok(rows.some(r => r.boardItemId === discarded.id));
      const current = await board.currentRoundIds(a.projectId, [a.key]);
      const detail = await board.getWithHistory(a.projectId, a.key);
      assert.equal(current.get(a.key), a.boardItemId);
      assert.equal(current.get(a.key), detail?.id);
      sql.length = 0;
      assert.deepEqual(await board.currentRoundIds(a.projectId, []), new Map());
      assert.equal(await board.hasProjectHistoryBefore(a.projectId, "all", null), false);
      assert.equal(sql.length, 0);
    });

    const boundaries = [-1, 0, 1].map((offset, i) => ({ id: `${prefix}boundary${i}`, at: new Date(cutoff.getTime() + offset) }));
    await db.transitionEvent.createMany({ data: boundaries.map(row => ({ ...row, boardItemId: a.boardItemId, actor: "human", to: "done" })) });
    await db.report.createMany({ data: boundaries.map(row => ({ ...row, boardItemId: a.boardItemId, actor: "main-loop", path: "docs/old.md", commit: "abcdef123", isAcceptance: true })) });
    await t.test("enforces both source cutoffs at millisecond boundaries and cannot be bypassed with a cursor", async () => {
      for (const plan of ["free", "pro", "max"] as const) {
        const since = historyCutoff(plan, now);
        const rows = await collect(a.projectId, "all", since);
        for (const [index, boundary] of boundaries.entries()) {
          assert.equal(rows.filter(r => r.id === boundary.id).length, plan === "free" && index === 0 ? 0 : 2);
        }
        assert.equal(await board.hasProjectHistoryBefore(a.projectId, "all", since), plan === "free");
      }
      const page = await board.projectHistory(a.projectId, { view: "all", since: cutoff,
        before: { at: cutoff, source: "event", id: "anotherprojectsrow" } });
      assert.ok(page.rows.every(r => r.at >= cutoff && r.boardItemId !== b.boardItemId));
      assert.equal(await board.hasProjectHistoryBefore(a.projectId, "key", cutoff), true);
    });

    await t.test("shows truncation only for old rows in the selected view, including report-only history", async () => {
      const old = new Date(cutoff.getTime() - 1);
      await db.transitionEvent.create({ data: { boardItemId: notice.boardItemId, at: old, actor: "agent", to: "proposed" } });
      assert.equal(await board.hasProjectHistoryBefore(notice.projectId, "key", cutoff), false);
      assert.equal(await board.hasProjectHistoryBefore(notice.projectId, "all", cutoff), true);
      await db.transitionEvent.deleteMany({ where: { boardItemId: notice.boardItemId } });
      await db.report.create({ data: { boardItemId: notice.boardItemId, at: old, actor: "dev", path: "old.md", commit: "abcdef123" } });
      assert.equal(await board.hasProjectHistoryBefore(notice.projectId, "key", cutoff), true);
      assert.equal(await board.hasProjectHistoryBefore(notice.projectId, "all", cutoff), true);
      assert.deepEqual((await board.projectHistory(notice.projectId, { view: "key", since: cutoff, before: null })).rows, []);
    });

    await t.test("generated SELECTs preserve NULL, joins, bounds and order without depending on aliases", async () => {
      sql.length = 0;
      await board.projectHistory(a.projectId, { view: "key", since: cutoff, before: { at: now, source: "event", id: ids[20] } });
      const selects = sql.filter(entry => /^SELECT\b/i.test(entry.query));
      assert.ok(selects.some(entry => entry.query.includes('"TransitionEvent"') && /IS NULL/.test(entry.query) && /<>/.test(entry.query)));
      assert.ok(selects.some(entry => entry.query.includes('"Report"')));
      assert.ok(selects.some(entry => /ORDER BY/.test(entry.query) && /DESC/.test(entry.query) && /LIMIT/.test(entry.query)));
      assert.ok(selects.some(entry => /"projectId"/.test(entry.query)));
      assert.ok(selects.some(entry => />=/.test(entry.query) && /</.test(entry.query)));
      assert.ok(selects.some(entry => entry.params.includes(a.projectId)));
      assert.ok(selects.some(entry => entry.params.includes(ids[20])));
    });

    await t.test("records fixture-scale cost and an explain plan without changing indexes", async () => {
      await db.transitionEvent.createMany({ data: Array.from({ length: 2000 }, (_, index) => ({
        boardItemId: a.boardItemId, at: new Date(now.getTime() - index), actor: "agent", to: "planning",
      })) });
      const started = performance.now();
      const page = await board.projectHistory(a.projectId, { view: "all", since: null, before: null });
      const elapsed = performance.now() - started;
      assert.equal(page.rows.length, 50);
      const plan = await db.$queryRaw<{ "QUERY PLAN": unknown }[]>`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT e."id", e."at" FROM "TransitionEvent" e JOIN "BoardItem" b ON b."id" = e."boardItemId"
        WHERE b."projectId" = ${a.projectId} AND (e."note" IS NULL OR e."note" <> 'report')
        ORDER BY e."at" DESC, e."id" DESC LIMIT 51`;
      assert.ok(Array.isArray(plan[0]?.["QUERY PLAN"]));
      const root = (plan[0]["QUERY PLAN"] as { Plan: { "Node Type": string }; "Execution Time": number }[])[0];
      t.diagnostic(`fixture: 2000 additional events; page ${elapsed.toFixed(1)} ms; SQL ${root["Execution Time"]} ms; root ${root.Plan["Node Type"]}`);
    });
  } finally {
    try {
      const cleaned = await Promise.allSettled(owned.map(record => cleanup(db, record.userId)));
      if (cleaned.some(result => result.status === "rejected")) throw new Error("History fixture cleanup failed.");
    }
    finally { await Promise.all([logged.$disconnect(), pool.disconnect()]); }
  }
});
