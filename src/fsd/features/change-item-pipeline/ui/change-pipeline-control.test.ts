import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ChangePipelineControl } from "./change-pipeline-control";

it("change control is absent without another runnable choice and requires explicit selection", () => {
  const router = { refresh() {} } as ContextType<typeof AppRouterContext>;
  const render = (pipelines: { id: string; name: string }[]) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(ChangePipelineControl, {
    itemKey: "ITEM-01", updatedAt: new Date(0).toISOString(), pipelines, change: async () => ({ success: true as const, data: null }),
  })));
  assert.equal(render([]), "");
  const html = render([{ id: "next", name: "Hotfix" }]);
  assert.match(html, /Choose a pipeline/); assert.match(html, /<option value="next">Hotfix/); assert.match(html, /<button[^>]*disabled/);
});
