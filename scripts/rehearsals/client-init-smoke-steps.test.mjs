import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { assertGeneratedAgents, containsSecret, helperCommand, summarize } from "./client-init-smoke-steps.mjs";

const currentPlugin = fileURLToPath(new URL("../../plugin/", import.meta.url));
const freeAgents = ["app-dev", "pm", "feature-scout", "work-assigner", "work-discoverer"];

function fixture(t, agents) {
  const root = mkdtempSync(join(tmpdir(), "stagekeeper-smoke-agents-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, ".claude", "agents");
  mkdirSync(directory, { recursive: true });
  for (const agent of agents) writeFileSync(join(directory, `${agent}.md`), `# ${agent}\n`);
  return root;
}

it("checks the previous plugin's own roles before requiring new roles after an update", async t => {
  const repo = fixture(t, ["app-dev", "pm", "feature-scout"]);
  const previousPlugin = join(repo, "previous-plugin");
  mkdirSync(join(previousPlugin, "lib", "plans"), { recursive: true });
  writeFileSync(join(previousPlugin, "lib", "plans", "entitlement.mjs"), 'export const limitsFor = () => ({ agents: ["pm", "feature-scout"] });\n');
  await assertGeneratedAgents(previousPlugin, repo, "free", ["app-dev"]);
  await assert.rejects(assertGeneratedAgents(currentPlugin, repo, "free", ["app-dev"]), /missing \[work-assigner.md, work-discoverer.md\]/);
  for (const agent of ["work-assigner", "work-discoverer"]) writeFileSync(join(repo, ".claude", "agents", `${agent}.md`), `# ${agent}\n`);
  await assertGeneratedAgents(currentPlugin, repo, "free", ["app-dev"]);
});

it("accepts the current Pro roles and rejects them for Free", async t => {
  const repo = fixture(t, [...freeAgents, "plan-verifier", "doc-auditor", "qa-verifier", "impl-verifier"]);
  await assertGeneratedAgents(currentPlugin, repo, "pro", ["app-dev"]);
  await assert.rejects(assertGeneratedAgents(currentPlugin, repo, "free", ["app-dev"]), /unexpected \[doc-auditor.md, impl-verifier.md, plan-verifier.md, qa-verifier.md\]/);
});

it("rejects the wrong role even when the generated file count matches", async t => {
  const repo = fixture(t, ["app-dev", "pm", "feature-scout", "work-assigner", "unknown-role"]);
  await assert.rejects(assertGeneratedAgents(currentPlugin, repo, "free", ["app-dev"]), /missing \[work-discoverer.md\], unexpected \[unknown-role.md\]/);
});

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
