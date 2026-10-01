import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { ProjectListPage } from "./project-list-page.tsx";

const project = (id, extra = {}) => ({ id, slug: id.repeat(3), name: id.toUpperCase().repeat(3), repoOwner: "repo", repo: id.repeat(3), branch: "main",
  disconnectedAt: null, available: true, openItems: 0, openRuns: 0, ...extra });
const base = { login: "owner", plan: "free", limit: 1, version: 3, availableCount: 1, connectedCount: 1, notice: null };
const action = async () => ({ status: "success" });
const render = (model) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: { refresh() {} } },
  createElement(ProjectListPage, { model, action, disconnect: action, reconnect: action })));
const visible = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const newProjectClass = (html) => html.match(/<a\b[^>]*class="([^"]*)"[^>]*>New project<\/a>/)[1];

it("says once how many repositories are connected on the plan and steps New project down when no slot is left", () => {
  const html = render({ ...base, projects: [project("a", { openItems: 3, openRuns: 1 })] });
  const text = visible(html);
  assert.ok(text.includes("1 of 1 repository connected on the Free plan."));
  assert.doesNotMatch(html, /\d+ \/ \d+ (available|connected)/);
  assert.match(html, /To connect another, disconnect one or <a\b[^>]*href="\/billing"[^>]*>compare plans<\/a>\./);
  assert.doesNotMatch(newProjectClass(html), /\bbg-mine\b/);
  // 평소엔 모든 행이 사용 중이라 상태 글자는 정보가 없다 — 예외일 때만 쓴다.
  assert.doesNotMatch(text, /\bAvailable\b|Not selected/);
  assert.doesNotMatch(text, /\bConnected\b|Disconnected|No disconnected repositories/);
});

it("lets the whole identity block open the project and keeps every control outside the link", () => {
  const html = render({ ...base, projects: [project("a", { openItems: 3, openRuns: 1 })] });
  assert.match(html, /<a\b[^>]*href="\/p\/aaa"[^>]*>[\s\S]*AAA[\s\S]*repo\/aaa[\s\S]*main[\s\S]*<\/a>/);
  for (const anchor of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) assert.doesNotMatch(anchor[0], /<button/);
  const text = visible(html);
  assert.ok(text.includes("3 open items")); assert.ok(text.includes("1 open agent run"));
  assert.match(html, /<button\b[^>]*aria-label="More actions for AAA"/);
  assert.doesNotMatch(text, /Disconnect repository/);
});

it("keeps the primary New project button while a slot is free and says when nothing is open", () => {
  const html = render({ ...base, plan: "pro", limit: 5, availableCount: 3, connectedCount: 3, projects: [project("a"), project("b"), project("c")] });
  const text = visible(html);
  assert.ok(text.includes("3 of 5 repositories connected on the Pro plan."));
  assert.doesNotMatch(text, /To connect another/);
  assert.match(newProjectClass(html), /\bbg-mine\b/);
  assert.equal(text.match(/Nothing open/g).length, 3);
});

it("draws the in-use boundary after a downgrade and offers Use this project only below it", () => {
  const html = render({ ...base, connectedCount: 3, availableCount: 1,
    notice: { basis: "recent-agent-activity", availableProjectIds: ["a"], at: "2026-09-30T00:00:00Z" },
    projects: [project("b", { available: false }), project("a"), project("c", { available: false })] });
  const text = visible(html);
  for (const line of ["3 repositories connected. The Free plan allows 1.",
    "After your plan changed, AAA stayed in use, chosen by the most recent agent activity.",
    "2 of your connected repositories are not selected, so they are read only. The Free plan allows 1 in use.",
    "A new repository needs a free slot, so disconnect the ones you no longer need."]) assert.ok(text.includes(line), line);
  const boundary = html.indexOf("Not selected, so read only.");
  assert.ok(boundary > html.indexOf('href="/p/aaa"'));
  assert.ok(boundary < html.indexOf('href="/p/bbb"') && boundary < html.indexOf('href="/p/ccc"'));
  const uses = [...html.matchAll(/<button\b[^>]*class="([^"]*)"[^>]*>Use this project<\/button>/g)];
  assert.equal(uses.length, 2);
  for (const use of uses) { assert.ok(use.index > boundary); assert.match(use[1], /\bborder-mine\b/); assert.match(use[1], /\btext-mine\b/); }
});

it("keeps preserved projects in their own group, including zero connected", () => {
  const html = render({ ...base, connectedCount: 0, availableCount: 0,
    projects: [project("a", { available: false, disconnectedAt: "2026-09-30T00:00:00.000Z", openItems: 2 })] });
  const text = visible(html);
  assert.ok(text.includes("0 of 1 repository connected on the Free plan."));
  assert.ok(text.includes("No connected repositories. Connect a new repository or reconnect a preserved project below."));
  assert.match(text, /\bConnected\b/); assert.match(text, /\bDisconnected\b/);
  assert.ok(text.includes("Disconnected 2026-09-30"));
  assert.match(html, /href="\/p\/aaa"/); assert.match(text, /Reconnect repository/);
  assert.doesNotMatch(text, /Use this project|More actions/);
});
