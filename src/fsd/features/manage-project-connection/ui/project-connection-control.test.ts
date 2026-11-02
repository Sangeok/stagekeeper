import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { withAppRouterTestContext } from "@/fsd/shared/lib/testing";
import { ProjectConnectionControl } from "./project-connection-control";

const action = async () => ({ status: "success" as const });
const render = (disconnected: boolean) => renderToStaticMarkup(withAppRouterTestContext(createElement(ProjectConnectionControl, {
  target: { id: "a", name: "Alpha", repoOwner: "owner", repo: "repo", disconnectedAt: disconnected ? "2026-10-04" : null },
  summary: { plan: "free", version: 4, limit: 1, connectedCount: 1 }, disconnect: action, reconnect: action,
})));
const focusTrigger = (html: string) => html.match(/<button[^>]*\bid="project-connection-a"[^>]*>[^<]*/)?.[0] ?? "";

it("keeps disconnect in More actions and blocks reconnect above the current cap", () => {
  assert.match(render(false), /More actions for Alpha/); assert.doesNotMatch(render(false), /Disconnect repository?/);
  assert.match(render(true), /Reconnect repository/); assert.match(render(true), /No free slot/); assert.match(render(true), /disabled/);
});

it("preserves the trigger id and state-specific label in both connection states", () => {
  assert.match(focusTrigger(render(false)), /aria-label="More actions for Alpha"[^>]*>⋯$/);
  assert.match(focusTrigger(render(true)), />Reconnect repository$/);
});
