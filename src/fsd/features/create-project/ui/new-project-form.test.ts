import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewProjectForm, ProjectRegistrationResult, formMode } from "./new-project-form";
import { toCreateProjectState } from "../model/create-project-result";

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

it("renders actual stored identity and reveals a token only for a created registration", () => {
  const token = "hs_just-stored";
  for (const result of [{ status: "created", slug: "stored", projectId: "p" }, { status: "existing", slug: "preserved", projectId: "p" }, { status: "disconnected", slug: "preserved", reason: "disconnected" }] as const) {
    const state = toCreateProjectState(result, token);
    if (state.status !== "created" && state.status !== "existing" && state.status !== "disconnected") throw new Error("Unexpected registration state");
    const html = renderToStaticMarkup(createElement(ProjectRegistrationResult, { state, mcpUrl: "https://example.test/api/mcp" }));
    assert.ok(html.includes(`/p/${result.slug}`));
    if (result.status === "created") { assert.ok(html.includes(token)); assert.match(html, /Project created/); }
    else { assert.ok(!html.includes(token)); assert.doesNotMatch(html, /HARNESS_TOKEN|Project created/); }
    if (result.status === "disconnected") assert.match(html, /Reconnect repository/);
  }
});
