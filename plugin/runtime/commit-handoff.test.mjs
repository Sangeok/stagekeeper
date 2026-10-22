import assert from "node:assert/strict";
import { it } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertCommitHandoff, assertHandoffSubmission, confirmCommitHandoff } from "./commit-handoff.mjs";
import { roleBridge } from "./codex-thread.mjs";
import { ROLE_TOOLS } from "./codex-agent.mjs";

function fixture(t, artifact = "docs/plans/A.md") {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "codex-handoff-test-"));
  t.after(() => { assert.equal(path.dirname(root), realpathSync(tmpdir())); return rm(root, { recursive: true }); });
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q");
  mkdirSync(path.dirname(path.join(root, artifact)), { recursive: true });
  writeFileSync(path.join(root, artifact), "Prepared artifact\n");
  git("add", "."); git("-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "artifact");
  const commit = git("rev-parse", "HEAD"), entry = { runId: "pipeline", entryId: "entry", slotId: "plan" };
  const dispatch = { agent: "dev", key: "A", agentKey: "A", agentRunId: "existing", entry };
  const next = { action: "wait", on: "handoff", key: "A", note: artifact, resume: dispatch };
  return { root, artifact, git, commit, dispatch, next };
}

it("binds a confirmed owner commit to the existing role and permits submission without commit permission", t => {
  const f = fixture(t);
  f.dispatch.commitHandoff = confirmCommitHandoff(f.root, "A", f.next, f.commit.slice(0, 8));
  assert.equal(f.dispatch.commitHandoff.commit, f.commit);
  assert.equal(f.dispatch.commitHandoff.absolutePath, path.join(f.root, f.artifact));
  assert.deepEqual(confirmCommitHandoff(f.root, "A", { ...f.next, note: path.join(f.root, f.artifact) }, f.commit), f.dispatch.commitHandoff);
  writeFileSync(path.join(f.root, "unrelated.txt"), "later\n");
  f.git("add", "."); f.git("-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "later");
  assertCommitHandoff(f.root, f.dispatch);
  assertHandoffSubmission(f.root, f.dispatch, "plan_submit", { path: f.artifact, commit: f.commit }, { receipt: { runId: "existing" } });
  for (const args of [{ path: f.artifact, commit: f.git("rev-parse", "HEAD") }, { path: "docs/plans/B.md", commit: f.commit }])
    assert.throws(() => assertHandoffSubmission(f.root, f.dispatch, "plan_submit", args, { receipt: { runId: "existing" } }));
  assert.throws(() => assertCommitHandoff(f.root, { ...f.dispatch, agentRunId: "new" }));
  assert.throws(() => assertCommitHandoff(f.root, { ...f.dispatch, entry: { ...f.dispatch.entry, entryId: "new" } }));
});

it("refuses a rewritten plan immediately before submission and preserves CRLF equivalence", t => {
  const f = fixture(t);
  f.dispatch.commitHandoff = confirmCommitHandoff(f.root, "A", f.next, f.commit);
  writeFileSync(path.join(f.root, f.artifact), "Prepared artifact\r\n");
  assertCommitHandoff(f.root, f.dispatch);
  writeFileSync(path.join(f.root, f.artifact), "Rewritten artifact\n");
  assert.throws(() => assertHandoffSubmission(f.root, f.dispatch, "plan_submit", { path: f.artifact, commit: f.commit }, { receipt: { runId: "existing" } }), /differs/);
});

it("limits confirmed report submissions to their file, tool and existing run", t => {
  const f = fixture(t, "docs/agents/dev/A.md");
  f.dispatch.commitHandoff = confirmCommitHandoff(f.root, "A", f.next, f.commit);
  const args = { path: f.artifact, commit: f.commit };
  assertHandoffSubmission(f.root, f.dispatch, "report_submit", args, { receipt: { runId: "existing" } });
  assert.throws(() => assertHandoffSubmission(f.root, f.dispatch, "report_submit", args, { receipt: { runId: "other" } }));
  assert.throws(() => assertHandoffSubmission(f.root, f.dispatch, "plan_submit", args, { receipt: { runId: "existing" } }));
  assert.throws(() => confirmCommitHandoff(f.root, "A", { ...f.next, note: "../outside.md" }, f.commit));
  assert.throws(() => confirmCommitHandoff(f.root, "A", { ...f.next, action: "dispatch" }, f.commit));
});

it("the HTTP bridge forwards a matching resumed submission and refuses bytes changed afterward", async t => {
  const f = fixture(t), submitted = [];
  f.dispatch.commitHandoff = confirmCommitHandoff(f.root, "A", f.next, f.commit);
  const receipt = { runId: "existing", revision: 1, stepId: "plan" };
  const bridge = await roleBridge({ binding: { root: f.root } }, {}, "s", f.dispatch, {
    listTools: async () => ROLE_TOOLS.dev.map(name => ({ name })),
    checkSession: async () => ({ event: "owned", client: "codex", lifecycle: "active" }),
    callTool: async (_input, name, args) => {
      if (name === "agent_next") return { done: false, step: "plan", receipt, agentRunId: "existing", entry: f.dispatch.entry };
      submitted.push(args); return { recorded: true };
    },
  });
  t.after(() => bridge.close());
  const call = (name, args = {}) => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }).then(response => response.json());
  assert.equal((await call("agent_next")).error, undefined);
  const args = { path: f.artifact, commit: f.commit, key: "A", type: "fix" };
  assert.equal((await call("plan_submit", args)).error, undefined);
  assert.equal(submitted.length, 1);
  writeFileSync(path.join(f.root, f.artifact), "Changed after owner commit\n");
  assert.ok((await call("plan_submit", args)).error);
  assert.equal(submitted.length, 1);
});
