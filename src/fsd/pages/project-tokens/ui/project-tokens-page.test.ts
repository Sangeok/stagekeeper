import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ReactElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderToStaticMarkup as renderRaw } from "react-dom/server";

function renderToStaticMarkup(element: ReactElement): string {
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
  return renderRaw(createElement(AppRouterContext.Provider, { value: router }, element));
}
import { ProjectTokensPage, type TokenRow } from "./project-tokens-page";

const issue = async () => ({ success: true as const, data: { token: "unused" } });
const revoke = async () => {};
const row = (id: string, overrides: Partial<TokenRow> = {}): TokenRow => ({ id, label: id, createdAt: new Date("2026-10-02T00:00:00Z"), expiresAt: null, revokedAt: null, lastUsedAt: null, usageTrackingStartedAt: null, ...overrides });

it("renders active and ended seven-column tables, scopes and recorded usage while keeping revoked rows", () => {
  const html = renderToStaticMarkup(createElement(ProjectTokensPage, {
    issueAllowed: true, ownerAllowed: true, issue, issueOwner: issue, revoke, revokeOwner: revoke, rename: async () => ({ success: true as const, data: null }), renameOwner: async () => ({ success: true as const, data: null }), at: new Date("2026-10-02T06:00:00Z"),
    mcpUrl: "http://example.test/api/mcp", ownerMcpUrl: "http://example.test/api/mcp/owner",
    tokens: [row("legacy"), row("fresh", { usageTrackingStartedAt: new Date() })],
    ownerTokens: [row("old-owner", { revokedAt: new Date(), lastUsedAt: new Date("2026-10-02T03:04:05Z") })],
  }));
  assert.equal((html.match(/<th(?:\s|>)/g) ?? []).length, 28);
  assert.match(html, /href="\/settings\/tokens"/); assert.match(html, /Create separate tokens for different devices or uses/);
  assert.match(html, /Unknown/); assert.match(html, /Never used/); assert.match(html, /2026-10-02 03:04 UTC/);
  assert.match(html, /owner:old-owner/); assert.match(html, /Revoked/);
  assert.equal((html.match(/>Revoke</g) ?? []).length, 2);
  assert.equal((html.match(/<h3 /g) ?? []).length, 4);
});

it("keeps Free owner revocation and hides issue forms for unavailable projects", () => {
  for (const issueAllowed of [true, false]) {
    const html = renderToStaticMarkup(createElement(ProjectTokensPage, {
      issueAllowed, ownerAllowed: false, issue, issueOwner: issue, revoke, revokeOwner: revoke, rename: async () => ({ success: true as const, data: null }), renameOwner: async () => ({ success: true as const, data: null }), at: new Date("2026-10-02T06:00:00Z"),
      mcpUrl: "http://example.test/api/mcp", ownerMcpUrl: "http://example.test/api/mcp/owner",
      tokens: [], ownerTokens: [row("leftover", { expiresAt: new Date("2026-10-01T00:00:00Z") })],
    }));
    assert.match(html, /colSpan="7"|colspan="7"/); assert.match(html, />Revoke</);
    assert.doesNotMatch(html, /Issue owner token/);
    if (!issueAllowed) assert.doesNotMatch(html, /Issue token|Issue one above/);
    assert.equal(html.includes("Save name"), issueAllowed, "owner rename follows project availability, including Free");
  }
});
