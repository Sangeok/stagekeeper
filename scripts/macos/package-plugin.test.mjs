import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { it } from "node:test";
import path from "node:path";
import { verifierPackage } from "../../plugin/runtime/codex-agent.mjs";
import { assertModuleInventory, macosRuntimeFixture, packageProject } from "../lib/testing/plugin-package-fixture.mjs";
import { macosHooks } from "./package-plugin.mjs";

const source = () => JSON.parse(readFileSync(new URL("../../plugin/hooks/hooks.json", import.meta.url), "utf8"));

it("routes template and role commit guards through bundled macOS Node with their original triggers", () => {
  const hooks = macosHooks(source());
  assert.deepEqual(hooks.hooks.PreToolUse.flatMap(group => group.hooks.map(handler => [group.matcher, handler.if ?? null, handler.command, handler.args, handler.timeout, handler.onFailure])), [
    ["^mcp__harness__(agent_next|pipeline_next)$", null, "${CLAUDE_PLUGIN_ROOT}/bin/harness", ["template-guard"], 15, "block"],
    ["^(Bash|PowerShell)$", "Bash(*git*commit*)", "${CLAUDE_PLUGIN_ROOT}/bin/harness", ["commit-guard"], 10, "continue"],
    ["^(Bash|PowerShell)$", "Bash(*git*add*)", "${CLAUDE_PLUGIN_ROOT}/bin/harness", ["commit-guard"], 10, "continue"],
    ["^(Bash|PowerShell)$", "PowerShell(*git*commit*)", "${CLAUDE_PLUGIN_ROOT}/bin/harness", ["commit-guard"], 10, "continue"],
    ["^(Bash|PowerShell)$", "PowerShell(*git*add*)", "${CLAUDE_PLUGIN_ROOT}/bin/harness", ["commit-guard"], 10, "continue"],
  ]);
});

it("refuses missing, unknown or weakened macOS hook contracts before packaging", () => {
  for (const change of [
    hooks => { hooks.hooks.PreToolUse[0].hooks[0].onFailure = "continue"; },
    hooks => { hooks.hooks.PreToolUse[1].hooks[0].onFailure = "block"; },
    hooks => { hooks.hooks.PreToolUse[1].hooks[0].command = "bash"; },
    hooks => { hooks.hooks.PreToolUse[1].hooks[0].args = ["${CLAUDE_PLUGIN_ROOT}/bin/unknown.mjs"]; },
    hooks => { hooks.hooks.PreToolUse.pop(); },
  ]) {
    const hooks = source(); change(hooks); assert.throws(() => macosHooks(hooks), /Unexpected plugin hook contract/);
  }
});

it("packages the exact shared closure and plugin runtime with native modes and complete verifier", { skip: process.platform !== "darwin" }, async t => {
  const fixture = packageProject(t);
  const { packageMacosPlugin } = await fixture.load("scripts/macos/package-plugin.mjs");
  const result = packageMacosPlugin({ output: fixture.output("bundle"), runtimeDirectory: macosRuntimeFixture(fixture.base, fixture.root) });
  const manifest = JSON.parse(readFileSync(path.join(result.path, "macos-package.json"), "utf8"));
  assert.equal(manifest.sourceRevision, fixture.git("rev-parse", "HEAD"));
  assertModuleInventory(assert, fixture.root, result.path, manifest.inventory);
  for (const file of ["bin/harness", "runtime/macos/node/bin/node", "runtime/macos/node/sandbox-identity"]) assert.equal(statSync(path.join(result.path, file)).mode & 0o111, 0o111);
  for (const directory of ["skills/reconciling-proposals-with-codebase", "codex/skills/reconciling-proposals-with-codebase"]) assert.equal(verifierPackage(path.join(result.path, directory)).checksum, manifest.verifier.checksum);
});

it("rejects drift and missing tracked runtime modules before creating macOS package output", { skip: process.platform !== "darwin" }, async t => {
  const fixture = packageProject(t);
  const { packageMacosPlugin } = await fixture.load("scripts/macos/package-plugin.mjs");
  const runtimeDirectory = macosRuntimeFixture(fixture.base, fixture.root);
  for (const [name, file, content] of [
    ["drift", "plugin/lib/plans/limits.mjs", "export const changed = true;"],
    ["orphan", "plugin/lib/old-policy.mjs", "export const old = true;"],
    ["missing-lib", "plugin/lib/plans/limits.mjs", null],
  ]) {
    const target = path.join(fixture.root, file), previous = existsSync(target) ? readFileSync(target) : null;
    if (content === null) rmSync(target); else writeFileSync(target, content);
    assert.throws(() => packageMacosPlugin({ output: fixture.output(name), runtimeDirectory }), /not synchronized/);
    assert.equal(existsSync(fixture.output(name)), false);
    if (previous) writeFileSync(target, previous); else rmSync(target);
  }
  fixture.git("rm", "--cached", "--", "plugin/runtime/qa/config.mjs");
  assert.throws(() => packageMacosPlugin({ output: fixture.output("missing"), runtimeDirectory }), /missing tracked modules/);
  assert.equal(existsSync(fixture.output("missing")), false);
});
