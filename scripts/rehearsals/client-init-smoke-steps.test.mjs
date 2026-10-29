import assert from "node:assert/strict";
import { join } from "node:path";
import { it } from "node:test";
import { containsSecret, helperCommand, summarize } from "./client-init-smoke-steps.mjs";

it("runs the helper through the launcher on Windows and through node elsewhere, as the init skill says", () => {
  assert.deepEqual(helperCommand("win32", "C:/p", "init", ["--dry-run"]), {
    file: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join("C:/p", "bin", "harness.ps1"), "init", "--dry-run"],
  });
  assert.deepEqual(helperCommand("darwin", "/p", "init", ["--dry-run"]), { file: "node", args: [join("/p", "bin", "harness-init.mjs"), "--dry-run"] });
});

it("keeps only allowed summary fields and never a token", () => {
  const token = "hu_" + "x".repeat(43);
  const summary = summarize({ client: "claude", os: "windows-2022", scenario: "new-user", note: token, output: `Bearer ${token}` });
  assert.equal(JSON.stringify(summary).includes(token), false);
  assert.equal("output" in summary, false);
});

it("drops step names and failure codes that are not plain identifiers", () => {
  const token = "hu_" + "x".repeat(43);
  const summary = summarize({ steps: [{ step: "register", result: "pass" }, { step: token, result: "pass" }, { step: "generate", result: "maybe" }], failure: `write ${token}` });
  assert.deepEqual(summary.steps, [{ step: "register", result: "pass" }]);
  assert.equal("failure" in summary, false);
});

it("reports a token value without returning it", () => {
  const token = "hu_" + "x".repeat(43);
  assert.equal(containsSecret(`{"Authorization":"Bearer ${token}"}`, token), true);
  assert.equal(containsSecret('{"Authorization":"Bearer ${HARNESS_TOKEN}"}', token), false);
});
