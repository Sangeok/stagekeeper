import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { gzipSync } from "node:zlib";
import { containsSecret } from "./client-init-smoke-steps.mjs";
import { BACKLOG_ITEM, HANDOFF_LIMIT_MS, INDEPENDENT_CASES, RUNNER_WAIT_LIMIT_MS, caseResults, openTranscripts, runFindings, sealTranscripts, smokeTriggerPaths, summarizePipeline, transcriptKey, waitVerdict, writeTranscripts } from "./pipeline-smoke-steps.mjs";

const line = value => JSON.stringify(value);
const toolUse = (id, name) => line({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input: {} }] } });
const toolError = id => line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: true, content: "refused" }] } });
const result = (turns, cost) => line({ type: "result", num_turns: turns, permission_denials: [], total_cost_usd: cost });
const sealRaw = (bundle, key) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(bundle))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
};

it("counts tool calls once across the run stream and the session transcripts", () => {
  const stream = [
    toolUse("t1", "mcp__harness__assignment_context"), toolError("t1"),
    toolUse("t2", "Bash"), toolError("t2"),
    toolUse("t3", "Agent"),
    line({ type: "user", message: { content: "plain prompt" } }),
    "not json",
    line({ type: "result", num_turns: 7, permission_denials: [{ tool_name: "Bash" }], total_cost_usd: 1.25, modelUsage: { "claude-opus-5-5": {}, "claude-sonnet-5-5": {} } }),
  ].join("\n");
  const transcript = [toolUse("t1", "mcp__harness__assignment_context"), toolError("t1"), toolUse("t4", "Task"), toolError("t4"), toolError("t9")].join("\n");
  const findings = runFindings([stream], [transcript]);
  assert.deepEqual(findings.harnessErrors, { assignment_context: 1 });
  assert.equal(findings.toolErrors, 4);
  assert.equal(findings.agentCalls, 2);
  assert.equal(findings.agentErrors, 1);
  assert.equal(findings.turns, 7);
  assert.equal(findings.denials, 1);
  assert.equal(findings.costUsd, 1.25);
  assert.deepEqual([...findings.models].sort(), ["claude-opus-5-5", "claude-sonnet-5-5"]);
});

it("adds turns, denials and cost over several runs", () => {
  const first = runFindings([result(3, 0.5)]);
  const second = runFindings([result(4, 0.25)]);
  const both = runFindings([result(3, 0.5), result(4, 0.25)]);
  assert.equal(both.turns, first.turns + second.turns);
  assert.equal(both.denials, first.denials + second.denials);
  assert.ok(Math.abs(both.costUsd - (first.costUsd + second.costUsd)) < 1e-9);
});

it("counts a session's cumulative cost and repeated denials once when the session reports several results", () => {
  const sessionResult = (turns, cost, denials) => line({ type: "result", session_id: "s1", num_turns: turns, permission_denials: denials, total_cost_usd: cost });
  const firstRun = [sessionResult(6, 0.75, [{ tool_use_id: "d1" }]), sessionResult(4, 1.5, [{ tool_use_id: "d1" }])].join("\n");
  const resumedRun = sessionResult(3, 1.5, [{ tool_use_id: "d1" }, { tool_use_id: "d2" }]);
  const otherSession = line({ type: "result", session_id: "s2", num_turns: 2, permission_denials: [{ tool_use_id: "d1" }], total_cost_usd: 0.25 });

  const findings = runFindings([firstRun, resumedRun, otherSession]);

  assert.equal(findings.costUsd, 1.75);
  assert.equal(findings.denials, 3);
  assert.equal(findings.turns, 15);
});

