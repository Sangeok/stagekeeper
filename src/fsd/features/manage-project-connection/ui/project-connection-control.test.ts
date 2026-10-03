import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ProjectConnectionControl } from "./project-connection-control";

// Real focus/effects/pending/CAS recovery are covered by browser connection cases.
it("keeps disconnect in More actions and blocks reconnect above the current cap", () => {
  const action = async () => ({ status: "success" as const });
  const render = (disconnected: boolean) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: {} as ContextType<typeof AppRouterContext> }, createElement(ProjectConnectionControl, {
    target: { id: "a", name: "Alpha", repoOwner: "owner", repo: "repo", disconnectedAt: disconnected ? "2026-10-04" : null },
    summary: { plan: "free", version: 4, limit: 1, connectedCount: 1 }, disconnect: action, reconnect: action,
  })));
  assert.match(render(false), /More actions for Alpha/); assert.doesNotMatch(render(false), /Disconnect repository?/);
  assert.match(render(true), /Reconnect repository/); assert.match(render(true), /No free slot/); assert.match(render(true), /disabled/);
});
