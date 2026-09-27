import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BacklogTable } from "./backlog-table.tsx";

it("preserves Source text, including removed rows, without any mutation controls", () => {
  const html = renderToStaticMarkup(createElement(BacklogTable, { slug: "test", canWrite: false, renderRowActions: () => { throw Error("must not run"); }, rows: [
    { type: null, addedBy: "owner", removedReason: null, key: "X-1", title: "Read me", area: "src", source: "Observation\nFull diagnosis", removedAt: new Date(), status: null },
  ] }));
  assert.match(html, /<details>/); assert.match(html, /Source/); assert.match(html, /Observation\nFull diagnosis/);
  assert.match(html, />Removed<\/span>/);
  assert.doesNotMatch(html, /<form|<button|\?edit=/);
});

it("shows type, author, empty area and each removal reason", () => {
  const rows = ["done", "owner", "discarded", null].map((removedReason, i) => ({
    key: `ITEM-0${i + 1}`, title: "title", type: i ? null : "fix", addedBy: i ? "owner" : "feature-scout",
    area: "", source: "", removedAt: new Date(), removedReason, status: null,
  }));
  const html = renderToStaticMarkup(createElement(BacklogTable, { slug: "test", canWrite: false, rows }));
  for (const text of ["Type", "Added by", "fix", "feature-scout", "You", "—", "Done", "Discarded"]) assert.ok(html.includes(text), text);
  assert.equal([...html.matchAll(/>Removed<\/span>/g)].length, 2);
});
