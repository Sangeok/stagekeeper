import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { withAppRouterTestContext } from "@/fsd/shared/lib/testing";
import { AutomaticScoutControl } from "./automatic-scout-control";

it("renders confirmed state and the read-only reason without a mutation", () => {
  let calls = 0;
  for (const enabled of [true, false]) {
    const html = renderToStaticMarkup(withAppRouterTestContext(createElement(AutomaticScoutControl, { enabled, writable: false, unavailableReason: "Not selected", save: async () => { calls++; return { success: true as const, data: enabled }; } })));
    assert.ok(html.includes('aria-checked="'+enabled+'"')); assert.match(html, /disabled|Not selected/);
  }
  assert.equal(calls, 0);
});
