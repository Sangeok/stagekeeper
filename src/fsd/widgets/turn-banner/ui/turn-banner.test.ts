import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { copyLock, missingUnits } from "@/fsd/shared/lib/copy-lock";
import { deriveTurn, type Turn } from "../model/turn";
import { TurnBanner } from "./turn-banner";

function render(turn: Turn, pathname: string): string {
  return renderToStaticMarkup(createElement(PathnameContext.Provider, { value: pathname }, createElement(TurnBanner, { turn, slug: "alpha" })));
}

it("starts setup in Claude with selected, inline init guidance", () => {
  const html = render(deriveTurn([], { tokenIssued: true, rosterSynced: false }), "/p/alpha");
  assert.deepEqual(missingUnits(copyLock("turn-banner-connect-claude"), html), []);
  assert.match(html, /<code[^>]*>\/harness:init<\/code>/);
  assert.doesNotMatch(html, /\$harness-init/);
});

it("renders both ready entries with Claude defaults and leaves compact tabs compact", () => {
  const turn: Turn = { kind: "theirs", detail: "Current work", next: [
    { kind: "continue", key: "K-1", line: "Continue the pipeline for K-1." },
    { kind: "handoff", key: "K-2", line: "Commit the prepared file, then continue the pipeline for K-2.", note: null },
  ] };
  const html = render(turn, "/p/alpha/inbox");
  assert.deepEqual(missingUnits(copyLock("turn-banner-watch"), html), []);
  assert.match(html, /Continue the pipeline for K-1/);
  assert.match(html, /Commit the prepared file/);
  assert.doesNotMatch(render(turn, "/p/alpha/backlog"), /Coding client|>Copy<\/button>/);
});
