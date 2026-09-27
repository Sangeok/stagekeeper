import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PipelineRail } from "./pipeline-rail.tsx";

const props = {
  graph: { nodes: ["propose", "plan", "verify", "implement", "accept", "doc-audit", "scout"], gates: [] },
  plan: "pro", roster: ["dev"], save: async () => ({ success: true, data: undefined }),
};
it("keeps required labels structural when editing is unavailable", () => {
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, editable: false, unavailableReason: "Not selected" }));
  assert.equal([...html.matchAll(/>required<\/span>/g)].length, 3);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /Not selected/);
});
it("retains optional Remove and Swap actions on an editable graph", () => {
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, editable: true }));
  assert.match(html, />Remove<\/button>/); assert.match(html, />Swap<\/button>/);
  assert.equal([...html.matchAll(/>required<\/span>/g)].length, 3);
});

it("shows autonomous scout guidance only when no scout slot exists", () => {
  for (const node of [null, "scout", "feature-scout", "feature-scout#2"]) {
    const nodes = ["plan", "implement", "accept", ...(node ? [node] : [])];
    const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, editable: true, graph: { nodes, gates: [] } }));
    assert.equal(html.includes("Scout also runs on its own"), node === null, String(node));
  }
});
