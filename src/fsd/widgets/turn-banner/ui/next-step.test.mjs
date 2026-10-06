import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyLock, missingUnits } from "@/fsd/shared/lib/copy-lock";
import { NextStepContent } from "./next-step.tsx";

const steps = [
  { kind: "continue", key: "ITEM-02", line: "Continue the pipeline for ITEM-02: accept — accept." },
  { kind: "handoff", note: "docs/plans/ITEM with spaces.md", key: "ITEM with spaces and a long key", line: "Commit docs/plans/ITEM with spaces.md, then continue the pipeline for ITEM with spaces and a long key." },
];
it("renders every terminal line and one inline watch command with the locked sentence", () => {
  const html = renderToStaticMarkup(createElement(NextStepContent, { steps, client: "claude", onClientChange: () => {} }));
  assert.deepEqual(missingUnits(copyLock("turn-banner-watch"), html), []);
  assert.equal([...html.matchAll(/<code[^>]*>\/harness:watch<\/code>/g)].length, 1);
  assert.equal([...html.matchAll(/>Copy<\/button>/g)].length, 2);
  for (const step of steps) assert.ok(html.includes(step.line));
  assert.match(html, /minmax\(0,1fr\)/);
});
it("copies the Codex resume payload for every key without automatic watch", () => {
  const html = renderToStaticMarkup(createElement(NextStepContent, { steps, client: "codex", onClientChange: () => {} }));
  assert.doesNotMatch(html, /harness:watch|automatically/);
  assert.match(html, /Next, in Codex/);
  assert.ok(html.includes("Commit docs/plans/ITEM with spaces.md, then $harness-resume"));
});
it("renders no box or guidance for an empty list", () => {
  assert.equal(renderToStaticMarkup(createElement(NextStepContent, { steps: [], client: "claude", onClientChange: () => {} })), "");
});
