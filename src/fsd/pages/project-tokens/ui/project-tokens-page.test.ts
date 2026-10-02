import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectTokensPage, type TokenRow } from "./project-tokens-page";

const issue = async () => ({ success: true as const, data: { token: "unused" } });
const revoke = async () => {};
const row = (id: string, overrides: Partial<TokenRow> = {}): TokenRow => ({ id, label: id, createdAt: new Date("2026-10-02T00:00:00Z"), revokedAt: null, lastUsedAt: null, usageTrackingStartedAt: null, ...overrides });

it("renders both six-column tables, scopes and recorded usage while keeping revoked rows", () => {
  const html = renderToStaticMarkup(createElement(ProjectTokensPage, {
    issueAllowed: true, ownerAllowed: true, issue, issueOwner: issue, revoke, revokeOwner: revoke,
    mcpUrl: "http://example.test/api/mcp", ownerMcpUrl: "http://example.test/api/mcp/owner",
    tokens: [row("legacy"), row("fresh", { usageTrackingStartedAt: new Date() })],
    ownerTokens: [row("old-owner", { revokedAt: new Date(), lastUsedAt: new Date("2026-10-02T03:04:05Z") })],
  }));
  assert.equal((html.match(/<th(?:\s|>)/g) ?? []).length, 12);
  assert.match(html, /href="\/settings\/tokens"/); assert.match(html, /Create separate tokens for different devices or uses/);
  assert.match(html, /Unknown/); assert.match(html, /Never used/); assert.match(html, /2026-10-02 03:04 UTC/);
  assert.match(html, /owner:old-owner/); assert.match(html, /Revoked/);
  assert.equal((html.match(/>Revoke</g) ?? []).length, 2);
});

it("keeps Free owner revocation and hides issue forms for unavailable projects", () => {
  for (const issueAllowed of [true, false]) {
    const html = renderToStaticMarkup(createElement(ProjectTokensPage, {
      issueAllowed, ownerAllowed: false, issue, issueOwner: issue, revoke, revokeOwner: revoke,
      mcpUrl: "http://example.test/api/mcp", ownerMcpUrl: "http://example.test/api/mcp/owner",
      tokens: [], ownerTokens: [row("leftover")],
    }));
    assert.match(html, /colSpan="6"|colspan="6"/); assert.match(html, />Revoke</);
    assert.doesNotMatch(html, /Issue owner token/);
    if (!issueAllowed) assert.doesNotMatch(html, /Issue token|Issue one above/);
  }
});
