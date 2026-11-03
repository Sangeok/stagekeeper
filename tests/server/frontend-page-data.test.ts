import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import { isValidElement } from "react";
import type * as Detail from "@/fsd/pages/board-item/index.server";
import type * as Backlog from "@/fsd/pages/project-backlog/index.server";
import { readBacklogQuery } from "@/fsd/shared/routes/project";
import { loadModule } from "./fixtures/load-module";
import { manifestEntries } from "./fixtures/action-manifest";

const detailPath = "src/fsd/pages/board-item/api/board-item-page.server.ts";
const backlogPath = "src/fsd/pages/project-backlog/api/project-backlog-page.server.ts";
const at = new Date("2026-10-01T01:02:03.000Z");
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const decision = { contextKey: "context", policy: "Oldest first", criterion: "Ready", readiness: "Ready", assignmentReason: "Owns web", evidence: [{ key: "K-1", quote: "Evidence" }], comparisons: [], uncertainties: [] };
const row = {
  id: "board", backlogItem: { key: "K-1", title: "Item title", area: "web" }, agent: "dev", status: "done", reason: "Evidence",
  selectionDecision: decision, results: ["Result"], validation: null, proposedOn: at, acceptedAt: null, updatedAt: at,
  acceptanceFailures: [{ id: "failure", checks: [3], note: "Check", path: null, commit: null, at }],
  planPath: "docs/plan.md", planCommit: "abc",
  events: [{ id: "event", at, actor: "human", channel: null, from: "planning", to: "in_review", note: "pipeline-changed:a:b" }],
  reports: [{ id: "report", at, actor: "dev", path: "docs/report.md", commit: "def", isAcceptance: false }],
};

function detailFixture({ missing = false, plan = "free", failure, emptyEvidence = false }: { missing?: boolean; plan?: string; failure?: Error; emptyEvidence?: boolean } = {}) {
  const calls: string[] = [];
  const cutoff: (Date | null)[] = [];
  const current = loadModule<typeof Detail>(detailPath, {
    "@/server/db": { prisma: {} },
    "@/server/projects/api.server": {
      projectAccess: async (id: string) => { assert.equal(id, "trusted"); calls.push("access"); if (failure) throw failure; return { available: false }; },
      planForProject: async () => { calls.push("plan"); return plan; },
      loadProjectRepository: async () => { calls.push("repository"); return { owner: "owner", repo: "repo", branch: "main" }; },
    },
    "@/server/pipeline/api.server": {
      getWithHistory: async (id: string, key: string, since: Date | null) => {
        assert.equal(id, "trusted"); assert.equal(key, "K-1"); cutoff.push(since); calls.push("row");
        return missing ? null : emptyEvidence ? { ...row, planPath: null, selectionDecision: { invalid: true }, acceptanceFailures: [], reports: [], events: [] } : row;
      },
      hasHistoryBefore: async (_project: string, id: string, since: Date | null) => {
        assert.equal(id, "board"); assert.equal(since, cutoff[0]); calls.push("truncated"); return true;
      },
    },
    "@/server/pipeline/api": {
      loadItemPipelineView: async () => { calls.push("pipeline"); return { pipelineId: "current", name: "Current", canChange: true, runState: "completed" }; },
      loadPipelinesView: async () => { calls.push("choices"); return { pipelines: [
        { id: "current", name: "Current", runnable: {} }, { id: "fragment", name: "Fragment", runnable: null }, { id: "next", name: "Next", runnable: {} },
      ] }; },
      loadPipelineChanges: async (_db: unknown, id: string, notes: unknown) => {
        assert.equal(id, "trusted"); assert.deepEqual(json(notes), emptyEvidence ? [] : ["pipeline-changed:a:b"]); calls.push("changes");
        return { "pipeline-changed:a:b": { fromName: "Before", toName: "After" } };
      },
    },
  });
  return { ...current, calls, cutoff };
}

it("projects the complete detail record without losing dates, optional evidence or current pipeline filtering", async () => {
  const fixture = detailFixture();
  const data = await fixture.loadBoardItemPage("trusted", "K-1");
  assert.ok(data);
  assert.equal(data.canWrite, false);
  assert.deepEqual(json(data.pipelineChoices), [{ id: "next", name: "Next" }]);
  assert.equal(data.item.proposedOn, at);
  assert.equal(data.item.acceptanceFailure?.at, at);
  const { docs, ...item } = data.item;
  assert.deepEqual(json(item), {
    id: "board", pipeline: { pipelineId: "current", name: "Current", canChange: true, runState: "completed" },
    key: "K-1", title: "Item title", area: "web", agent: "dev", status: "done", reason: "Evidence", selectionDecision: decision,
    results: ["Result"], validation: null, proposedOn: at.toISOString(), acceptedAt: null,
    acceptanceFailure: { id: "failure", checks: [3], note: "Check", path: null, commit: null, at: at.toISOString() },
    updatedAt: at.toISOString(),
    events: [{ id: "event", at: at.toISOString(), actor: "human", channel: null, from: "planning", to: "in_review", note: "pipeline-changed:a:b", pipelineChange: { fromName: "Before", toName: "After" } }],
    reports: [{ id: "report", at: at.toISOString(), actor: "dev", path: "docs/report.md", commit: "def", isAcceptance: false, acceptedAt: null }],
    repo: { owner: "owner", repo: "repo", branch: "main" }, historyTruncated: true,
  });
  assert.equal(docs.length, 2);
  assert.deepEqual(json(docs[0]), { id: "plan", label: "Plan", path: "docs/plan.md", href: "https://github.com/owner/repo/blob/abc/docs/plan.md" });
  assert.equal(docs[1].href, "https://github.com/owner/repo/blob/def/docs/report.md");
  assert.deepEqual(fixture.calls, ["access", "plan", "repository", "row", "pipeline", "choices", "changes", "truncated"]);
  assert.ok(fixture.cutoff[0] instanceof Date);
});

