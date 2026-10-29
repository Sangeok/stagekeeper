import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { isShippedPluginFile } from "../windows/package-windows-plugin.mjs";
import { inspectPluginVersion, pluginManifests, readPluginRelease } from "./verify-plugin-version.mjs";

const problems = input => inspectPluginVersion(input).problems;

test("shipped files follow the Windows package rules", () => {
  assert.deepEqual(["plugin/bin/harness.mjs", "plugin/.claude-plugin/plugin.json", "plugin/bin/harness.test.mjs", "plugin/templates/en/CLAUDE.runbook.md", "plugin/evals/rerun-asks-first/case.yaml", "scripts/build.mjs"].filter(isShippedPluginFile), ["plugin/bin/harness.mjs", "plugin/.claude-plugin/plugin.json"]);
});

test("passes when no shipped plugin file changed", () => {
  assert.deepEqual(problems({ changed: ["plugin/bin/harness.test.mjs", "plugin/templates/en/CLAUDE.runbook.md", "plugin/evals/fixtures/templates/en/CLAUDE.runbook.md"], base: ["0.5.18", "0.5.18"], head: ["0.5.18", "0.5.18"] }), []);
  assert.deepEqual(problems({ changed: [], base: ["0.5.18", "0.5.18"], head: ["0.5.18", "0.5.18"] }), []);
});

test("refuses a shipped change without a higher version in both manifests", () => {
  assert.match(problems({ changed: ["plugin/bin/harness-background.mjs"], base: ["0.5.18", "0.5.18"], head: ["0.5.18", "0.5.18"] }).join("\n"), /did not rise above 0\.5\.18/);
  assert.equal(problems({ changed: ["plugin/runtime/background.mjs"], base: ["0.5.18", "0.5.18"], head: ["0.5.17", "0.5.17"] }).length, 1);
  assert.deepEqual(problems({ changed: ["plugin/runtime/background.mjs", ...pluginManifests], base: ["0.5.18", "0.5.18"], head: ["0.5.19", "0.5.19"] }), []);
  assert.deepEqual(problems({ changed: ["plugin/runtime/background.mjs", ...pluginManifests], base: ["0.5.18", "0.5.18"], head: ["0.6.0", "0.6.0"] }), []);
  assert.deepEqual(problems({ changed: ["plugin/runtime/background.mjs", ...pluginManifests], base: ["0.5.9", "0.5.9"], head: ["0.5.10", "0.5.10"] }), []);
});

test("refuses manifests that disagree or carry no x.y.z version", () => {
  const split = problems({ changed: ["plugin/bin/harness.mjs", pluginManifests[0]], base: ["0.5.18", "0.5.18"], head: ["0.5.19", "0.5.18"] });
  assert.equal(split.length, 2);
  assert.match(split[0], /versions differ/);
  assert.match(problems({ changed: [], base: ["0.5.18", "0.5.18"], head: ["0.5.18", undefined] })[0], /x\.y\.z/);
});

test("reads versions and the changed plugin files between two refs", () => {
  const parent = realpathSync(tmpdir()), root = mkdtempSync(join(parent, "stagekeeper-plugin-version-"));
  const write = (file, body) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), body); };
  const git = (...args) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8" }).trim();
  const manifests = version => { for (const file of pluginManifests) write(file, JSON.stringify({ name: "harness", version })); };
  try {
    git("init", "--quiet");
    manifests("0.1.0");
    write("plugin/bin/harness.mjs", "1");
    write("README.md", "1");
    git("add", "-A"); git("commit", "--quiet", "-m", "base");
    const base = git("rev-parse", "HEAD");
    write("plugin/bin/harness.mjs", "2");
    write("plugin/bin/harness.test.mjs", "2");
    write("README.md", "2");
    git("add", "-A"); git("commit", "--quiet", "-m", "change");
    const release = readPluginRelease(root, base, "HEAD");
    assert.deepEqual(release, { changed: ["plugin/bin/harness.mjs", "plugin/bin/harness.test.mjs"], base: ["0.1.0", "0.1.0"], head: ["0.1.0", "0.1.0"] });
    assert.equal(inspectPluginVersion(release).problems.length, 1);
    manifests("0.1.1");
    git("add", "-A"); git("commit", "--quiet", "-m", "bump");
    assert.deepEqual(inspectPluginVersion(readPluginRelease(root, base, "HEAD")).problems, []);
  } finally {
    assert.ok(root.startsWith(parent + sep));
    rmSync(root, { recursive: true, force: true });
  }
});
