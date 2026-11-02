import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { withAppRouterTestContext } from "@/fsd/shared/lib/testing";
import { ChangePipelineControl } from "./change-pipeline-control";

it("change control is absent without another runnable choice and requires explicit selection", () => {

  const render = (pipelines: { id: string; name: string }[]) => renderToStaticMarkup(withAppRouterTestContext(createElement(ChangePipelineControl, {
    itemKey: "ITEM-01", updatedAt: new Date(0).toISOString(), pipelines, change: async () => ({ success: true as const, data: null }),
  })));
  assert.equal(render([]), "");
  const html = render([{ id: "next", name: "Hotfix" }]);
  assert.match(html, /Choose a pipeline/); assert.match(html, /<option value="next">Hotfix/); assert.match(html, /<button[^>]*disabled/);
});