it("returns missing detail before downstream reads, skips unlimited-history checks and propagates query failures", async () => {
  const missing = detailFixture({ missing: true });
  assert.equal(await missing.loadBoardItemPage("trusted", "K-1"), null);
  assert.deepEqual(missing.calls, ["access", "plan", "repository", "row"]);
  const unlimited = detailFixture({ plan: "pro" });
  const data = await unlimited.loadBoardItemPage("trusted", "K-1");
  assert.equal(unlimited.cutoff[0], null); assert.equal(data?.item.historyTruncated, false);
  assert.ok(!unlimited.calls.includes("truncated"));
  const empty = await detailFixture({ emptyEvidence: true }).loadBoardItemPage("trusted", "K-1");
  assert.ok(empty);
  assert.equal(empty.item.selectionDecision, null); assert.equal(empty.item.acceptanceFailure, null);
  assert.deepEqual(json([empty.item.docs, empty.item.events, empty.item.reports]), [[], [], []]);
  const failure = new Error("query unavailable");
  const failed = detailFixture({ failure });
  await assert.rejects(failed.loadBoardItemPage("trusted", "K-1"), error => error === failure);
  assert.deepEqual(failed.calls, ["access"]);
});

it("keeps backlog row order, removed/edit values, assignees and type-based defaults without changing author attribution", async () => {
  const calls: string[] = [];
  const items = [
    { key: "K-2", title: "Second", area: "web", source: "Source 2", status: "done", removedAt: at, type: "fix", addedBy: "work-discoverer", removedReason: "done" },
    { key: "K-1", title: "First", area: "api", source: "Source 1", status: null, removedAt: null, type: null, addedBy: "owner", removedReason: null },
  ];
  const backlogModule = loadModule<typeof Backlog>(backlogPath, {
    "@/server/db": { prisma: {} },
    "@/server/pipeline/api.server": { backlogWithStatus: async (id: string, removed: boolean) => {
      assert.equal(id, "trusted"); assert.equal(removed, true); calls.push("items"); return items;
    } },
    "@/server/projects/api": { loadProjectRoster: async () => { calls.push("roster"); return ["z-dev", "a-dev"]; } },
    "@/server/pipeline/api": { loadPipelinesView: async () => { calls.push("view"); return { rules: { fix: "fix-pipeline" }, pipelines: [
      { id: "default", name: "Default", isDefault: true, runnable: {} }, { id: "fragment", name: "Fragment", isDefault: false, runnable: null }, { id: "fix-pipeline", name: "Fix", isDefault: false, runnable: {} },
    ] }; } },
    "@/server/projects/api.server": { projectAccess: async () => { calls.push("access"); return { available: false }; } },
  });
  const data = await backlogModule.loadProjectBacklogPage("trusted", { includeRemoved: true, editKey: "K-2" });
  assert.deepEqual(json(data), {
    canWrite: false, rows: json(items), editingItem: { key: "K-2", title: "Second", area: "web", source: "Source 2", type: "fix" },
    roster: ["z-dev", "a-dev"], pipelines: [{ id: "default", name: "Default" }, { id: "fix-pipeline", name: "Fix" }],
    preselected: { "K-2": "fix-pipeline", "K-1": "default" },
  });
  assert.deepEqual(calls, ["items", "roster", "view", "access"]);
  assert.equal((await backlogModule.loadProjectBacklogPage("trusted", { includeRemoved: true, editKey: "missing" })).editingItem, undefined);
});

type Route = { default: (input: { params: Promise<{ slug: string; key?: string }>; searchParams?: Promise<Record<string, string>> }) => Promise<unknown> };
type Composition = {
  slug: string; canWrite: boolean; item?: unknown; includeRemoved?: boolean;
  transition?: (...args: unknown[]) => Promise<unknown>;
  editing?: { item: { key: string }; update: (...args: unknown[]) => Promise<unknown> };
};

