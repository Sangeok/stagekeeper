import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TokenRow } from "../model/token-row";
import { TokenTable } from "./token-table";

const at = new Date("2026-10-04T12:00:00Z");
const row = (id: string, fields: Partial<TokenRow> = {}): TokenRow => ({ id, label: id, createdAt: new Date("2026-10-03T23:00:00-02:00"), revokedAt: null, expiresAt: null, lastUsedAt: null, usageTrackingStartedAt: null, ...fields });

it("all token scopes share UTC columns and ended classification while only revoked skips the revoke slot", () => {
  const tokens = [row("unknown"), row("never", { usageTrackingStartedAt: at }), row("expired", { expiresAt: new Date(at.getTime() - 1) }), row("revoked", { revokedAt: at, lastUsedAt: at })];
  const before = structuredClone(tokens);
  for (const reference of ["token", "owner", "user"] as const) {
    const revoked: string[] = [];
    const headingLevel = reference === "user" ? 2 : 3;
    const html = renderToStaticMarkup(createElement(TokenTable, { tokens, at, reference, headingLevel, empty: "scope empty", renderName: token => `name:${token.label}`, renderRevoke: token => { revoked.push(token.id); return "Revoke"; } }));
    assert.equal((html.match(/<th(?:\s|>)/g) ?? []).length, 14);
    assert.equal((html.match(new RegExp(`<h${headingLevel} `, "g")) ?? []).length, 2);
    for (const label of ["2026-10-04", "Unknown", "Never used", "Expired", "Revoked", `${reference}:revoked`]) assert.ok(html.includes(label), label);
    assert.deepEqual(revoked, ["unknown", "never", "expired"]);
    assert.deepEqual(tokens, before);
  }
});

it("empty tables retain the supplied scope copy, seven-column spans and ended copy", () => {
  const html = renderToStaticMarkup(createElement(TokenTable, { tokens: [], at, reference: "owner", headingLevel: 3, empty: "No owner tokens.", renderName: token => token.label, renderRevoke: () => "Revoke" }));
  assert.ok(html.includes("No owner tokens."));
  assert.ok(html.includes("No ended tokens."));
  assert.equal((html.match(/col[Ss]pan="7"/g) ?? []).length, 2);
});
