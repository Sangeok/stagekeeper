import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { copyLock, missingUnits, visibleText } from "@/fsd/shared/lib/copy-lock";
import type { Plan } from "@harness/core/entitlement.mjs";
import type { RunnerFacts, TurnRunner } from "../model/runner";
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

// 실행기 줄(product-copy §5). 새 prop은 선택이라 위 사례는 실행기 없이 그대로 그린다.
const RENDERED = "2026-10-20T12:00:00.000Z";
const minutesAgo = (n: number) => new Date(Date.parse(RENDERED) - n * 60_000).toISOString();
const live: TurnRunner = { mode: "session", host: "desk", branch: null, permission: null, autostart: false, state: "idle", waitReason: null, stopReason: null, seenAt: minutesAgo(1), lastActivity: null };
const facts = (runner: TurnRunner | null, paused = false): RunnerFacts => ({ runner, paused, renderedAt: RENDERED });
const working: Turn = { kind: "theirs", detail: "dev is implementing ITEM-01", next: [{ kind: "continue", key: "ITEM-02", line: "Continue the pipeline for ITEM-02: plan — dev writes the plan." }] };

function renderWith(turn: Turn, pathname: string, runner: RunnerFacts | undefined, pause = true, plan?: Plan): string {
  const banner = createElement(TurnBanner, { turn, slug: "alpha", runner, plan, pause: pause ? async (paused: boolean) => ({ success: true as const, data: paused }) : undefined });
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: {} as ContextType<typeof AppRouterContext> },
    createElement(PathnameContext.Provider, { value: pathname }, banner)));
}

it("shows a live runner on Board and Inbox in every banner kind, with Pause, and hides the watch line", () => {
  for (const [turn, pathname] of [[working, "/p/alpha"], [working, "/p/alpha/inbox"], [deriveTurn([], { tokenIssued: true, rosterSynced: true }), "/p/alpha"], [{ kind: "none", detail: "Nothing" } as Turn, "/p/alpha"]] as const) {
    const html = renderWith(turn, pathname, facts(live));
    assert.ok(visibleText(html).includes("Runner: watching in Claude Code on desk · checked 1 min ago"), pathname);
    assert.match(html, /<code[^>]*>desk<\/code>/);
    assert.match(html, />Pause<\/button>/);
    assert.doesNotMatch(html, /Or leave|plugin 0\.5\.13/);
  }
});

// Free 줄(B-5): 실행기 행이 없고 프로젝트 플랜이 Free일 때만. 플랜을 넘기지 않는 화면은 지금과 같다.
it("adds the Free line only without a runner row on the Free plan", () => {
  const free = renderWith(working, "/p/alpha", facts(null), true, "free");
  assert.deepEqual(missingUnits([...copyLock("turn-banner-runner-none"), ...copyLock("turn-banner-runner-free")], free), []);
  assert.doesNotMatch(renderWith(working, "/p/alpha", facts(null), true, "pro"), /opens on Pro/);
  assert.doesNotMatch(renderWith(working, "/p/alpha", facts(null)), /opens on Pro/);
  assert.doesNotMatch(renderWith(working, "/p/alpha", facts(live), true, "free"), /opens on Pro/);
  assert.doesNotMatch(renderWith(working, "/p/alpha/backlog", facts(null), true, "free"), /opens on Pro/);
});

it("keeps the watch line without a live runner and adds the version line only without a row", () => {
  const none = renderWith(working, "/p/alpha", facts(null));
  assert.deepEqual(missingUnits([...copyLock("turn-banner-watch"), ...copyLock("turn-banner-runner-none")], none), []);
  assert.doesNotMatch(none, /Runner:|>Pause<|>Resume</);
  const silent = renderWith(working, "/p/alpha", facts({ ...live, seenAt: minutesAgo(5) }));
  assert.ok(visibleText(silent).includes("No signal from the runner on desk for 5 min."));
  assert.deepEqual(missingUnits(copyLock("turn-banner-watch"), silent), []);
  assert.doesNotMatch(silent, /plugin 0\.5\.13/);
  assert.doesNotMatch(renderWith(working, "/p/alpha", undefined), /plugin 0\.5\.13|Runner/);
});

it("offers Resume for a pause even without a runner, and no button without an action", () => {
  const paused = renderWith(working, "/p/alpha", facts(null, true));
  assert.match(paused, /Runner paused — it starts nothing new\./);
  assert.match(paused, />Resume<\/button>/);
  assert.doesNotMatch(renderWith(working, "/p/alpha", facts(live), false), /<button[^>]*>Pause/);
});

it("ends the strip with the short form and no button on other tabs", () => {
  const strip = renderWith(working, "/p/alpha/backlog", facts({ ...live, state: "working" }));
  assert.ok(visibleText(strip).includes("dev is implementing ITEM-01 · Runner: working on desk"));
  assert.match(strip, /<code[^>]*>desk<\/code>/);
  assert.doesNotMatch(strip, />Pause<|Or leave/);
  assert.doesNotMatch(renderWith(working, "/p/alpha/backlog", facts(null)), / · Runner/);
});
