import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { ProjectListPage } from "./project-list-page.tsx";

it("shows availability counts and a separate Use button while preserving the project link", () => {
  const model = { login: "owner", plan: "free", limit: 1, version: 3, availableCount: 1, connectedCount: 2, writesEnabled: true, notice: null, projects: [
    { id: "a", slug: "aaa", name: "AAA", repoOwner: "repo", repo: "aaa", disconnectedAt: null, available: true, openItems: 0, openRuns: 0 },
    { id: "b", slug: "bbb", name: "BBB", repoOwner: "repo", repo: "bbb", disconnectedAt: null, available: false, openItems: 1, openRuns: 2 },
  ] };
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: { refresh() {} } },
    createElement(ProjectListPage, { model, action: async () => ({ status: "success" }), disconnect: async () => ({ status: "success" }), reconnect: async () => ({ status: "success" }) })));
  assert.match(html, /1 \/ 1 available/); assert.match(html, /Not selected/); assert.match(html, /Use this project/);
  assert.match(html, /href="\/p\/bbb"/);
  for (const anchor of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) assert.doesNotMatch(anchor[0], /<button/);
});

it("keeps the availability badge and the Use control together at the row end", () => {
  const model = { login: "owner", plan: "free", limit: 1, version: 3, availableCount: 1, connectedCount: 2, writesEnabled: true, notice: null, projects: [
    { id: "a", slug: "aaa", name: "AAA", repoOwner: "repo", repo: "aaa", disconnectedAt: null, available: true, openItems: 0, openRuns: 0 },
    { id: "b", slug: "bbb", name: "BBB", repoOwner: "repo", repo: "bbb", disconnectedAt: null, available: false, openItems: 1, openRuns: 2 },
  ] };
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: { refresh() {} } },
    createElement(ProjectListPage, { model, action: async () => ({ status: "success" }), disconnect: async () => ({ status: "success" }), reconnect: async () => ({ status: "success" }) })));
  // 배지와 버튼은 링크 뒤의 한 묶음이다 — 행이 justify-between이라 따로 두면 배지가 가운데로 밀린다.
  const rows = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(rows.length, 2);
  for (const row of rows) assert.match(row, /<\/a><div\b[^>]*>\s*<span\b[^>]*>(Available|Not selected)<\/span>/);
  assert.match(rows[1], /Not selected<\/span>[\s\S]*<button\b[^>]*class="[^"]*\bself-start\b[^"]*"[^>]*>Use this project/);
});

it("separates preserved projects and the two empty-group messages, including zero connected", () => {
  for (const disconnectedAt of [null, "2026-09-30T00:00:00Z"]) {
    const model = { login: "owner", plan: "free", limit: 1, version: 4, connectedCount: disconnectedAt === null ? 1 : 0, availableCount: 0, writesEnabled: true, notice: null,
      projects: [{ id: "a", slug: "aaa", name: "AAA", repoOwner: "repo", repo: "aaa", disconnectedAt, available: false, openItems: 0, openRuns: 0 }] };
    const action = async () => ({ status: "success" });
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: { refresh() {} } }, createElement(ProjectListPage, { model, action, disconnect: action, reconnect: action })));
    if (disconnectedAt !== null) {
      assert.match(html, /0 \/ 1 connected/); assert.match(html, /No connected repositories/); assert.doesNotMatch(html, /Use this project/);
      assert.match(html, /Reconnect repository/); assert.match(html, /href="\/p\/aaa"/);
    } else { assert.match(html, /No disconnected repositories/); assert.match(html, /Disconnect repository/); }
  }
});
