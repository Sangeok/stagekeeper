import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { verifierPackage } from "../../plugin/runtime/codex-agent.mjs";
import { packageWindowsPlugin } from "./package-windows-plugin.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const PLUGIN_VERIFIER = fileURLToPath(new URL("../../plugin/skills/reconciling-proposals-with-codebase/", import.meta.url));

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
