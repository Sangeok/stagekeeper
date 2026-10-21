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
// 살아 있는 실행기가 있으면 watch 줄을 숨긴다. 실행기 행이 아예 없을 때만 버전 줄이 붙는다(product-copy §5).
it("hides the watch line for a live runner and adds the version line only without a runner row", () => {
  const render = (props) => renderToStaticMarkup(createElement(NextStepContent, { steps, client: "claude", onClientChange: () => {}, ...props }));
  const hidden = render({ showWatch: false, showRunnerHint: true });
  assert.doesNotMatch(hidden, /harness:watch|plugin 0\.5\.13/);
  for (const step of steps) assert.ok(hidden.includes(step.line));
  const none = render({ showRunnerHint: true });
  assert.deepEqual(missingUnits([...copyLock("turn-banner-watch"), ...copyLock("turn-banner-runner-none")], none), []);
  assert.doesNotMatch(render({}), /plugin 0\.5\.13/);
  const codex = renderToStaticMarkup(createElement(NextStepContent, { steps, client: "codex", onClientChange: () => {}, showRunnerHint: true }));
  assert.doesNotMatch(codex, /harness:watch|plugin 0\.5\.13/);
});
// Free 줄(B-5)은 버전 줄과 함께, Free 플랜일 때만 붙는다.
it("adds the Free line under the version line only on the Free plan", () => {
  const render = (props) => renderToStaticMarkup(createElement(NextStepContent, { steps, client: "claude", onClientChange: () => {}, ...props }));
  const free = render({ showRunnerHint: true, showFreeLine: true });
  assert.deepEqual(missingUnits([...copyLock("turn-banner-runner-none"), ...copyLock("turn-banner-runner-free")], free), []);
  assert.doesNotMatch(render({ showRunnerHint: true }), /opens on Pro/);
  assert.doesNotMatch(render({ showRunnerHint: false, showFreeLine: true }), /opens on Pro/);
  assert.doesNotMatch(render({ showWatch: false, showRunnerHint: true, showFreeLine: true }), /opens on Pro/);
  const codex = renderToStaticMarkup(createElement(NextStepContent, { steps, client: "codex", onClientChange: () => {}, showRunnerHint: true, showFreeLine: true }));
  assert.doesNotMatch(codex, /opens on Pro/);
});
