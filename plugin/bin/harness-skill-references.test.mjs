import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { it } from "node:test";
import { capReason } from "../lib/plans/entitlement.mjs";

const PLUGIN = new URL("../", import.meta.url);
const PACKAGED = ["codex/skills/reconciling-proposals-with-codebase"];
const skillFiles = ["skills", "codex/skills"].flatMap(root => readdirSync(new URL(root, PLUGIN)).map(name => new URL(`${root}/${name}/SKILL.md`, PLUGIN))).filter(url => existsSync(url));

it("every plugin path a skill names exists, or is created by packaging", () => {
  const packaging = readFileSync(new URL("../scripts/windows/package-windows-plugin.mjs", PLUGIN), "utf8");
  for (const path of PACKAGED) assert.ok(packaging.includes(path), path);
  for (const file of skillFiles) {
    for (const [, path] of readFileSync(file, "utf8").matchAll(/`(?:\$CLAUDE_PLUGIN_ROOT\/)?((?:bin|lib|runtime|codex)\/[^`\s]+)`/g)) {
      assert.ok(existsSync(new URL(path, PLUGIN)) || PACKAGED.includes(path), `${file.pathname}: ${path}`);
    }
  }
});

it("the generator prints every marker the init skill tells the agent to read", () => {
  const generator = readFileSync(new URL("bin/harness-init.mjs", PLUGIN), "utf8");
  for (const marker of ["plan:", "write:", "skip(modified):", "skip(plan):", "refuse:", "server:", "Server URL required", "Installation report refused", "ready:", "installation remains pending", "note: that entry was also this repository's only record of the server URL"]) assert.ok(generator.includes(marker), marker);
  assert.match(capReason("free", "workspaces"), /^workspace cap reached on the free plan/);
});

it("Claude skill instructions name the verifier by its plugin path or its harness: name", () => {
  const verifier = new URL("skills/reconciling-proposals-with-codebase/SKILL.md", PLUGIN).href;
  const claude = [...skillFiles.filter(url => !url.pathname.includes("/codex/") && url.href !== verifier), new URL("skills/init/references/reconciliation-contract.md", PLUGIN)];
  assert.ok(claude.some(url => url.pathname.endsWith("/skills/watch/SKILL.md")));
  for (const file of claude) assert.doesNotMatch(readFileSync(file, "utf8"), /(?<!harness:|skills\/)reconciling-proposals-with-codebase/, file.pathname);
});
