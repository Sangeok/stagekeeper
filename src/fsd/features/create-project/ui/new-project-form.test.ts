import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewProjectForm, formMode } from "./new-project-form";

// 수동 입력 중에는 저장소가 파싱돼도(`…/acme/h` 처럼 한 글자만 쳐도 파싱된다) 입력란이 사라지면 안 된다.
it("keeps the URL input while typing, even once a repository parses", () => {
  assert.equal(formMode(true, false), "manual");
  assert.equal(formMode(true, true), "manual");
  assert.equal(formMode(false, true), "chosen");
  assert.equal(formMode(false, false), "picker");
});

it("renders different copy for empty success and failure while preserving URL entry", () => {
  const render = (repoLoadFailed: boolean) => renderToStaticMarkup(createElement(NewProjectForm, {
    action: async () => ({ status: "idle" as const }), mcpUrl: "https://example.test/api/mcp", defaultOwner: "user", repos: [], repoLoadFailed,
  }));
  assert.match(render(false), /No public repositories found\. Paste a URL\./);
  assert.doesNotMatch(render(false), /load your repositories/);
  assert.match(render(true), /load your repositories\. Paste a URL\./);
  for (const failed of [false, true]) assert.match(render(failed), /Repository URL/);
});
