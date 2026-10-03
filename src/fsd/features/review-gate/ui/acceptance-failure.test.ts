import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { AcceptanceFailure, type AcceptanceFailureView } from "./acceptance-failure";

const noop = () => {};
const router = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, bfcacheId: "test" };
const failure: AcceptanceFailureView = { id: "f", checks: [3, 5], note: "<script>failed</script>", path: "docs/failure.md", href: "https://github.com/o/r/blob/abc/docs/failure.md", at: "2026-10-03 01:02" };
const render = (value: AcceptanceFailureView | null, canWrite = true) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
  createElement(AcceptanceFailure, { failure: value, canWrite, itemKey: "K-1", updatedAt: "2026-10-03T01:02:00Z", retryAcceptance: async () => ({ success: true as const, data: undefined }) })));
it("renders escaped evidence, check labels, UTC minute and an optional committed record", () => {
  const html = render(failure);
  for (const text of ["Acceptance failed", "3 Verify command · 5 Report record", "2026-10-03 01:02", "Failure record ↗", "Run acceptance again", "main loop runs all five checks again"]) assert.ok(html.includes(text));
  assert.ok(!html.includes("<script>")); assert.match(html, /&lt;script&gt;/);
  assert.equal(render(null), "");
  assert.ok(!render({ ...failure, path: null, href: null }).includes("Failure record"));
});
it("read-only retains evidence while hiding the action and execution guidance", () => {
  const html = render(failure, false);
  assert.ok(html.includes("Acceptance failed")); assert.ok(html.includes("Failure record"));
  assert.ok(!html.includes("<button")); assert.ok(!html.includes("When /harness:watch"));
});
