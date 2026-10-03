import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyButton } from "./copy-button";

// Async duplicate/rejection/text-change/unmount cases use the actual browser fixture.
it("offers an accessible copy button without rendering its secret payload", () => {
  const html = renderToStaticMarkup(createElement(CopyButton, { text: "secret-value" }));
  assert.match(html, />Copy<\/button>/); assert.doesNotMatch(html, /secret-value| disabled="/);
});
