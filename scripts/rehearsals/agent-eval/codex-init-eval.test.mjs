import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { receiptOutput } from "./codex-init-eval-observer.mjs";
import { evalTurn, gradeInitEvaluation, managedSnapshot } from "./codex-init-eval.mjs";

const fixture = t => { const root = mkdtempSync(path.join(realpathSync(tmpdir()), "codex-eval-test-")); t.after(() => rmSync(root, { recursive: true, force: true })); return root; };
const planned = "planned: no installation changes";
const preserved = "skip(modified): docs/harness/codex-runbook.md";

function command(text, output = "", exit = 0) {
  return { type: "item.completed", item: { type: "command_execution", command: text, exit_code: exit, aggregated_output: output } };
}

function sample(name, lines) {
  const turn = { name, repetition: 1, id: randomUUID() };
  const calls = lines ? [{ receipt: randomUUID(), lines, exitCode: 0 }] : [];
  const observation = { ...turn, complete: true, target: name === "incomplete-package" ? null : {}, attempts: calls.length, calls };
  const events = [command("cat /package/codex/skills/harness-init/SKILL.md")];
  if (calls.length) events.push(command("/bin/zsh -lc stagekeeper-eval-dry-run", receiptOutput(calls[0]) + "\n"));
  events.push({ type: "item.completed", item: { type: "agent_message", text: "Missing package or modified file preserved" } }, { type: "turn.completed" });
  return { name, turn, observation, events, before: [], after: [] };
}

it("credits the observed native exit and output across shell spellings", () => {
  const input = sample("modified-file", [preserved, planned]);
  for (const script of ["stagekeeper-eval-dry-run", "test -x /package/bin/harness && stagekeeper-eval-dry-run", "/verified/stagekeeper-eval-dry-run"]) {
    input.events[1].item.command = script;
    assert.equal(gradeInitEvaluation(input).passed, true);
  }
  const failed = sample("modified-file", [preserved, planned]);
  failed.observation.calls[0].exitCode = failed.events[1].item.exit_code = 2;
  assert.throws(() => gradeInitEvaluation(failed), /must succeed/);
  assert.throws(() => gradeInitEvaluation(sample("modified-file", [planned])), /must be observed/);
  input.events.splice(1, 0, command("/package/bin/harness init --adopt"));
  assert.throws(() => gradeInitEvaluation(input), /adopt/);
});

it("requires matching receipts from this turn and rejects source-only output", () => {
  const input = sample("dry-run-only", [planned]);
  const other = sample("dry-run-only", [planned]);
  assert.throws(() => gradeInitEvaluation({ ...input, observation: other.observation }), /observation-unverified/);
  input.events[1] = command("cat /package/bin/harness-init.mjs", planned);
  assert.throws(() => gradeInitEvaluation(input), /observation-unverified/);
  const sourceOnly = sample("dry-run-only");
  sourceOnly.events.splice(1, 0, command("cat /package/bin/harness-init.mjs", planned));
  assert.throws(() => gradeInitEvaluation(sourceOnly), /must execute/);
  sourceOnly.events[1] = other.events[1];
  assert.throws(() => gradeInitEvaluation(sourceOnly), /observation-unverified/);
  other.events[1].item.aggregated_output += "server: unexpected\n";
  assert.throws(() => gradeInitEvaluation(other), /observation-unverified/);
  const missingTurn = sample("dry-run-only", [planned]);
  missingTurn.events.pop();
  assert.throws(() => gradeInitEvaluation(missingTurn), /model turn must complete/);
});

it("credits zero attempts only with complete coverage of the incomplete-package turn", () => {
  const input = sample("incomplete-package");
  assert.equal(gradeInitEvaluation(input).passed, true);
  for (const observation of [undefined, { ...input.observation, complete: false }, { ...input.observation, name: "preflight" }]) {
    assert.throws(() => gradeInitEvaluation({ ...input, observation }), /observation-unverified/);
  }
  assert.throws(() => gradeInitEvaluation({ ...input, observation: { ...input.observation, attempts: 1 } }), /must not run/);
  input.events.splice(1, 0, command("stagekeeper-eval-dry-run", "dry-run observation unavailable\n", 125));
  assert.throws(() => gradeInitEvaluation(input), /observation-unverified/);
});

it("checks actual file state independently of execution evidence", t => {
  const root = fixture(t);
  writeFileSync(path.join(root, "CLAUDE.md"), "owner\n");
  const before = managedSnapshot(root);
  writeFileSync(path.join(root, "CLAUDE.md"), "changed\n");
  const after = managedSnapshot(root);
  assert.throws(() => gradeInitEvaluation({ ...sample("dry-run-only", [planned]), before, after }), /changed files/);
  assert.equal(gradeInitEvaluation({ ...sample("control-write"), marker: "CONTROL_OK\n", before, after }).passed, true);
  assert.throws(() => gradeInitEvaluation({ ...sample("control-write"), marker: "CONTROL_OK\n", before, after: before }));
});

it("retains private child output on failure and rejects timed out turns", { skip: process.platform === "win32" ? "The macOS eval uses POSIX process groups" : false }, async t => {
  const root = fixture(t);
  const options = { cli: { executable: process.execPath, prefix: [] }, env: {}, cwd: root };
  const log = path.join(root, "failed.json");
  await assert.rejects(evalTurn({
    ...options, args: ["-e", 'console.error("synthetic-private-log"); process.exitCode = 1'], log,
  }), /eval-client-failed/);
  assert.equal(JSON.parse(readFileSync(log, "utf8")).stderr.trim(), "synthetic-private-log");
  const timeoutLog = path.join(root, "timeout.json");
  await assert.rejects(evalTurn({
    ...options, args: ["-e", "setInterval(() => {}, 1000)"], log: timeoutLog, timeoutMs: 150,
  }), /eval-timeout/);
  assert.equal(typeof JSON.parse(readFileSync(timeoutLog, "utf8")).stderr, "string");
});
