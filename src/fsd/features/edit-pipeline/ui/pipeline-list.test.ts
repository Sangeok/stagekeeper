import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PipelineList } from "./pipeline-list";

it("shows pipeline editing and picking controls without the old routing dropdowns", () => {
  const router = { refresh() {} } as ContextType<typeof AppRouterContext>;
  const success = async () => ({ success: true as const, data: null });
  for (const editable of [true, false]) {
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(PipelineList, {
      projectId: "p", pipelines: [{ id: "default_p", name: "Default", isDefault: true, definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, saved: null,
        runnable: { nodes: ["plan", "implement", "accept"], gates: ["before-plan"], format: "slots-v1" } }], rules: {}, autoProposeEnabled: true, now: new Date(), plan: editable ? "pro" : "free", roster: ["dev"], editable,
      save: async () => ({ status: "stale" as const }), actions: { archive: success, rename: success, setDefault: success, setRule: success, setAutomaticPick: success },
    })));
    assert.match(html, /Runs items/); assert.match(html, /Default pipeline · not saved yet/);
    for (const label of ["New pipeline", "Rename", "Archive"]) assert.equal(html.includes(`>${label}</button>`), editable);
    assert.doesNotMatch(html, /<select\b|aria-label="Pipeline routing"/);
    assert.equal(/<button[^>]*aria-label="Automatic picking"[^>]*disabled/.test(html), !editable);
  }
});
