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
it("says on hover what each gate card means, on read-only plans too", () => {
  const graph = { nodes: ["propose", "plan", "implement", "accept"], gates: ["before-plan", "before-implement"] };
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, graph, editable: false }));
  // 칩이 아니라 카드 전체(바깥 div)에 붙는다 — 카드 어디에 올려도 보여야 한다.
  const titles = [...html.matchAll(/<div[^>]*\btitle="([^"]*)"[^>]*>(?:(?!<\/div>).)*?Gate · you/gs)].map((m) => m[1]);
  assert.deepEqual(titles, [
    "The item waits here until you press Request plan in the Inbox. Requesting lets dev write a plan. Then you run dev in Claude Code. Nothing changes in the code yet.",
    "The item waits here until you press Approve implementation in the Inbox. Approving lets dev change code. Then you run dev in Claude Code.",
  ]);
});
it("retains optional Remove and Swap actions on an editable graph", () => {
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, editable: true }));
  assert.match(html, />Remove<\/button>/); assert.match(html, />Swap<\/button>/);
  assert.equal([...html.matchAll(/>required<\/span>/g)].length, 3);
});
