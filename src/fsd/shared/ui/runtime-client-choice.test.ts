import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RuntimeClientChoice } from "./runtime-client-choice";

it("groups each selector's options without coupling independent selectors", () => {
  const props = { value: "claude", options: [{ value: "claude", label: "Claude Code" }, { value: "codex", label: "Codex" }], onChange: () => {} };
  const html = renderToStaticMarkup(createElement(Fragment, null,
    createElement(RuntimeClientChoice, props), createElement(RuntimeClientChoice, props)));
  const names = [...html.matchAll(/name="([^"]+)"/g)].map(match => match[1]);
  assert.equal(names.length, 4);
  assert.ok(names[0]);
  assert.equal(names[0], names[1]);
  assert.equal(names[2], names[3]);
  assert.notEqual(names[0], names[2]);
});
