import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UserTokensPage, type UserTokenRow } from "./user-tokens-page";

it("renders account scope, all usage states and six-column empty layout", () => {
  const props = { issue: async () => ({ success: true as const, data: { token: "unused" } }), revoke: async () => {}, mcpUrl: "http://example.test/api/mcp" };
  const base: UserTokenRow = { id: "legacy", label: "laptop", createdAt: new Date(), revokedAt: null, lastUsedAt: null, usageTrackingStartedAt: null };
  const html = renderToStaticMarkup(createElement(UserTokensPage, { ...props, tokens: [base, { ...base, id: "fresh", usageTrackingStartedAt: new Date() }, { ...base, id: "used", revokedAt: new Date(), lastUsedAt: new Date("2026-10-02T03:04:05Z") }] }));
  assert.equal((html.match(/<th(?:\s|>)/g) ?? []).length, 6);
  for (const text of [/Unknown/, /Never used/, /2026-10-02 03:04 UTC/, /user:used/, /Revoked/, /does not replace an owner token/, /Create separate tokens/]) assert.match(html, text);
  assert.equal((html.match(/>Revoke</g) ?? []).length, 2);
  const empty = renderToStaticMarkup(createElement(UserTokensPage, { ...props, tokens: [] }));
  assert.match(empty, /colSpan="6"|colspan="6"/);
});
