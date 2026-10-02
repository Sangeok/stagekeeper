import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ReactElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderToStaticMarkup as renderRaw } from "react-dom/server";

function renderToStaticMarkup(element: ReactElement): string {
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
  return renderRaw(createElement(AppRouterContext.Provider, { value: router }, element));
}
import { NewUserTokenForm } from "./new-user-token-form";

it("explains the optional management name before issuing a user token", () => {
  const html = renderToStaticMarkup(createElement(NewUserTokenForm, { issue: async () => ({ success: true as const, data: { token: "unused" } }), mcpUrl: "http://example.test/api/mcp" }));
  assert.match(html, /Token name/); assert.match(html, /Name the device or purpose so you can recognize this token later\./);
  assert.match(html, /name="label"/); assert.doesNotMatch(html, /required=""/);
});
