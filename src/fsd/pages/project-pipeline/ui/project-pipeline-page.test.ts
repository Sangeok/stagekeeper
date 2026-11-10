import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { withAppRouterTestContext } from "@/fsd/shared/lib/testing";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { PipelineList, type SavePipelineAction } from "@/fsd/features/edit-pipeline";
import { ProjectPipelinePage } from "./project-pipeline-page";

const graph = { nodes: ["plan", "implement", "accept"], gates: ["before-plan"] };
const now = new Date("2026-10-15T00:00:00Z");
const save: SavePipelineAction = async () => { throw new Error("render must not save"); };
const settings = async (): Promise<never> => { throw new Error("render must not change settings"); };
const props: Parameters<typeof ProjectPipelinePage>[0] = {
  projectId: "one", pipelines: [{ id: "default", name: "Default", isDefault: true,
    definition: { steps: graph.nodes, gates: graph.gates }, saved: { version: 3, createdAt: now }, runnable: { ...graph, format: "slots-v1" } }],
  rules: {}, now, plan: "pro", roster: ["dev"], editable: true, save,
  actions: { archive: settings, rename: settings, setDefault: settings, setRule: settings },
};

it("keys the pipeline editor by project identity while preserving the exact injected Action references", () => {
  const inspect = (input: typeof props) => {
    const page = ProjectPipelinePage(input);
    assert.ok(isValidElement<{ children: unknown[] }>(page));
    const list = page.props.children.find(child => isValidElement(child) && child.type === PipelineList);
    assert.ok(isValidElement<Parameters<typeof PipelineList>[0]>(list));
    assert.equal(Object.hasOwn(list.props, "automationControls"), false);
    assert.equal(list.props.save, save);
    assert.equal(list.props.actions, props.actions);
    assert.equal(list.props.pipelines, input.pipelines);
    return list.key;
  };
  assert.equal(inspect(props), "one");
  assert.equal(inspect({ ...props, plan: "free", editable: false }), "one");
  assert.equal(inspect({ ...props, projectId: "two" }), "two");
});

it("renders saved definition descriptions and read-only controls without invoking Actions", () => {
  for (const saved of [null, { version: 4, createdAt: now }]) {
    const html = renderToStaticMarkup(withAppRouterTestContext(createElement(SearchParamsContext.Provider, { value: new URLSearchParams("pipeline=default") },
      createElement(ProjectPipelinePage, { ...props, pipelines: [{ ...props.pipelines[0], saved }], editable: false, unavailableReason: "Not selected" }))));
    assert.ok(html.includes(saved ? "Version 4 · saved" : "Initial configuration · changes apply to future runs."));
    assert.ok(html.includes("changes apply to future runs."));
    assert.ok(!html.includes("applies to items proposed from now on"));
    assert.ok(html.includes("Default selection:"));
    assert.ok(!html.includes("Runs items"));
    assert.ok(!html.includes("Used inside"));
    assert.ok(html.includes("Read as text"));
    assert.ok(html.includes("before Plan — you"));
    assert.ok(html.includes("Not selected"));
    assert.ok(!html.includes(">Save</button>"));
  }
});

it("renders a new draft status separately from saved or virtual configuration descriptions", () => {
  const html = renderToStaticMarkup(withAppRouterTestContext(createElement(SearchParamsContext.Provider, { value: new URLSearchParams("pipeline=new") },
    createElement(ProjectPipelinePage, props))));
  assert.ok(html.includes("Not saved yet"));
  assert.ok(!html.includes("Initial configuration") && !html.includes("changes apply to future runs."));
});
