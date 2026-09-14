import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { ProjectListPage } from "./project-list-page.tsx";

it("shows availability counts and a separate Use button while preserving the project link", () => {
  const model = { login: "owner", plan: "free", limit: 1, version: 3, availableCount: 1, notice: null, projects: [
    { id: "a", slug: "aaa", name: "AAA", repoOwner: "repo", repo: "aaa", available: true, openItems: 0, openRuns: 0 },
    { id: "b", slug: "bbb", name: "BBB", repoOwner: "repo", repo: "bbb", available: false, openItems: 1, openRuns: 2 },
  ] };
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: { refresh() {} } },
    createElement(ProjectListPage, { model, useProject: async () => ({ status: "success" }) })));
  assert.match(html, /1 \/ 1 available/); assert.match(html, /Not selected/); assert.match(html, /Use this project/);
  assert.match(html, /href="\/p\/bbb"/);
  for (const anchor of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) assert.doesNotMatch(anchor[0], /<button/);
});
