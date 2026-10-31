import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PipelineList } from "./pipeline-list";

it("the editor shows the current run rule without classifying pipelines or exposing routing fields", () => {
  const router = { refresh() {} } as ContextType<typeof AppRouterContext>;
  const success = async () => ({ success: true as const, data: null });
  for (const editable of [true, false]) {
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(PipelineList, {
      projectId: "p", pipelines: [{ id: "default_p", name: "Default", isDefault: true, definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, saved: null,
        runnable: { nodes: ["plan", "implement", "accept"], gates: ["before-plan"], format: "slots-v1" } }], rules: {}, autoProposeEnabled: true, now: new Date(), plan: editable ? "pro" : "free", roster: ["dev"], editable,
      save: async () => ({ status: "stale" as const }), actions: { archive: success, rename: success, setDefault: success, setRule: success, setAutomaticPick: success },
    })));
    assert.match(html, /Default selection:/); assert.match(html, /Initial configuration/);
    assert.doesNotMatch(html, /Runs items|Used inside/);
    for (const label of ["New pipeline", "Rename", "Archive"]) assert.equal(html.includes(`>${label}</button>`), editable);
    assert.doesNotMatch(html, /<select/);
    assert.match(html, />Run rules<\/button>/);
  }
});
