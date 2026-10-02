import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewUserTokenForm } from "./new-user-token-form";

it("explains the optional management name before issuing a user token", () => {
  const html = renderToStaticMarkup(createElement(NewUserTokenForm, { issue: async () => ({ success: true as const, data: { token: "unused" } }), mcpUrl: "http://example.test/api/mcp" }));
  assert.match(html, /Token name/); assert.match(html, /Name the device or purpose so you can recognize this token later\./);
  assert.match(html, /name="label"/); assert.doesNotMatch(html, /required=""/);
});
