import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import { Children, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import type { SaveAutomaticScoutAction } from "./automatic-scout-control";

type NodeProps = { children?: ReactElement | string; role?: string; disabled?: boolean; onClick?: () => void; "aria-checked"?: boolean };

// Run the component's handlers with hook, router and action boundary doubles.
// Browser hydration is checked separately; a refused or uncertain save must not
// pretend that the server has accepted the new switch state.
function harness(save: SaveAutomaticScoutAction, writable = true) {
  const states: unknown[] = []; let cursor = 0; let enabled = true; let refreshes = 0;
  const jobs: Promise<unknown>[] = []; const notices: string[] = [];
  const useState = (initial: unknown) => {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (value: unknown) => { states[index] = value; }];
  };
  const deps: Record<string, unknown> = {
    "react": { useState, useTransition: () => {
      const index = cursor++;
      return [states[index] ?? false, (run: () => unknown) => {
        states[index] = true;
        jobs.push(Promise.resolve().then(run).finally(() => { states[index] = false; }));
      }];
    } },
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "sonner": { toast: { success: (message: string) => notices.push(message) } },
    "@/fsd/shared/ui/button": { Button: "button" },
  };
  const exported: { AutomaticScoutControl?: (props: unknown) => ReactElement<NodeProps> } = {};
  const source = readFileSync(new URL("./automatic-scout-control.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports: exported, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const tree = () => { cursor = 0; return exported.AutomaticScoutControl!({ enabled, writable, save, unavailableReason: "Not selected" }); };
  const control = () => {
    let found: ReactElement<NodeProps> | undefined;
    const visit = (node: ReactElement<NodeProps>) => {
      if (node.props.role === "switch") found = node;
      Children.forEach(node.props.children, (child) => { if (isValidElement<NodeProps>(child)) visit(child); });
    };
    visit(tree()); assert.ok(found); return found;
  };
  return {
    control, html: () => renderToStaticMarkup(tree()), notices,
    setEnabled: (value: boolean) => { enabled = value; }, refreshes: () => refreshes,
    click: () => { const node = control(); if (!node.props.disabled) node.props.onClick!(); },
    settle: async () => { for (let index = 0; index < jobs.length; index++) await jobs[index]; },
  };
}

it("exposes automatic scouting independently of graph editing and shows the confirmed server state", async () => {
  const submitted: boolean[] = [];
  const ui = harness(async (enabled) => { submitted.push(enabled); return { success: true, data: enabled }; });
  assert.equal(ui.control().props["aria-checked"], true);
  assert.match(ui.html(), /feature-scout/);
  ui.click(); assert.equal(ui.control().props.disabled, true);
  await ui.settle(); assert.deepEqual(submitted, [false]);
  assert.deepEqual(ui.notices, ["Automatic scouting off"]);
  ui.setEnabled(false);
  assert.equal(ui.control().props["aria-checked"], false);
  assert.match(ui.html(), /Add an item on the Backlog tab/);
  ui.click(); await ui.settle(); assert.deepEqual(submitted, [false, true]);
});

it("disables the control for unavailable projects and never saves", async () => {
  let calls = 0;
  const ui = harness(async () => { calls++; return { success: true, data: false }; }, false);
  ui.click(); await ui.settle(); assert.equal(calls, 0);
  assert.equal(ui.control().props.disabled, true); assert.match(ui.html(), /Not selected/);
});

it("keeps the confirmed state and displays refusals without a success notice", async () => {
  const ui = harness(async () => ({ success: false, error: "Unavailable" }));
  ui.click(); await ui.settle();
  assert.equal(ui.control().props["aria-checked"], true);
  assert.match(ui.html(), /role="alert".*Unavailable/);
  assert.deepEqual(ui.notices, []); assert.equal(ui.refreshes(), 0);
});

it("refreshes after a lost response without making a second mutation", async () => {
  let calls = 0;
  const ui = harness(async () => { calls++; throw new Error("Connection lost"); });
  ui.click(); await ui.settle();
  assert.equal(calls, 1); assert.equal(ui.refreshes(), 1);
  assert.match(ui.html(), /The setting may have changed/);
  assert.deepEqual(ui.notices, []);
});