it("keeps only allowlisted values in the public summary", () => {
  const token = `hu_${"a".repeat(43)}`;
  const summary = summarizePipeline({
    os: "win32-x64", pluginCommit: "a".repeat(40), templatesCommit: "main", permission: "auto", runnerState: "idle", waitReason: "free text",
    steps: [{ step: "item-done", result: "pass" }, { step: `leak ${token}`, result: "pass" }],
    runs: ["done: 12 turns, 0 denied", `model said ${token}`],
    findings: { turns: 12, denials: 0, toolErrors: 5, agentCalls: 6, agentErrors: 0, costUsd: 3.456, models: ["claude-opus-5-5", "gpt-5"], harnessErrors: { assignment_context: 1, "Free Text": 2 } },
    stepRefusals: 0, minutesToDone: 31, sealed: true, seconds: 2400,
  });
  assert.equal(containsSecret(JSON.stringify(summary), token), false);
  assert.equal(summary.pluginCommit, "a".repeat(40));
  assert.equal(summary.templatesCommit, undefined);
  assert.equal(summary.runnerState, "idle");
  assert.equal(summary.waitReason, undefined);
  assert.deepEqual(summary.steps, [{ step: "item-done", result: "pass" }]);
  assert.deepEqual(summary.runs, ["done: 12 turns, 0 denied"]);
  assert.deepEqual(summary.models, ["claude-opus-5-5"]);
  assert.deepEqual(summary.harnessErrors, { assignment_context: 1 });
  assert.equal(summary.toolErrors, undefined);
  assert.equal(summary.agentCalls, 6);
  assert.equal(summary.stepRefusals, 0);
  assert.ok(Math.abs(summary.costUsd - 3.456) < 0.01);
  assert.equal(summary.result, "pass");
  assert.equal(summarizePipeline({ failure: "item-gated" }).result, "fail");
  assert.equal(summarizePipeline({ minutesToDone: -1 }).minutesToDone, undefined);
});

it("opens sealed transcripts only with the same key, an untouched file and safe names", () => {
  const key = randomBytes(32);
  const files = { "runs/20261102T000000000Z.jsonl": `${line({ type: "result" })}\n`, "background.log": "runner started\n" };
  const sealed = sealTranscripts(files, key);
  assert.deepEqual(openTranscripts(sealed, key), files);
  assert.deepEqual(openTranscripts(sealRaw({ version: 1, files }, key), key), files);
  assert.equal(sealed.includes(Buffer.from("runner started")), false);
  assert.throws(() => openTranscripts(sealed, randomBytes(32)));
  const tampered = Buffer.from(sealed);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => openTranscripts(tampered, key));
  assert.throws(() => openTranscripts(sealed.subarray(0, 20), key));
  assert.throws(() => openTranscripts(sealRaw({ version: 1, files: { "../outside.txt": "x" } }, key), key));
  assert.throws(() => openTranscripts(sealRaw({ version: 2, files: {} }, key), key));
  assert.throws(() => sealTranscripts(files, randomBytes(16)));
  assert.throws(() => sealTranscripts({ "../outside.txt": "x" }, key));
});

it("reads a base64 key of exactly 32 bytes", () => {
  const key = randomBytes(32);
  assert.deepEqual(transcriptKey(`${key.toString("base64")}\r\n`), key);
  assert.throws(() => transcriptKey(randomBytes(16).toString("base64")));
  assert.throws(() => transcriptKey(undefined));
});

