import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultGraph } from "@harness/core/pipeline.mjs";
import { limitsFor } from "@harness/core/entitlement.mjs";

import { ACCEPTANCE_CHECK_LABELS, nodeLabel } from "@/fsd/entities/pipeline";
import { installCommands } from "@/fsd/shared/config/plugin-install";
import { copyLock, lockFailure, missingUnits, visibleText } from "@/fsd/shared/lib/copy-lock";
import type { DocsId } from "@/fsd/shared/routes/docs";

import { CLAUDE_COMMANDS, PLAN_FACTS } from "../model/docs-facts";
import { DOCS_PAGES } from "../model/docs-pages";
import { DocsApprovalGatesPage } from "./approval-gates-page";
import { DocsAutomationPage } from "./automation-page";
import { DocsGettingStartedPage } from "./getting-started-page";
import { DocsOverviewPage } from "./overview-page";
import { DocsSecurityPage } from "./security-page";
import { DocsShell } from "./docs-shell";

const pages: Record<DocsId, () => ReactElement> = {
  overview: DocsOverviewPage,
  "getting-started": DocsGettingStartedPage,
  automation: DocsAutomationPage,
  "approval-gates": DocsApprovalGatesPage,
  security: DocsSecurityPage,
};
const render = (id: DocsId) => renderToStaticMarkup(createElement(DocsShell, null, createElement(pages[id])));
const prose = (html: string) => visibleText(html.replace(/<(code|pre|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ""));
const retired = /\b(?:stamp(?:s|ed|ing)?|reject(?:s|ed|ing|ion|ions)?|tickets?|harness)\b/i;

it("locks all five metadata pairs and renders each real page with accessible navigation", () => {
  assert.deepEqual(DOCS_PAGES.flatMap((page) => [page.title, page.description]), copyLock("docs-meta"));
  for (const [index, page] of DOCS_PAGES.entries()) {
    const html = render(page.id);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, page.id);
    assert.ok(visibleText(html).includes(page.title), page.id);
    assert.ok(visibleText(html).includes(page.description), page.id);
    assert.equal([...html.matchAll(/aria-current="page"/g)].length, 1, page.id);
    assert.match(html, /href="#docs-content"/);
    assert.match(html, /<main[^>]+id="docs-content"/);
    const missing = missingUnits(copyLock("docs-shell"), html);
    assert.deepEqual(missing, [], lockFailure("docs-shell", missing));
    const navigation = html.match(/<nav\b[^>]*aria-label="Page navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(navigation, page.id);
    assert.equal(navigation.includes("Previous"), index > 0, page.id);
    assert.equal(navigation.includes("Next"), index < DOCS_PAGES.length - 1, page.id);
    if (index > 0) assert.ok(navigation.includes(`href="${DOCS_PAGES[index - 1].path}"`));
    if (index < DOCS_PAGES.length - 1) assert.ok(navigation.includes(`href="${DOCS_PAGES[index + 1].path}"`));
    assert.doesNotMatch(prose(html), /\b(?:AI|LLM)\b/, page.id);
    assert.doesNotMatch(prose(html), retired, page.id);
  }
});

it("renders the actual default flows, allowances, commands and acceptance names", () => {
  const overview = render("overview");
  const automation = render("automation");
  const approvals = render("approval-gates");
  const permissionRows = [...approvals.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => visibleText(cell[1]).trim()),
  );
  for (const plan of PLAN_FACTS) {
    const list = overview.match(new RegExp(`<ol[^>]*aria-label="${plan.name} default pipeline"[^>]*>([\\s\\S]*?)</ol>`))?.[1];
    assert.ok(list, plan.id);
    const names = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => visibleText(match[1]).replace(/^\d+/, "").trim());
    assert.deepEqual(names, defaultGraph(plan.id).nodes.map(nodeLabel));
    assert.doesNotMatch(list, /Propose/);
    const allowance = limitsFor(plan.id).dispatches;
    assert.ok(visibleText(automation).includes(allowance === Infinity ? "Unlimited" : String(allowance)));
    const limits = limitsFor(plan.id);
    assert.deepEqual(permissionRows.find((row) => row[0] === plan.name), [
      plan.name,
      limits.pipelineEdit ? "Editable" : "Default only",
      limits.sessionApprovals ? "Inbox or your session" : "Inbox",
    ]);
  }
  const gettingStarted = visibleText(render("getting-started"));
  for (const command of [...installCommands, CLAUDE_COMMANDS.init, CLAUDE_COMMANDS.watch]) assert.ok(gettingStarted.includes(command), command);
  assert.deepEqual(Object.keys(ACCEPTANCE_CHECK_LABELS), ["1", "2", "3", "4", "5"]);
  for (const name of Object.values(ACCEPTANCE_CHECK_LABELS)) assert.ok(visibleText(automation).includes(name), name);

});

it("checks inflections in prose while allowing protocol identifiers inside code", () => {
  for (const word of ["stamp", "stamps", "stamped", "stamping", "reject", "rejects", "rejected", "rejecting", "rejection", "rejections", "ticket", "tickets", "Harness"]) {
    assert.match(prose(`<p>${word}</p>`), retired);
    assert.doesNotMatch(prose(`<code>${word}</code><p>Stagekeeper</p>`), retired);
  }
});
