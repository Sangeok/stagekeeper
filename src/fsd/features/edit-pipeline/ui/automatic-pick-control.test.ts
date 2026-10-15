import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AUTO_PROPOSE_DISABLED_REASON, PIPELINE_EDIT_PLAN_GATE } from "@harness/core/pipeline.mjs";
import { AutomaticPickControl } from "./automatic-pick-control";

it("automatic picking shares the core off reason and disables writes for Free, unavailable projects and pending changes", () => {
  for (const enabled of [true, false]) for (const writable of [true, false]) for (const pending of [true, false]) {
    const html = renderToStaticMarkup(createElement(AutomaticPickControl, { enabled, writable, pending, onToggle() {} }));
    assert.match(html, new RegExp(`aria-checked="${enabled}"`));
    assert.equal(/<button[^>]* disabled=""/.test(html), !writable || pending);
    if (!enabled) assert.ok(html.includes(AUTO_PROPOSE_DISABLED_REASON));
    if (!writable) assert.ok(html.includes(PIPELINE_EDIT_PLAN_GATE));
  }
  const html = renderToStaticMarkup(createElement(AutomaticPickControl, { enabled: true, writable: false, pending: false, unavailableReason: "Disconnected", onToggle() {} }));
  assert.ok(html.includes("Disconnected")); assert.ok(!html.includes(PIPELINE_EDIT_PLAN_GATE));
});
