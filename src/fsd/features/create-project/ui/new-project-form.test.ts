import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewProjectForm } from "./new-project-form";

it("renders different copy for empty success and failure while preserving URL entry", () => {
  const render = (repoLoadFailed: boolean) => renderToStaticMarkup(createElement(NewProjectForm, {
    action: async () => ({ status: "idle" as const }), mcpUrl: "https://example.test/api/mcp", serverUrl: "https://example.test", defaultOwner: "user", repos: [], repoLoadFailed,
  }));
  assert.match(render(false), /No public repositories found\. Paste a URL\./);
  assert.doesNotMatch(render(false), /load your repositories/);
  assert.match(render(true), /load your repositories\. Paste a URL\./);
  for (const failed of [false, true]) assert.match(render(failed), /Repository URL/);
});