it("detail composition authorizes before loading, preserves the Action binding and owns notFound", async () => {
  const calls: unknown[] = [];
  let allowed = true, missing = false;
  const denied = new Error("guard denied"), absent = new Error("not found");
  const item = { key: "K-1" };
  const action = async (...args: unknown[]) => { calls.push(args); };
  const page = loadModule<Route>("src/app/(app)/p/[slug]/items/[key]/page.tsx", {
    "next/navigation": { notFound: () => { throw absent; } },
    "@/server/auth/guard": { requireProjectOwner: async (slug: string) => { calls.push(["guard", slug]); if (!allowed) throw denied; return { projectId: "trusted" }; } },
    "@/fsd/pages/board-item/index.server": { loadBoardItemPage: async (...args: unknown[]) => { calls.push(["load", ...args]); return missing ? null : { item, canWrite: false, pipelineChoices: [] }; } },
    "@/fsd/pages/board-item": { BoardItemPage: () => null },
    "@/fsd/features/change-item-pipeline/index.server": { changeItemPipeline: action },
    "@/fsd/features/review-gate/index.server": { humanTransition: action, retryAcceptance: action },
  });
  const input = { params: Promise.resolve({ slug: "mine", key: "K-1" }) };
  const element = await page.default(input);
  assert.ok(isValidElement<Composition>(element));
  assert.deepEqual(calls, [["guard", "mine"], ["load", "trusted", "K-1"]]);
  assert.equal(element.props.item, item); assert.equal(element.props.canWrite, false);
  assert.ok(element.props.transition); await element.props.transition("payload");
  assert.deepEqual(calls.at(-1), ["mine", "payload"]);
  calls.length = 0; allowed = false;
  await assert.rejects(page.default(input), error => error === denied);
  assert.deepEqual(calls, [["guard", "mine"]]);
  allowed = true; missing = true;
  await assert.rejects(page.default(input), error => error === absent);
});

it("backlog composition parses the URL after its guard and binds updates to the resolved item", async () => {
  const calls: unknown[] = [];
  const action = async (...args: unknown[]) => { calls.push(args); };
  const page = loadModule<Route>("src/app/(app)/p/[slug]/backlog/page.tsx", {
    "@/server/auth/guard": { requireProjectOwner: async () => { calls.push("guard"); return { projectId: "trusted" }; } },
    "@/fsd/shared/routes/project": { readBacklogQuery },
    "@/fsd/pages/project-backlog/index.server": { loadProjectBacklogPage: async (id: string, query: unknown) => {
      calls.push([id, query]); return { rows: [], roster: [], pipelines: [], preselected: {}, canWrite: true, editingItem: { key: "resolved", title: "Edit", type: null, source: "Source", area: "web" } };
    } },
    "@/fsd/pages/project-backlog": { ProjectBacklogPage: () => null },
    "@/fsd/features/edit-backlog/index.server": { addBacklogItem: action, updateBacklogItem: action, removeBacklogItem: action },
    "@/fsd/features/propose-item/index.server": { proposeItem: action },
  });
  const element = await page.default({ params: Promise.resolve({ slug: "mine" }), searchParams: Promise.resolve({ edit: "requested", removed: "1" }) });
  assert.ok(isValidElement<Composition>(element));
  assert.deepEqual(json(calls), ["guard", ["trusted", { editKey: "requested", includeRemoved: true }]]);
  assert.equal(element.props.includeRemoved, true); assert.ok(element.props.editing);
  await element.props.editing.update("previous", "form");
  assert.deepEqual(calls.at(-1), ["mine", "resolved", "previous", "form"]);
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh page loaders and test helpers never become Actions or client references", () => {
  const forbidden = [detailPath, backlogPath, "src/fsd/shared/lib/testing/app-router.ts", "src/fsd/shared/lib/testing/index.ts"];
  for (const entry of manifestEntries()) for (const path of forbidden) assert.ok(!entry.filename?.replaceAll("\\", "/").endsWith(path));
  const routes: Record<string, string> = JSON.parse(readFileSync(".next/server/app-paths-manifest.json", "utf8"));
  for (const route of ["/(app)/p/[slug]/items/[key]/page", "/(app)/p/[slug]/backlog/page", "/(app)/p/[slug]/pipeline/page"]) assert.equal(typeof routes[route], "string");
  const files: string[] = [];
  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === "page_client-reference-manifest.js") files.push(path);
    }
  }
  walk(".next/server/app"); assert.ok(files.length > 0);
  for (const file of files) {
    const context = { globalThis: {} as { __RSC_MANIFEST?: Record<string, { clientModules: Record<string, unknown> }> } };
    runInNewContext(readFileSync(file, "utf8"), context);
    assert.ok(context.globalThis.__RSC_MANIFEST);
    for (const manifest of Object.values(context.globalThis.__RSC_MANIFEST)) {
      assert.ok(manifest.clientModules && typeof manifest.clientModules === "object");
      for (const name of Object.keys(manifest.clientModules)) for (const path of forbidden) assert.ok(!name.replaceAll("\\", "/").includes(path));
    }
  }
});
