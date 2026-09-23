import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BacklogTable } from "./backlog-table.tsx";

it("preserves Source text, including removed rows, without any mutation controls", () => {
  const html = renderToStaticMarkup(createElement(BacklogTable, { slug: "test", canWrite: false, renderRowActions: () => { throw Error("must not run"); }, rows: [
    { key: "X-1", title: "Read me", area: "src", source: "Observation\nFull diagnosis", removedAt: new Date(), status: null },
  ] }));
  assert.match(html, /<details>/); assert.match(html, /Source/); assert.match(html, /Observation\nFull diagnosis/);
  assert.match(html, />Removed<\/span>/);
  assert.doesNotMatch(html, /<form|<button|\?edit=/);
});
