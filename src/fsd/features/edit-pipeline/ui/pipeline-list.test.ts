import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { withAppRouterTestContext } from "@/fsd/shared/lib/testing";
import { PipelineList } from "./pipeline-list";

it("opens a browsable catalog without mounting an editor or exposing routing dropdowns", () => {

  const success = async () => ({ success: true as const, data: null });
  for (const editable of [true, false]) {
    const html = renderToStaticMarkup(withAppRouterTestContext(createElement(PipelineList, {
      projectId: "p", pipelines: [{ id: "default_p", name: "Default", isDefault: true, definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, saved: null,
        runnable: { nodes: ["plan", "implement", "accept"], gates: ["before-plan"], format: "slots-v1" } }], rules: {}, now: new Date(), plan: editable ? "pro" : "free", roster: ["dev"], editable,
      save: async () => ({ status: "stale" as const }), actions: { archive: success, rename: success, setDefault: success, setRule: success },
    })));
    assert.match(html, /All pipelines/); assert.match(html, /Plan → Implement → Accept/);
    assert.match(html, /Search by name or step/);
    assert.equal(html.includes('>New pipeline</button>'), editable);
    assert.doesNotMatch(html, /Pipeline editor|>Rename<|>Archive<|Runs items|Used inside/);
    assert.doesNotMatch(html, /<select\b|aria-label="Pipeline routing"/);
    assert.match(html, /Default selection:/);
    assert.match(html, />Run rules<\/button>/);
  }
});
