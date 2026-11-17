import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { verifierPackage } from "../../plugin/runtime/codex-agent.mjs";
import { windowsHooks } from "./package-windows-plugin.mjs";

import { assertModuleInventory, packageProject, windowsRuntimeFixture } from "../lib/testing/plugin-package-fixture.mjs";
const PLUGIN_VERIFIER = fileURLToPath(new URL("../../plugin/skills/reconciling-proposals-with-codebase/", import.meta.url));
const PLUGIN_HOOKS = fileURLToPath(new URL("../../plugin/hooks/hooks.json", import.meta.url));
const LAUNCH = "-NoProfile -NonInteractive -File ${CLAUDE_PLUGIN_ROOT}/bin/harness.ps1";

it("ships the complete verification skill in the plugin source", () => {
  const verifier = verifierPackage(PLUGIN_VERIFIER), skill = readFileSync(verifier.path, "utf8");
  for (let gate = 1; gate <= 7; gate++) assert.match(skill, new RegExp(`^\\| INV-${gate} \\|`, "m"));
});

it("packages the plugin's verification skill for Claude Code and Codex with one checksum", async t => {
  const fixture = packageProject(t);
  const { packageWindowsPlugin } = await fixture.load("scripts/windows/package-windows-plugin.mjs");
  const source = verifierPackage(PLUGIN_VERIFIER), result = packageWindowsPlugin({ output: fixture.output("bundle"), runtimeDirectory: windowsRuntimeFixture(fixture.base) });
  assert.deepEqual(result.verifier, { checksum: source.checksum, files: source.files });
  const manifest = JSON.parse(readFileSync(path.join(result.path, "windows-package.json"), "utf8"));
  assert.equal(manifest.sourceRevision, fixture.git("rev-parse", "HEAD"));
  assertModuleInventory(assert, fixture.root, result.path, manifest.inventory);
  for (const destination of ["skills/reconciling-proposals-with-codebase", "codex/skills/reconciling-proposals-with-codebase"]) {
    assert.equal(verifierPackage(path.join(result.path, destination)).checksum, source.checksum);
  }
});

it("packages each plugin hook to run its guard through the Windows launcher with the same trigger and failure behavior", async t => {
  const fixture = packageProject(t);
  const { packageWindowsPlugin } = await fixture.load("scripts/windows/package-windows-plugin.mjs");
  const result = packageWindowsPlugin({ output: fixture.output("bundle"), runtimeDirectory: windowsRuntimeFixture(fixture.base) });
  const hooks = JSON.parse(readFileSync(path.join(result.path, "hooks/hooks.json"), "utf8"));

  assert.deepEqual(Object.keys(hooks.hooks), ["PreToolUse"]);
  assert.deepEqual(hooks.hooks.PreToolUse.flatMap(group => group.hooks.map(handler => [group.matcher, handler.if ?? null, handler.command, handler.args.slice(0, -1).join(" "), handler.args.at(-1),
    handler.timeout, handler.onFailure])), [
    ["^mcp__harness__(agent_next|pipeline_next)$", null, "powershell.exe", LAUNCH, "template-guard", 15, "block"],
    ["^(Bash|PowerShell)$", "Bash(*git*commit*)", "powershell.exe", LAUNCH, "commit-guard", 10, "continue"],
    ["^(Bash|PowerShell)$", "Bash(*git*add*)", "powershell.exe", LAUNCH, "commit-guard", 10, "continue"],
    ["^(Bash|PowerShell)$", "PowerShell(*git*commit*)", "powershell.exe", LAUNCH, "commit-guard", 10, "continue"],
    ["^(Bash|PowerShell)$", "PowerShell(*git*add*)", "powershell.exe", LAUNCH, "commit-guard", 10, "continue"],
  ]);
  for (const script of ["harness-template-guard.mjs", "harness-commit-guard.mjs"]) assert.equal(readFileSync(path.join(result.path, "bin", script), "utf8").length > 0, true);
});

it("stops packaging when a plugin hook is unknown, missing or changes its failure behavior", () => {
  const handlers = (hooks, script) => hooks.hooks.PreToolUse.flatMap(group => group.hooks).filter(handler => handler.args?.[0]?.endsWith(`/${script}`));
  const changes = [
    hooks => { handlers(hooks, "harness-template-guard.mjs")[0].onFailure = "continue"; },
    hooks => { handlers(hooks, "harness-commit-guard.mjs")[2].onFailure = "block"; },
    hooks => { handlers(hooks, "harness-commit-guard.mjs")[0].command = "bash"; },
    hooks => { hooks.hooks.PreToolUse[0].hooks.push({ type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/bin/harness-other.mjs"], onFailure: "continue" }); },
    hooks => { hooks.hooks.PreToolUse = hooks.hooks.PreToolUse.filter(group => !group.hooks.some(handler => handler.args?.[0]?.endsWith("/harness-template-guard.mjs"))); },
  ];

  assert.equal(windowsHooks(JSON.parse(readFileSync(PLUGIN_HOOKS, "utf8"))).hooks.PreToolUse.length, 2);
  for (const change of changes) {
    const hooks = JSON.parse(readFileSync(PLUGIN_HOOKS, "utf8"));
    change(hooks);
    assert.throws(() => windowsHooks(hooks), /^Error: Unexpected plugin hook contract$/);
  }
});

it("rejects incomplete or changed module payloads before creating Windows package output", async t => {
  const fixture = packageProject(t);
  const { packageWindowsPlugin } = await fixture.load("scripts/windows/package-windows-plugin.mjs");
  const runtimeDirectory = windowsRuntimeFixture(fixture.base);
  const cases = [
    ["drift", "plugin/lib/plans/limits.mjs", "export const changed = true;", /not synchronized/],
    ["orphan", "plugin/lib/old-policy.mjs", "export const old = true;", /orphan/],
    ["untracked", "plugin/runtime/new-module.mjs", "export const added = true;", /missing tracked modules/],
    ["missing", "plugin/runtime/qa/config.mjs", null, /unresolved|missing|ENOENT/i],
    ["missing-lib", "plugin/lib/plans/limits.mjs", null, /not synchronized/],
  ];
  for (const [name, file, content, error] of cases) {
    const target = path.join(fixture.root, file);
    const previous = existsSync(target) ? readFileSync(target) : null;
    if (content === null) rmSync(target); else writeFileSync(target, content);
    const output = fixture.output(name);
    assert.throws(() => packageWindowsPlugin({ output, runtimeDirectory }), error);
    assert.equal(existsSync(output), false);
    if (previous) writeFileSync(target, previous); else rmSync(target);
  }
  fixture.git("rm", "--cached", "--", "plugin/lib/plans/limits.mjs");
  const output = fixture.output("untracked-lib");
  assert.throws(() => packageWindowsPlugin({ output, runtimeDirectory }), /missing tracked modules/);
  assert.equal(existsSync(output), false);
});
