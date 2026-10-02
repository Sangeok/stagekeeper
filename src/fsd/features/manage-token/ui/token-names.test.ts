import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewTokenForm } from "./new-token-form";
import { NewOwnerTokenForm } from "./new-owner-token-form";

it("explains the optional management name for agent and owner tokens without changing input contracts", () => {
  const issue = async () => ({ success: true as const, data: { token: "unused" } });
  for (const html of [renderToStaticMarkup(createElement(NewTokenForm, { issue, mcpUrl: "http://example.test/api/mcp" })), renderToStaticMarkup(createElement(NewOwnerTokenForm, { issue, ownerMcpUrl: "http://example.test/api/mcp/owner" }))]) {
    assert.match(html, /Token name/); assert.match(html, /Name the device or purpose so you can recognize this token later\./);
    assert.match(html, /name="label"/); assert.doesNotMatch(html, /required=""/);
  }
});