it("writes opened transcripts only into a new directory", t => {
  const root = mkdtempSync(join(tmpdir(), "pipeline-transcripts-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = join(root, "opened");
  writeTranscripts({ "runs/a.jsonl": "x\n", "background.log": "y\n" }, out);
  assert.equal(readFileSync(join(out, "runs", "a.jsonl"), "utf8"), "x\n");
  assert.equal(readFileSync(join(out, "background.log"), "utf8"), "y\n");
  assert.throws(() => writeTranscripts({ "b.log": "z" }, out));
  assert.throws(() => writeTranscripts({ "../escape.log": "z" }, join(root, "other")));
  assert.equal(existsSync(join(root, "other")), false);
  assert.equal(existsSync(join(root, "escape.log")), false);
});

it("judges slugWords against the backlog request", () => {
  const reference = (text, maxWords) => {
    if (!Number.isInteger(maxWords) || maxWords < 1) throw new RangeError("maxWords must be a positive integer");
    return text.trim().split(/\s+/).slice(0, maxWords).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  };
  const emptyTextFirst = (text, maxWords) => (text.trim() === "" ? "" : reference(text, maxWords));
  assert.deepEqual(caseResults(reference), INDEPENDENT_CASES.map(() => true));
  assert.ok(caseResults(() => "one-two").includes(false));
  assert.ok(caseResults(emptyTextFirst).includes(false));
  assert.deepEqual(caseResults(() => { throw new TypeError("wrong"); }), INDEPENDENT_CASES.map(() => false));
  assert.match(BACKLOG_ITEM.source, /RangeError/);
  assert.match(BACKLOG_ITEM.source, /even when text is empty/);
});

it("ends the wait on completion and fails early on states an unattended run cannot leave", () => {
  const base = { next: { action: "dispatch" }, boardStatus: "implementing", runner: { running: true, state: "working" }, waitingMs: 0, now: 0, deadline: 1, timeoutStep: "item-done" };
  assert.deepEqual(waitVerdict(base), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...base, next: { action: "done" }, now: 1 }), { verdict: "done" });
  assert.deepEqual(waitVerdict({ ...base, boardStatus: "on_hold" }), { verdict: "fail", step: "item-held" });
  for (const [on, step] of [["gate", "item-gated"], ["acceptance", "acceptance-failed"], ["impl-verify", "impl-verify-failed"], ["qa", "qa-failed"], ["cap", "usage-cap"]]) {
    assert.deepEqual(waitVerdict({ ...base, next: { action: "wait", on } }), { verdict: "fail", step });
  }
  assert.deepEqual(waitVerdict({ ...base, next: { action: "wait", on: "unknown" } }), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...base, runner: { running: false, state: "stopped" } }), { verdict: "fail", step: "runner-ended" });
  assert.deepEqual(waitVerdict({ ...base, runner: { running: true, state: "waiting" }, waitingMs: RUNNER_WAIT_LIMIT_MS }), { verdict: "fail", step: "runner-waiting" });
  assert.deepEqual(waitVerdict({ ...base, runner: { running: true, state: "waiting" }, waitingMs: RUNNER_WAIT_LIMIT_MS - 1 }), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...base, next: null, now: 1, timeoutStep: "item-assigned" }), { verdict: "fail", step: "item-assigned" });
});

it("gives the main loop time to commit a handed-off file and fails a handoff that outlasts the limit", () => {
  const handoff = { next: { action: "wait", on: "handoff" }, boardStatus: "implementing", runner: { running: true, state: "working" }, waitingMs: 0, now: 0, deadline: 1, timeoutStep: "item-done" };
  assert.deepEqual(waitVerdict(handoff), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...handoff, handoffMs: HANDOFF_LIMIT_MS - 1 }), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...handoff, handoffMs: HANDOFF_LIMIT_MS }), { verdict: "fail", step: "item-handoff" });
  assert.deepEqual(waitVerdict({ ...handoff, runner: { running: false, state: "stopped" } }), { verdict: "fail", step: "runner-ended" });
});

it("lists pipeline-smoke trigger paths that exist in this repository", () => {
  const repository = new URL("../../", import.meta.url);
  const paths = smokeTriggerPaths(readFileSync(new URL("AGENTS.md", repository), "utf8"));
  for (const expected of ["packages/core/pipeline", "plugin/skills/watch", "scripts/rehearsals/pipeline-smoke-steps.mjs", ".github/actions/smoke-database"]) assert.ok(paths.includes(expected), expected);
  for (const entry of paths) assert.ok(existsSync(new URL(entry, repository)), `${entry} does not exist`);
  assert.deepEqual(smokeTriggerPaths("no command here"), []);
});
