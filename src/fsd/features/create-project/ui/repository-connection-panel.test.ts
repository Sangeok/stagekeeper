import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_QUERY } from "../model/github-connection-state";
import { connectionStatusText, RepositoryConnectionPanel } from "./repository-connection-panel";

it("does not start authorization while rendering and keeps the initial prompt optional", () => {
  let calls = 0;
  const html = renderToStaticMarkup(createElement(RepositoryConnectionPanel, { connection: { available: true, status: "not-connected", revision: null, notice: null },
    query: EMPTY_QUERY, busy: false, message: null, canRetry: true, authorize: () => { calls++; }, manage: () => { calls++; }, disconnect: () => { calls++; }, retry: () => {}, loadMore: () => {}, paste: () => {} }));
  assert.match(html, /Connect private repositories/);
  assert.doesNotMatch(html, /Continue to GitHub/);
  assert.equal(calls, 0);
  assert.doesNotMatch(html, /<form/);
  assert.match(html, /type="button"/);
});

it("keeps disconnect available for an expired grant while the feature is disabled", () => {
  const html = renderToStaticMarkup(createElement(RepositoryConnectionPanel, { connection: { available: false, status: "reauth-required", revision: 2, notice: null },
    query: EMPTY_QUERY, busy: false, message: null, canRetry: true, authorize: () => {}, manage: () => {}, disconnect: () => {}, retry: () => {}, loadMore: () => {}, paste: () => {} }));
  assert.match(html, /Disconnect repository list/);
  assert.doesNotMatch(html, /Manage repository access/);
  assert.doesNotMatch(html, /Connect private repositories/);
});

it("shows current repository failure guidance ahead of old restoration feedback", () => {
  assert.equal(connectionStatusText({ busy: false, query: { ...EMPTY_QUERY, status: "error", message: "Wait before retrying." }, message: "Your draft was restored." }), "Wait before retrying.");
});
