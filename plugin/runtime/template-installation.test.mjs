import assert from "node:assert/strict";
import { it } from "node:test";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import { installReadyFixture } from "../../tests/plugin/template-fixture.mjs";
import { readInstalledTemplate, assertInitSessionQuiescent } from "./template-installation.mjs";
import { acquireInitGuard } from "./file-ownership.mjs";
import { gitRoot, startSession, stateFiles, requestStop, releaseSession } from "./local-session.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "template-installation-test-"));
  t.after(() => rmSync(root, { recursive: true }));
  writeFileSync(path.join(root, "harness.json"), JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main", slug: "fixture" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] }));
  writeFileSync(path.join(root, "CLAUDE.md"), "User rules\n<!-- harness:runbook:start -->\nManaged\n<!-- harness:runbook:end -->\n");
  const installation = installReadyFixture(root);
  return { root, installation };
}

it("ready installation validates current bytes and config while preserving user text outside the runbook block", async t => {
  const { root, installation } = fixture(t);
  assert.deepEqual(readInstalledTemplate(root, "claude", "pm").installation, installation);
  writeFileSync(path.join(root, "CLAUDE.md"), readFileSync(path.join(root, "CLAUDE.md"), "utf8") + "More user rules\n");
  assert.deepEqual(readInstalledTemplate(root, "claude").installation, installation);
  const release = await acquireInitGuard(root);
  try { assert.throws(() => readInstalledTemplate(root, "claude"), /in progress/); } finally { release(); }
  writeFileSync(path.join(root, "docs/plans/template.md"), "User modification");
  assert.throws(() => readInstalledTemplate(root, "claude"), /Managed template files changed/);
  installReadyFixture(root);
  writeFileSync(path.join(root, "harness.json"), readFileSync(path.join(root, "harness.json"), "utf8") + "\n");
  assert.throws(() => readInstalledTemplate(root, "claude"), /Configuration changed/);
});

it("the native MCP hook injects verified installation without granting permission or changing receipts and parents", async t => {
  const { root, installation } = fixture(t);
  const args = { agent: "pm", execution: { kind: "legacy", runId: "parent", node: "propose" }, receipt: { runId: "role", stepId: "start", revision: 3 }, outcome: "ok", installation: { releaseId: "forged" } };
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ templateRelease: { ...installation, id: installation.releaseId, schemaVersion: 1 } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const invoke = async () => {
    const child = execFile(process.execPath, ["plugin/bin/harness-template-guard.mjs"], { env: { ...process.env, HARNESS_TOKEN: "hs_" + "x".repeat(43), HARNESS_SERVER: `http://127.0.0.1:${server.address().port}` } });
    child.stdin.end(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "mcp__harness__agent_next", cwd: root, tool_input: args }));
    let output = ""; for await (const chunk of child.stdout) output += chunk;
    return JSON.parse(output);
  };
  const output = (await invoke()).hookSpecificOutput;
  assert.equal(output.permissionDecision, undefined);
  assert.deepEqual(output.updatedInput, { ...args, installation, client: "claude", project: "fixture" });
  writeFileSync(path.join(root, ".claude/agents/pm.md"), "Changed role");
  const denied = (await invoke()).hookSpecificOutput;
  assert.equal(denied.permissionDecision, "deny"); assert.equal(denied.updatedInput, undefined);
});

it("init and session creation share a barrier in both acquisition orders", async t => {
  const { root } = fixture(t);
  execFileSync("git", ["init", "-q", root]);
  await assertInitSessionQuiescent(root);
  const files = stateFiles(gitRoot(root).directory);
  const binding = { root, server: "https://fixture.invalid", project: "fixture", tokenHash: "a".repeat(64), configHash: "b".repeat(64) };
  const release = await acquireInitGuard(root);
  try { await assert.rejects(startSession(files, binding, { client: "claude", commit: false, propose: false }), /init is in progress/); }
  finally { release(); }
  const started = await startSession(files, binding, { client: "claude", commit: false, propose: false });
  await assert.rejects(assertInitSessionQuiescent(root), /existing session/);
  await requestStop(files, started.session); await releaseSession(files, started.session);
  await assertInitSessionQuiescent(root);
});
