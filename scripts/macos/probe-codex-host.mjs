import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppServer, dispatchFreshRole } from "../../plugin/runtime/codex-thread.mjs";
import { renderCodexRole, verifierPackage, ROLE_TOOLS } from "../../plugin/runtime/codex-agent.mjs";
import { gitRoot, readState, releaseSession, requestStop, startSession, stateFiles } from "../../plugin/runtime/local-session.mjs";

if (process.platform !== "darwin") throw new Error("A real macOS host is required");
const root = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-codex-host-probe-"));
const digest = value => createHash("sha256").update(value).digest("hex");
execFileSync("git", ["-C", root, "init", "-q"], { stdio: "pipe" });
const binding = { root, server: "http://127.0.0.1:1", project: "host-probe", configHash: digest("configuration"), tokenHash: digest("probe-token") };
const files = stateFiles(gitRoot(root).directory), verifier = verifierPackage(fileURLToPath(new URL("../../plugin/skills/reconciling-proposals-with-codebase/", import.meta.url)));
const role = "plan-verifier", started = await startSession(files, binding, { client: "codex", commit: false, propose: false });
mkdirSync(path.join(root, ".codex/agents"), { recursive: true }); mkdirSync(path.join(root, "docs/harness"), { recursive: true });
writeFileSync(path.join(root, "docs/harness/codex-package.json"), JSON.stringify({ verifier }));
const template = `---\nname: ${role}\ndescription: Native host policy probe\ntools: Read, Glob, Grep, Bash, Skill, ${ROLE_TOOLS[role].map(name => `mcp__harness__${name}`).join(", ")}\n---\n<!-- harness-runtime:harness-runtime-v1 -->\nA policy probe does not start a model.\n`;
writeFileSync(path.join(root, `.codex/agents/${role}.toml`), renderCodexRole(template, role));
const observations = { platform: process.platform, arch: process.arch, modelStarted: false, effectiveConfig: false, skills: false, thread: false, explicitStepBriefing: false };
class ProbeCompleted extends Error {}
try {
  await assert.rejects(dispatchFreshRole({ binding, token: "host-probe-token", config: { project: { slug: "host-probe" }, workspaces: [] } }, files, started.session,
    { agent: role, key: "PROBE-1", agentKey: "PROBE-1" }, {
      verifierPackage: () => verifier,
      listTools: async () => ROLE_TOOLS[role].map(name => ({ name, inputSchema: { type: "object", properties: {} } })),
      callTool: async () => { throw new Error("The host probe must not contact a product server"); },
      record: event => {
        if (event.event !== "role-briefing") return;
        assert.equal(event.executionMode, "step"); assert.equal(event.handoffConfirmed, false);
        observations.explicitStepBriefing = true; throw new ProbeCompleted();
      },
      createAppServer: child => {
        const server = new AppServer(child), request = server.request.bind(server);
        server.request = async (method, params, timeout) => {
          if (method === "turn/start") { observations.modelStarted = true; throw new Error("A host probe must not start a model"); }
          if (method === "thread/start") assert.match(params.developerInstructions, /No helper-confirmed commitHandoff was supplied/);
          const value = await request(method, params, timeout);
          if (method === "config/read") observations.effectiveConfig = true;
          if (method === "skills/list") observations.skills = true;
          if (method === "thread/start") observations.thread = Boolean(value.thread?.id);
          return value;
        };
        return server;
      },
    }), ProbeCompleted);
  assert.equal(observations.thread, true); assert.equal(observations.explicitStepBriefing, true); assert.equal(observations.modelStarted, false);
  assert.equal(readState(files).lock.children.length, 0);
  await requestStop(files, started.session); assert.equal((await releaseSession(files, started.session)).event, "released");
  console.log(JSON.stringify({ ...observations, quiescent: true, result: "pass" }));
} finally {
  if (readState(files) === null) rmSync(root, { recursive: true });
  else console.error(JSON.stringify({ result: "failed", retainedOwnership: true, evidence: root, ...observations }));
}
