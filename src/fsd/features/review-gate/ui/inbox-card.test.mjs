import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { InboxCard } from "./inbox-card.tsx";
import { inboxReadOnlyLabel } from "../model/inbox-item.ts";
import { blobHref, DOC_LINK_NOTE } from "@/fsd/entities/board-item";

const render = (item, props = {}) => {
  const action = async () => ({ success: true });
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: { refresh() {} } },
    createElement(InboxCard, { item, now: item.updatedAt,
      transition: action, approve: action, discard: action, canWrite: true, ...props })));
};

it("the rendered Inbox anchor keeps reserved filename data and the recorded commit note", () => {
  const path = "docs/#?% 한글.md";
  const planUrl = blobHref({ owner: "o", repo: "r", branch: "feature/branch" }, path, "commit");
  const html = render({ ...inReview("before-implement", null), planPath: path, planUrl, planCommit: "commit" });
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"));
  assert.ok(hrefs.includes(planUrl));
  const url = new URL(hrefs.find(href => href === planUrl));
  assert.equal(url.hash, ""); assert.equal(url.search, "");
  assert.equal(decodeURIComponent(url.pathname), `/o/r/blob/commit/${path}`);
  assert.ok(html.includes(DOC_LINK_NOTE));
});

it("uses the precise readonly label and hides every write control and execution guidance", () => {
  for (const [code, label] of [["disconnected", "Disconnected"], ["not-selected", "Not selected"], ["integrity", "Read only"]]) {
    const html = render(inReview("before-implement", null), { canWrite: false, readOnlyLabel: inboxReadOnlyLabel({ available: false, code }) });
    assert.ok(html.includes(`>${label}</span>`));
    for (const other of ["Disconnected", "Not selected", "Read only"].filter((value) => value !== label)) assert.ok(!html.includes(`>${other}</span>`));
    assert.doesNotMatch(html, /Approve implementation|Request plan|Continue<|Send back|Discard|Resume|Approving lets dev|run dev in Claude Code/);
  }
});

const inReview = (gate, validation) => ({ key: "ITEM-02", title: "Replay the trick steps", type: "feat", area: "component/",
  agent: "web-dev", status: "in_review", gate, reason: "Users asked for it", results: [], validation,
  planPath: "docs/plans/ITEM-02.md", planUrl: "https://github.com/o/r/blob/0ff233d/docs/plans/ITEM-02.md",
  planCommit: "0ff233d0000000000000000000000000000000000", proposedBy: "pm", proposedOn: "2026-09-26T00:00:00Z",
  statusSince: "2026-09-28T00:00:00Z", heldFrom: null, updatedAt: "2026-09-28T00:00:00Z" });

it("shows classification at the gate and explains the two discard outcomes", () => {
  const item = { key: "ITEM-01", title: "Fix a confirmed defect", type: "fix", area: ".", agent: "dev",
    status: "proposed", gate: "before-plan", reason: "Confirmed in code", results: [], validation: null,
    planPath: null, planUrl: null, planCommit: null, proposedBy: "pm", proposedOn: "2026-09-26T00:00:00Z",
    statusSince: "2026-09-26T00:00:00Z", heldFrom: null, updatedAt: "2026-09-26T00:00:00Z" };
  const html = render(item);
  assert.match(html, />fix<\/span>/);
  assert.match(html, /Request plan/);
  assert.match(html, /Requesting lets dev write a plan\. Then continue in your coding client\. Nothing changes in the code yet\./);
  assert.match(html, /Neither starts dev — your coding client session does\./);
  assert.match(html, /At Proposed it also takes the item out of the backlog/);
  assert.match(html, /at In review the item stays in the backlog/);
});

it("hides the new before-plan hint and help when the card is read-only", () => {
  const item = { ...inReview("before-plan", null), status: "proposed" };
  const html = render(item, { canWrite: false, readOnlyLabel: "Disconnected" });
  assert.doesNotMatch(html, /Requesting lets dev|Neither starts dev|your coding client session does/);
});

// 검증은 사용자가 고르는 것이다 — 기록이 없어도 카드는 경고하지 않는다(design.md 규칙 2).
it("approves an unverified plan with the same filled button and hint as a verified one, and no risk color", () => {
  const html = render(inReview("before-implement", null));
  assert.match(html, /title="No independent validation is on record\.">Not verified</);
  assert.match(html, /border-mine bg-mine text-on-mine[^"]*">Approve implementation</);
  assert.match(html, /Approving lets dev change code\. Then continue in your coding client\./);
  assert.doesNotMatch(html, /No validation yet|unverified plan|Run plan-verifier/);
  assert.doesNotMatch(html, /text-risk|bg-risk-soft/);
});

it("says the Verify step comes next when the card waits before it", () => {
  const html = render(inReview("before-verify", null));
  assert.match(html, /title="The Verify step comes next\.">Not verified</);
  assert.doesNotMatch(html, /text-risk|bg-risk-soft/);
});

it("shows the validation record behind a quiet Verified chip", () => {
  const html = render(inReview("before-implement", "clean pass (2026-09-28, 2 rounds, no edits)"));
  assert.match(html, /title="clean pass \(2026-09-28, 2 rounds, no edits\)">Verified</);
  assert.doesNotMatch(html, />Not verified<\/span>/);
});
