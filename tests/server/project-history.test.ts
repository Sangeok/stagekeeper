import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { ReactElement } from "react";
import { historyCutoff } from "../../packages/core/entitlement.mjs";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { createBoardService, currentRoundIds, hasProjectHistoryBefore, projectHistory, projectHistoryItems } from "../../src/server/pipeline/board";
import * as cursorModule from "../../src/server/pipeline/history-page";
import * as itemCursorModule from "../../src/server/pipeline/history-items";
import { afterCursor, eventWhere } from "../../src/server/pipeline/history-page";

type PageInput = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
type PageOutput = ReactElement<{
  mode: string;
  view: string; hasBefore: boolean; historyTruncated: boolean; nextCursor: string | null;
  events: unknown[]; reports: unknown[]; currentRounds: ReadonlyMap<string, string>;
}>;

// 실제 route 본문을 별도 VM에서 실행한다. 인증·DB 경계만 주입하므로 전역 module mock이 남지 않는다.
function isolatedHistoryRoute(dependencies: Record<string, unknown>): (input: PageInput) => Promise<PageOutput> {
  const source = readFileSync(new URL("../../src/app/(app)/p/[slug]/history/page.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exported: { default?: unknown } = {};
  const require = createRequire(import.meta.url);
  runInNewContext(code, { exports: exported, Date, require: (specifier: string) => {
    if (specifier in dependencies) return dependencies[specifier];
    if (specifier === "react/jsx-runtime") return require(specifier);
    throw new Error(`Unexpected route dependency: ${specifier}`);
  } });
  assert.equal(typeof exported.default, "function");
  // transpile된 모듈의 경계다. 아래 시험이 입력·출력·실행 순서를 검증한다.
  return exported.default as (input: PageInput) => Promise<PageOutput>;
}

it("the actual route stops before reads on auth failure and derives scope only from the owner guard", async () => {
  const calls: string[] = [];
  const denied = new Error("not found or login redirect");
  let rejectAccess = true;
  let plan: "free" | "pro" = "free";
  const at = new Date("2026-09-30T00:00:00.000Z");
  const report = { source: "report", id: "c1", key: "K-1", boardItemId: "round", at, actor: "dev",
    path: "docs/r.md", commit: "abcdef123", isAcceptance: false, acceptedAt: null };
  const options: { view: string; since: Date | null; before: unknown }[] = [];
  const page = isolatedHistoryRoute({
    "@harness/core/entitlement.mjs": { historyCutoff },
    "@/fsd/pages/project-history": { ProjectHistoryPage: () => null },
    "@/server/auth/guard": { requireProjectOwner: async (slug: string) => {
      calls.push("guard"); assert.equal(slug, "sample"); if (rejectAccess) throw denied; return { projectId: "owned" };
    } },
    "@/server/entitlement": { planForProject: async (id: string) => { calls.push("plan"); assert.equal(id, "owned"); return plan; } },
    "@/server/pipeline/history-page": cursorModule,
    "@/server/pipeline/history-items": itemCursorModule,
    "@/server/project": { loadProjectRepository: async (id: string) => {
      calls.push("repo"); assert.equal(id, "owned"); return { owner: "o", repo: "r", branch: "main" };
    } },
    "@/server/pipeline/board": {
      projectHistory: async (id: string, query: typeof options[number]) => {
        calls.push("history"); assert.equal(id, "owned"); options.push(query);
        return { rows: [report], next: { at, source: "report", id: "c1" } };
      },
      hasProjectHistoryBefore: async (id: string, view: string, since: Date) => {
        calls.push("truncation"); assert.equal(id, "owned"); assert.equal(view, options.at(-1)?.view);
        assert.equal(since, options.at(-1)?.since); return true;
      },
      currentRoundIds: async (id: string, keys: string[]) => {
        calls.push("rounds"); assert.equal(id, "owned"); assert.deepEqual(Array.from(keys), ["K-1"]); return new Map([["K-1", "round"]]);
      },
    },
  });
  const invoke = (query: Record<string, string | string[] | undefined>) => page({ params: Promise.resolve({ slug: "sample" }), searchParams: Promise.resolve(query) });
  await assert.rejects(invoke({}), error => error === denied);
  assert.deepEqual(calls, ["guard"]);
  rejectAccess = false;
  for (const query of [{ mode: "events" }, { mode: "events", view: ["all", "all"], before: ["c1", "c2"] }, { mode: "events", view: "invalid", before: "invalid" }]) {
    calls.length = 0;
    const rendered = await invoke(query);
    assert.deepEqual(calls, ["guard", "plan", "history", "truncation", "repo", "rounds"]);
    assert.equal(rendered.props.view, "key");
    assert.equal(rendered.props.hasBefore, false);
    assert.equal(rendered.props.historyTruncated, true);
    assert.equal(options.at(-1)?.before, null);
    assert.ok(options.at(-1)?.since instanceof Date);
    assert.equal(rendered.props.reports.length, 1);
    assert.equal(rendered.props.events.length, 0);
    assert.equal(rendered.props.nextCursor, "2026-09-30T00:00:00.000Z.r.c1");
    assert.equal(rendered.props.currentRounds.get("K-1"), "round");
  }
  calls.length = 0;
  plan = "pro";
  const rendered = await invoke({ view: "all", before: "2020-01-01T00:00:00.000Z.e.otherproject" });
  assert.equal(rendered.props.view, "all");
  assert.equal(rendered.props.hasBefore, true);
  assert.equal(rendered.props.historyTruncated, false);
  assert.equal(options.at(-1)?.since, null);
  assert.ok(!calls.includes("truncation"));
});

it("exports history queries through both the factory and server entrypoint", () => {
  assert.equal(typeof projectHistory, "function");
  assert.equal(typeof hasProjectHistoryBefore, "function");
  assert.equal(typeof currentRoundIds, "function");
  assert.equal(typeof projectHistoryItems, "function");
});

it("scopes and bounds both sources, preserves the three filters and only projects public record fields", async () => {
  const calls: { source: string; args: unknown }[] = [];
  const at = new Date("2026-09-30T00:00:00.000Z");
  // 외부 경계인 Prisma만 대체한다. 이 시험에서 쓰는 두 조회 외에는 허용하지 않는다.
  const db = {
    transitionEvent: { findMany: async (args: unknown) => {
      calls.push({ source: "event", args });
      return [{ id: "e1", at, boardItemId: "old", actor: "human", channel: "session", from: "proposed", to: "planning", note: null,
        boardItem: { backlogItem: { key: "K-1" } } }];
    } },
    report: { findMany: async (args: unknown) => {
      calls.push({ source: "report", args });
      return [{ id: "r1", at, boardItemId: "old", actor: "main-loop", path: "docs/r.md", commit: "abcdef12", isAcceptance: null,
        boardItem: { acceptedAt: at, backlogItem: { key: "K-1" } } }];
    } },
  } as unknown as PrismaClient;
  const board = createBoardService(db);
  for (const plan of ["free", "pro", "max"] as const) {
    const since = historyCutoff(plan, at);
    const before = { at: new Date(at.getTime() + 1), source: "report" as const, id: "anotherprojectid" };
    for (const view of ["key", "all"] as const) {
      calls.length = 0;
      const page = await board.projectHistory("owned-project", { view, since, before });
      const window = since === null ? {} : { at: { gte: since } };
      assert.deepEqual(calls, [
        { source: "event", args: {
          where: { boardItem: { projectId: "owned-project" }, AND: [eventWhere(view), window, afterCursor("event", before)] },
          orderBy: [{ at: "desc" }, { id: "desc" }], take: 51,
          select: { id: true, at: true, boardItemId: true, actor: true, channel: true, from: true, to: true, note: true,
            boardItem: { select: { backlogItem: { select: { key: true } } } } },
        } },
        { source: "report", args: {
          where: { boardItem: { projectId: "owned-project" }, AND: [window, afterCursor("report", before)] },
          orderBy: [{ at: "desc" }, { id: "desc" }], take: 51,
          select: { id: true, at: true, boardItemId: true, actor: true, path: true, commit: true, isAcceptance: true,
            boardItem: { select: { acceptedAt: true, backlogItem: { select: { key: true } } } } },
        } },
      ]);
      assert.deepEqual(page.rows.map(r => [r.source, r.id, r.key, r.boardItemId]), [["report", "r1", "K-1", "old"], ["event", "e1", "K-1", "old"]]);
      const report = page.rows[0];
      assert.ok(report.source === "report");
      assert.equal(report.acceptedAt, at);
      assert.equal(page.next, null);
      assert.equal("boardItem" in report, false);
    }
  }
  calls.length = 0;
  await assert.rejects(board.projectHistory("owned-project", { view: "all", since: null, before: null, limit: 0 }), RangeError);
  assert.equal(calls.length, 0);
});

it("truncation uses the same view but no page boundary; unbounded plans do not query", async () => {
  const calls: unknown[] = [];
  let hasEvent = false;
  let hasReport = false;
  const db = {
    transitionEvent: { findFirst: async (args: unknown) => { calls.push(args); return hasEvent ? { id: "e" } : null; } },
    report: { findFirst: async (args: unknown) => { calls.push(args); return hasReport ? { id: "r" } : null; } },
  } as unknown as PrismaClient;
  const board = createBoardService(db);
  assert.equal(await board.hasProjectHistoryBefore("p", "key", null), false);
  assert.equal(calls.length, 0);
  const since = new Date("2026-09-01T00:00:00.000Z");
  for (const view of ["key", "all"] as const) {
    for (const flags of [[false, false], [true, false], [false, true], [true, true]]) {
      [hasEvent, hasReport] = flags;
      calls.length = 0;
      assert.equal(await board.hasProjectHistoryBefore("p", view, since), hasEvent || hasReport);
      assert.deepEqual(calls, [
        { where: { boardItem: { projectId: "p" }, at: { lt: since }, AND: [eventWhere(view)] }, select: { id: true } },
        { where: { boardItem: { projectId: "p" }, at: { lt: since } }, select: { id: true } },
      ]);
    }
  }
});

it("links only the first non-discarded round per key and skips empty key lists", async () => {
  const calls: unknown[] = [];
  const db = { boardItem: { findMany: async (args: unknown) => {
    calls.push(args);
    return [{ id: "new", backlogItem: { key: "K-1" } }, { id: "other", backlogItem: { key: "K-2" } }, { id: "old", backlogItem: { key: "K-1" } }];
  } } } as unknown as PrismaClient;
  const board = createBoardService(db);
  assert.deepEqual(await board.currentRoundIds("p", []), new Map());
  assert.equal(calls.length, 0);
  assert.deepEqual(await board.currentRoundIds("p", ["K-1", "K-2", "K-1"]), new Map([["K-1", "new"], ["K-2", "other"]]));
  assert.deepEqual(calls, [{ where: { projectId: "p", discardedAt: null, backlogItem: { key: { in: ["K-1", "K-2"] } } },
    orderBy: { proposedOn: "desc" }, select: { id: true, backlogItem: { select: { key: true } } } }]);
});

it("defaults to item summaries, ignores malformed cursors and fetches only an expanded item on the visible page", async () => {
  const calls: string[] = [];
  const denied = new Error("not found");
  let authorized = false;
  let plan: "free" | "pro" = "free";
  const at = new Date("2026-09-30T00:00:00.000Z");
  const summary = { id: "item1", key: "K-1", title: "Practice history", status: "done", discardedAt: null, at };
  const itemOptions: itemCursorModule.HistoryItemsOptions[] = [];
  const detailOptions: { key: string; view: string; since: Date | null; before: cursorModule.HistoryCursor | null }[] = [];
  const route = isolatedHistoryRoute({
    "@harness/core/entitlement.mjs": { historyCutoff },
    "@/fsd/pages/project-history": { ProjectHistoryPage: () => null },
    "@/server/auth/guard": { requireProjectOwner: async () => {
      calls.push("guard"); if (!authorized) throw denied; return { projectId: "owned" };
    } },
    "@/server/entitlement": { planForProject: async () => { calls.push("plan"); return plan; } },
    "@/server/pipeline/history-page": cursorModule,
    "@/server/pipeline/history-items": itemCursorModule,
    "@/server/project": { loadProjectRepository: async () => { calls.push("repo"); return { owner: "o", repo: "r", branch: "main" }; } },
    "@/server/pipeline/board": {
      projectHistoryItems: async (id: string, options: itemCursorModule.HistoryItemsOptions) => {
        assert.equal(id, "owned"); calls.push("items"); itemOptions.push(options); return { rows: [summary], next: { at, id: "item1" } };
      },
      hasProjectHistoryBefore: async (id: string, view: string) => {
        assert.equal(id, "owned"); assert.equal(view, "all"); calls.push("truncation"); return true;
      },
      projectHistory: async (id: string, options: typeof detailOptions[number]) => {
        assert.equal(id, "owned"); calls.push("detail"); detailOptions.push(options);
        return { rows: [], next: null };
      },
      currentRoundIds: async (id: string, keys: string[]) => {
        assert.equal(id, "owned"); assert.deepEqual(Array.from(keys), ["K-1"]); calls.push("rounds"); return new Map();
      },
    },
  });
  const invoke = (query: PageInput["searchParams"] extends Promise<infer Query> ? Query : never) =>
    route({ params: Promise.resolve({ slug: "sample" }), searchParams: Promise.resolve(query) });
  await assert.rejects(invoke({ item: "K-1" }), error => error === denied);
  assert.deepEqual(calls, ["guard"]);
  authorized = true;
  for (const query of [{}, { mode: ["events", "events"], before: ["a", "b"] },
    { mode: "invalid", view: "all", before: "invalid" }, { item: "another-project-key" }, { item: ["K-1", "K-2"] }]) {
    calls.length = 0;
    const result = await invoke(query);
    assert.equal(result.props.mode, "items");
    assert.equal(result.props.hasBefore, false);
    assert.equal(result.props.nextCursor, "2026-09-30T00:00:00.000Z.i.item1");
    assert.equal(itemOptions.at(-1)?.before, null);
    assert.ok(itemOptions.at(-1)?.since instanceof Date);
    assert.deepEqual(calls, ["guard", "plan", "items", "truncation", "repo"]);
  }
  calls.length = 0;
  const listBefore = "2026-09-30T00:00:00.000Z.i.item9";
  const itemBefore = "2026-09-29T00:00:00.000Z.e.e1";
  const result = await invoke({ item: "K-1", before: listBefore, itemBefore });
  assert.equal(result.props.hasBefore, true);
  assert.equal(itemOptions.at(-1)?.before?.id, "item9");
  assert.equal(detailOptions.at(-1)?.key, "K-1");
  assert.equal(detailOptions.at(-1)?.view, "all");
  assert.equal(detailOptions.at(-1)?.before?.id, "e1");
  assert.equal(detailOptions.at(-1)?.since, itemOptions.at(-1)?.since);
  assert.deepEqual(calls, ["guard", "plan", "items", "truncation", "repo", "detail", "rounds"]);
  await invoke({ item: "K-1", itemBefore: [itemBefore, itemBefore] });
  assert.equal(detailOptions.at(-1)?.before, null);
  calls.length = 0;
  plan = "pro";
  await invoke({});
  assert.equal(itemOptions.at(-1)?.since, null);
  assert.ok(!calls.includes("truncation"));
});

it("bounds item pages and creates the cursor from the last displayed item, not the lookahead item", async () => {
  const at = new Date("2026-09-30T00:00:00.000Z");
  let count = 51;
  const db = { $queryRaw: async () => Array.from({ length: count }, (_, index) => ({
    id: `item${index}`, key: `K-${index}`, title: "Item", status: "done", discardedAt: null, at,
  })) } as unknown as PrismaClient;
  const board = createBoardService(db);
  const page = await board.projectHistoryItems("owned", { since: null, before: null });
  assert.equal(page.rows.length, 50);
  assert.deepEqual(page.next, { at, id: "item49" });
  count = 50;
  assert.equal((await board.projectHistoryItems("owned", { since: null, before: null })).next, null);
  count = 0;
  assert.deepEqual(await board.projectHistoryItems("owned", { since: null, before: null }), { rows: [], next: null });
});

it("scopes expanded history to both project and key without excluding past/discarded rounds", async () => {
  const queries: { where: unknown; take: number }[] = [];
  const findMany = async (args: typeof queries[number]) => { queries.push(args); return []; };
  const db = { transitionEvent: { findMany }, report: { findMany } } as unknown as PrismaClient;
  const since = new Date("2026-09-01T00:00:00.000Z");
  const before = { at: new Date("2026-09-30T00:00:00.000Z"), source: "event" as const, id: "e1" };
  await createBoardService(db).projectHistory("owned", { key: "K-1", view: "all", since, before });
  assert.deepEqual(queries.map(query => query.where), [
    { boardItem: { projectId: "owned", backlogItem: { key: "K-1" } }, AND: [eventWhere("all"), { at: { gte: since } }, afterCursor("event", before)] },
    { boardItem: { projectId: "owned", backlogItem: { key: "K-1" } }, AND: [{ at: { gte: since } }, afterCursor("report", before)] },
  ]);
  assert.ok(queries.every(query => query.take === 51));
});
