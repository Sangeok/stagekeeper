import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PipelineRail } from "./pipeline-rail.tsx";

const props = {
  pipelineId: "default", rules: {}, pipelines: [{ id: "default", name: "Default", isDefault: true, definition: { steps: ["plan", "implement", "accept"], gates: [] }, saved: null, runnable: { nodes: ["plan", "implement", "accept"], gates: [], format: "slots-v1" } }],
  definition: { steps: ["plan", "verify", "implement", "accept", "doc-audit", "scout"], gates: [] },
  plan: "pro", roster: ["dev"], expectedVersion: 0, save: async () => ({ status: "success", pipelineId: "default", version: 1 }),
};

it("ungated edges explain every automatic step including first Plan and repeated slots", () => {
  for (const editable of [true, false]) {
    const definition = { steps: ["plan", "verify", "implement", "accept", "doc-auditor#2", "feature-scout#2"], gates: [] };
    const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, definition, editable }));
    for (const label of ["planning", "verify", "implementing", "accept", "doc audit #2", "discover work #2"]) assert.ok(html.includes(`auto → ${label}`));
    assert.equal(html.includes("+"), editable);
  }
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, definition: { steps: ["plan", "implement", "accept"], gates: ["before-accept"] }, editable: false }));
  assert.ok(!html.includes("auto → accept")); assert.match(html, /Gate · you/);
});
it("keeps required labels structural when editing is unavailable", () => {
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, editable: false, unavailableReason: "Not selected" }));
  assert.equal([...html.matchAll(/>required<\/span>/g)].length, 3);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /Not selected/);
});
it("says on hover what each gate card means, on read-only plans too", () => {
  const definition = { steps: ["plan", "implement", "accept"], gates: ["before-plan", "before-implement"] };
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, definition, editable: false }));
  const titles = [...html.matchAll(/<div[^>]*\btitle="([^"]*)"[^>]*>(?:(?!<\/div>).)*?Gate · you/gs)].map((m) => m[1]);
  assert.deepEqual(titles, [
    "The item waits here until you press Request plan in the Inbox. Requesting lets dev write a plan. Then continue in your coding client. Nothing changes in the code yet.",
    "The item waits here until you press Approve implementation in the Inbox. Approving lets dev change code. Then continue in your coding client.",
  ]);
});
it("retains optional Remove and Swap actions on an editable graph", () => {
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, editable: true }));
  assert.match(html, />Remove<\/button>/); assert.match(html, />Swap<\/button>/);
  assert.equal([...html.matchAll(/>required<\/span>/g)].length, 3);
});

it("renders a saved fragment's server definition in cursor order without a runnable graph", () => {
  const definition = { steps: ["qa"], gates: ["before-qa"] };
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, pipelineId: "fragment", definition, editable: false,
    pipelines: [{ id: "fragment", name: "Check", isDefault: false, saved: { version: 1, createdAt: new Date(0) }, definition: { steps: ["impl-verify"], gates: [] }, runnable: null }] }));
  const text = html.match(/<details[^>]*>([\s\S]*?)<\/details>/)?.[1];
  assert.ok(text);
  assert.match(text, /<li[^>]*>1\. before QA — you<\/li><li[^>]*>2\. QA<\/li>/);
  assert.doesNotMatch(text, /Implementation check/);
});

it("renders the saved expansion error when a referenced pipeline is missing", () => {
  const html = renderToStaticMarkup(createElement(PipelineRail, { ...props, editable: false,
    definition: { steps: ["pipeline:missing"], gates: [] } }));
  const text = html.match(/<details[^>]*>([\s\S]*?)<\/details>/)?.[1];
  assert.ok(text);
  assert.match(text, /it uses a pipeline that is archived or missing/);
  assert.doesNotMatch(text, /<ol/);
});
