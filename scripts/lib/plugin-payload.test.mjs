import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { it } from "node:test";
import { isShippedPluginFile } from "./plugin-payload.mjs";

it("selects plugin payload without templates, evals or test modules", () => {
  const shipped = ["plugin/.claude-plugin/plugin.json", "plugin/.codex-plugin/plugin.json", "plugin/lib/pipeline/step.mjs", "plugin/runtime/windows/RoleProcess.cs", "plugin/bin/harness", "plugin/templates-guide.md"];
  const excluded = ["plugin/templates/en/a.md", "plugin/evals/case.yaml", "plugin/bin/harness.test.mjs", "scripts/build.mjs", "other/plugin/bin/harness", "plugins/a.mjs"];
  assert.deepEqual([...shipped, ...excluded].filter(isShippedPluginFile), shipped);
});

it("loads the version checker in a copy containing no plugin or native runtime files", t => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "stagekeeper-payload-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ["lib/plugin-payload.mjs", "checks/verify-plugin-version.mjs"]) {
    const destination = join(root, "scripts", file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(new URL(`../${file}`, import.meta.url), destination);
  }
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `const { inspectPluginVersion } = await import(${JSON.stringify(pathToFileURL(join(root, "scripts/checks/verify-plugin-version.mjs")).href)}); if (inspectPluginVersion({changed: [], base: ['1.0.0','1.0.0'], head: ['1.0.0','1.0.0']}).problems.length) process.exit(1);`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
