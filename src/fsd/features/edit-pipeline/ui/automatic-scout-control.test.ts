import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AutomaticScoutControl } from "./automatic-scout-control";

// Pending/refusal/unknown response cases are exercised by actual React in the browser.
it("renders confirmed state and the read-only reason without a mutation", () => {
  let calls = 0;
  for (const enabled of [true, false]) {
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: {} as ContextType<typeof AppRouterContext> }, createElement(AutomaticScoutControl, { enabled, writable: false, unavailableReason: "Not selected", save: async () => { calls++; return { success: true as const, data: enabled }; } })));
    assert.ok(html.includes('aria-checked="'+enabled+'"')); assert.match(html, /disabled|Not selected/);
  }
  assert.equal(calls, 0);
});
