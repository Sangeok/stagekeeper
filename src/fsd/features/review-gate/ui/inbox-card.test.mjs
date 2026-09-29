import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { InboxCard } from "./inbox-card.tsx";

const render = (item) => {
  const action = async () => ({ success: true });
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: { refresh() {} } },
    createElement(InboxCard, { item, now: item.updatedAt,
      transition: action, approve: action, discard: action, canWrite: true })));
};

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
  assert.match(html, /At Proposed it also takes the item out of the backlog/);
  assert.match(html, /at In review the item stays in the backlog/);
});

// 검증은 사용자가 고르는 것이다 — 기록이 없어도 카드는 경고하지 않는다(design.md 규칙 2).
it("approves an unverified plan with the same filled button and hint as a verified one, and no risk color", () => {
  const html = render(inReview("before-implement", null));
  assert.match(html, /title="No independent validation is on record\.">Not verified</);
  assert.match(html, /border-mine bg-mine text-on-mine[^"]*">Approve implementation</);
  assert.match(html, /Approving lets dev change code\. Then you run dev in Claude Code\./);
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
