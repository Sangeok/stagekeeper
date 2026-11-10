import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { verifierPackage } from "../../plugin/runtime/codex-agent.mjs";
import { packageWindowsPlugin, windowsHooks } from "./package-windows-plugin.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const PLUGIN_VERIFIER = fileURLToPath(new URL("../../plugin/skills/reconciling-proposals-with-codebase/", import.meta.url));
const PLUGIN_HOOKS = fileURLToPath(new URL("../../plugin/hooks/hooks.json", import.meta.url));
const LAUNCH = "-NoProfile -NonInteractive -File ${CLAUDE_PLUGIN_ROOT}/bin/harness.ps1";

function runtime(root) {
  const directory = path.join(root, "runtime"), node = Buffer.from("fixture node");
  mkdirSync(directory);
  writeFileSync(path.join(directory, "node.exe"), node);
  writeFileSync(path.join(directory, "provenance.json"), JSON.stringify({ format: "stagekeeper-windows-node-v1", version: "22.23.3", architecture: "x64",
    sourceSha256: "9436c81b284889303d39f5b8bd629bf19e790c665ccb94b4994aa87220d9799a", pipeBackport: "https://github.com/libuv/libuv/pull/5181",
    executableSha256: digest(node), packageSha256: digest(JSON.stringify([["node.exe", digest(node)]])) }));
  return directory;
}

it("ships the complete verification skill in the plugin source", () => {
  const verifier = verifierPackage(PLUGIN_VERIFIER), skill = readFileSync(verifier.path, "utf8");
  for (let gate = 1; gate <= 7; gate++) assert.match(skill, new RegExp(`^\\| INV-${gate} \\|`, "m"));
});

it("packages the plugin's verification skill for Claude Code and Codex with one checksum", t => {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "stagekeeper-package-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = verifierPackage(PLUGIN_VERIFIER), result = packageWindowsPlugin({ output: path.join(root, "bundle"), runtimeDirectory: runtime(root) });
  assert.deepEqual(result.verifier, { checksum: source.checksum, files: source.files });
  for (const destination of ["skills/reconciling-proposals-with-codebase", "codex/skills/reconciling-proposals-with-codebase"]) {
    assert.equal(verifierPackage(path.join(result.path, destination)).checksum, source.checksum);
  }
});

it("packages each plugin hook to run its guard through the Windows launcher with the same trigger and failure behavior", t => {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "stagekeeper-package-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = packageWindowsPlugin({ output: path.join(root, "bundle"), runtimeDirectory: runtime(root) });
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
