import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, isValidElement, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PipelineRail, AutomaticScoutControl, type SavePipelineAction, type SaveAutomaticScoutAction } from "@/fsd/features/edit-pipeline";
import { ProjectPipelinePage } from "./project-pipeline-page";

const graph = { nodes: ["plan", "implement", "accept"], gates: ["before-plan"] };
const now = new Date("2026-10-15T00:00:00Z");
const save: SavePipelineAction = async () => { throw new Error("render must not save"); };
const saveAutoScout: SaveAutomaticScoutAction = async () => { throw new Error("render must not scout"); };
const props = { projectId: "one", graph, saved: { version: 3, at: now }, now, plan: "pro", roster: ["dev"], editable: true, save, autoScoutEnabled: true, canChangeAutoScout: true, saveAutoScout };

it("keys the rail by project identity while preserving the exact injected Action references", () => {
  const inspect = (input: typeof props) => {
    const page = ProjectPipelinePage(input);
    assert.ok(isValidElement<{ children: unknown[] }>(page));
    const rail = page.props.children.find(child => isValidElement(child) && child.type === PipelineRail);
    const scout = page.props.children.find(child => isValidElement(child) && child.type === AutomaticScoutControl);
    assert.ok(isValidElement<{ save: SavePipelineAction; expectedVersion: number }>(rail));
    assert.ok(isValidElement<{ save: SaveAutomaticScoutAction }>(scout));
    assert.equal(rail.props.save, save);
    assert.equal(scout.props.save, saveAutoScout);
    assert.equal(rail.props.expectedVersion, input.saved.version);
    return rail.key;
  };
  assert.equal(inspect(props), "one");
  assert.equal(inspect({ ...props, saved: { version: 4, at: now }, plan: "free", editable: false }), "one");
  assert.equal(inspect({ ...props, projectId: "two" }), "two");
});

it("renders the saved snapshot description and read-only controls without invoking Actions", () => {
  for (const saved of [undefined, { version: 4, at: now }]) {
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider,
      { value: {} as ContextType<typeof AppRouterContext> },
      createElement(ProjectPipelinePage, { ...props, saved, editable: false, canChangeAutoScout: false, format: "slots-v1", unavailableReason: "Not selected" })));
    assert.ok(html.includes(saved ? "Version 4" : "Default pipeline · not saved yet"));
    assert.ok(html.includes("Execution format: slots-v1"));
    assert.ok(html.includes("Read as text"));
    assert.ok(html.includes("before Plan — you"));
    assert.ok(html.includes("Not selected"));
    assert.ok(!html.includes(">Save</button>"));
  }
});
