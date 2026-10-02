import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyLock, missingUnits } from "@/fsd/shared/lib/copy-lock";
import { NextStepBox } from "./next-step.tsx";

const steps = [
  { key: "ITEM-02", line: "Continue the pipeline for ITEM-02: accept — accept." },
  { key: "ITEM with spaces and a long key", line: "Commit docs/plans/ITEM with spaces.md, then continue the pipeline for ITEM with spaces and a long key." },
];
it("renders every terminal line and one inline watch command with the locked sentence", () => {
  const html = renderToStaticMarkup(createElement(NextStepBox, { steps }));
  assert.deepEqual(missingUnits(copyLock("turn-banner-watch"), html), []);
  assert.equal([...html.matchAll(/<code[^>]*>\/harness:watch<\/code>/g)].length, 1);
  assert.equal([...html.matchAll(/>Copy<\/button>/g)].length, 2);
  for (const step of steps) assert.ok(html.includes(step.line));
  assert.match(html, /minmax\(0,1fr\)/);
});
it("passes only the unchanged terminal line to each actual CopyButton", () => {
  const tree = NextStepBox({ steps });
  const rows = tree.props.children[1];
  assert.deepEqual(rows.map((row) => {
    const button = row.props.children.find((child) => child.type?.name === "CopyButton");
    return button.props.text;
  }), steps.map((step) => step.line));
});
it("renders no box or guidance for an empty list", () => {
  assert.equal(renderToStaticMarkup(createElement(NextStepBox, { steps: [] })), "");
});
