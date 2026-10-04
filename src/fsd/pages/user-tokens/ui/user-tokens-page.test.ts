import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ReactElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderToStaticMarkup as renderRaw } from "react-dom/server";

function renderToStaticMarkup(element: ReactElement): string {
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
  return renderRaw(createElement(AppRouterContext.Provider, { value: router }, element));
}
import { UserTokensPage, type UserTokenRow } from "./user-tokens-page";

it("renders account scope, all usage states and seven-column empty layout", () => {
  const props = { rename: async () => ({ success: true as const, data: null }), at: new Date("2026-10-02T06:00:00Z"), issue: async () => ({ success: true as const, data: { token: "unused" } }), revoke: async () => {}, mcpUrl: "http://example.test/api/mcp" };
  const base: UserTokenRow = { id: "legacy", label: "laptop", createdAt: new Date(), expiresAt: null, revokedAt: null, lastUsedAt: null, usageTrackingStartedAt: null };
  const html = renderToStaticMarkup(createElement(UserTokensPage, { ...props, tokens: [base, { ...base, id: "fresh", usageTrackingStartedAt: new Date() }, { ...base, id: "used", expiresAt: null, revokedAt: new Date(), lastUsedAt: new Date("2026-10-02T03:04:05Z") }] }));
  assert.equal((html.match(/<th(?:\s|>)/g) ?? []).length, 14);
  for (const text of [/Unknown/, /Never used/, /2026-10-02 03:04 UTC/, /user:used/, /Revoked/, /does not replace an owner token/, /Create separate tokens/]) assert.match(html, text);
  assert.equal((html.match(/>Revoke</g) ?? []).length, 2);
  assert.equal((html.match(/<h2 /g) ?? []).length, 2);
  assert.equal((html.match(/>Save name</g) ?? []).length, 3);
  const empty = renderToStaticMarkup(createElement(UserTokensPage, { ...props, tokens: [] }));
  assert.match(empty, /colSpan="7"|colspan="7"/);
});
