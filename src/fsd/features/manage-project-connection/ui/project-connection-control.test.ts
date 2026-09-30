import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { STALE_CONNECTION_MESSAGE, UNKNOWN_CONNECTION_MESSAGE, type ProjectConnectionAction, type ProjectConnectionModel } from "../model/project-connection-state";

type Node = { type: unknown; props: { children?: unknown; disabled?: boolean; onClick?: () => void; role?: string } };
const model: ProjectConnectionModel = {
  version: 4, plan: "free", limit: 1, connectedCount: 1, writesEnabled: true,
  projects: [{ id: "a", name: "Alpha", repoOwner: "owner", repo: "repo", disconnectedAt: null, openItems: 2, openRuns: 1 }],
};

// Execute the actual component handlers without adding a DOM test framework.
// Hooks/router/toast are boundary doubles; this does not prove hydration or
// browser focus/navigation, which remain separate interactive acceptance checks.
function harness(action: ProjectConnectionAction, value = model) {
  const states: unknown[] = []; let cursor = 0; let refreshes = 0;
  const jobs: Promise<unknown>[] = []; const notifications: { kind: string; message: string }[] = [];
  function useState(initial: unknown): [unknown, (value: unknown) => void] {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (value) => { states[index] = value; }];
  }
  const deps: Record<string, unknown> = {
    "react": { useState, useTransition: () => {
      const [pending, setPending] = useState(false);
      return [pending, (run: () => unknown) => {
        setPending(true);
        jobs.push(Promise.resolve().then(run).finally(() => setPending(false)));
      }];
    } },
    "react/jsx-runtime": { Fragment: "fragment", jsx: (type: unknown, props: Node["props"]) => ({ type, props }), jsxs: (type: unknown, props: Node["props"]) => ({ type, props }) },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "sonner": { toast: { error: (message: string) => notifications.push({ kind: "error", message }), success: (message: string) => notifications.push({ kind: "success", message }) } },
    "@/fsd/shared/ui/button": { Button: "button" },
    "../model/project-connection-state": { STALE_CONNECTION_MESSAGE, UNKNOWN_CONNECTION_MESSAGE },
  };
  const exported: { ProjectConnectionControl?: (props: unknown) => Node | null } = {};
  const source = readFileSync(new URL("./project-connection-control.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports: exported, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const render = (): Node[] => {
    cursor = 0; const nodes: Node[] = [];
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (typeof node === "object" && node !== null && "props" in node) {
        const entry = node as Node; nodes.push(entry); visit(entry.props.children);
      }
    };
    visit(exported.ProjectConnectionControl!({ targetId: "a", model: value, disconnect: action, reconnect: action }));
    return nodes;
  };
  const button = (label: string): Node => {
    const found = render().find((node) => node.type === "button" && node.props.children === label);
    assert.ok(found, `Missing button ${label}`); return found;
  };
  const click = (label: string): void => { const entry = button(label); if (!entry.props.disabled) entry.props.onClick!(); };
  const settle = async (): Promise<void> => { for (let index = 0; index < jobs.length; index++) await jobs[index]; };
  return { render, button, click, settle, notifications, refreshes: () => refreshes };
}

it("cancel and disabled controls never invoke a mutation", async () => {
  let calls = 0; const action: ProjectConnectionAction = async () => { calls++; return { status: "success" }; };
  const ui = harness(action);
  ui.click("Disconnect repository"); ui.click("Cancel");
  assert.equal(ui.render().some((node) => node.type === "section"), false);
  assert.equal(calls, 0);
  const disabled = harness(action, { ...model, writesEnabled: false });
  assert.equal(disabled.button("Disconnect repository").props.disabled, true);
  disabled.click("Disconnect repository"); await disabled.settle();
  assert.equal(calls, 0);
});

it("pending submission disables both buttons and success resets the confirmation without another request", async () => {
  let complete!: () => void; let calls = 0; let submitted: unknown;
  const gate = new Promise<void>((resolve) => { complete = resolve; });
  const ui = harness(async (input) => { calls++; submitted = input; await gate; return { status: "success" }; });
  ui.click("Disconnect repository"); ui.click("Disconnect repository");
  await Promise.resolve();
  assert.equal(ui.button("Updating…").props.disabled, true); assert.equal(ui.button("Cancel").props.disabled, true);
  ui.click("Updating…"); assert.equal(calls, 1);
  assert.equal(JSON.stringify(submitted), JSON.stringify({ targetProjectId: "a", expectedVersion: 4 }));
  complete(); await ui.settle();
  assert.equal(ui.render().some((node) => node.type === "section"), false);
  assert.equal(ui.notifications[0].message, "Repository disconnected"); assert.equal(ui.refreshes(), 0);
  assert.equal(calls, 1);
});

it("a business rejection keeps the confirmation and error for explicit review", async () => {
  const ui = harness(async () => ({ status: "error", reason: "project cap reached" }), { ...model, projects: [{ ...model.projects[0], disconnectedAt: "2026-09-30T00:00:00Z" }] });
  ui.click("Reconnect repository"); ui.click("Reconnect repository"); await ui.settle();
  assert.ok(ui.render().some((node) => node.props.role === "alert" && node.props.children === "project cap reached"));
  assert.ok(ui.render().some((node) => node.type === "section")); assert.equal(ui.refreshes(), 0);
  ui.click("Cancel"); assert.ok(!ui.render().some((node) => node.props.role === "alert"));
});

it("stale and committed-but-unconfirmed responses close the panel, refresh once and never resubmit", async () => {
  for (const uncertain of [false, true]) {
    let calls = 0; let commits = 0;
    const ui = harness(async () => { calls++; if (uncertain) { commits++; throw new Error("response or post-commit cache invalidation failed"); } return { status: "stale" }; });
    ui.click("Disconnect repository"); ui.click("Disconnect repository"); await ui.settle();
    assert.equal(ui.render().some((node) => node.type === "section"), false);
    assert.equal(ui.button("Disconnect repository").props.disabled, false);
    assert.equal(ui.refreshes(), 1); assert.equal(calls, 1); assert.equal(commits, uncertain ? 1 : 0);
    assert.equal(ui.notifications[0].message, uncertain ? UNKNOWN_CONNECTION_MESSAGE : STALE_CONNECTION_MESSAGE);
    assert.equal(ui.render().some((node) => node.props.role === "alert"), false);
  }
});
