import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
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
