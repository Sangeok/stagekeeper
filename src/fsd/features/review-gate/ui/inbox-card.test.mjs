import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { InboxCard } from "./inbox-card.tsx";

it("shows classification at the gate and explains the two discard outcomes", () => {
  const item = { key: "ITEM-01", title: "Fix a confirmed defect", type: "fix", area: ".", agent: "dev",
    status: "proposed", gate: "before-plan", reason: "Confirmed in code", results: [], validation: null,
    planPath: null, planUrl: null, planCommit: null, proposedBy: "pm", proposedOn: "2026-09-26T00:00:00Z",
    statusSince: "2026-09-26T00:00:00Z", heldFrom: null, updatedAt: "2026-09-26T00:00:00Z" };
  const action = async () => ({ success: true });
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: { refresh() {} } },
    createElement(InboxCard, { item, now: item.updatedAt,
      transition: action, approve: action, discard: action, canWrite: true })));
  assert.match(html, />fix<\/span>/);
  assert.match(html, /Request plan/);
  assert.match(html, /At Proposed it also takes the item out of the backlog/);
  assert.match(html, /at In review the item stays in the backlog/);
});
