import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { evalTurn, gradeInitEvaluation, managedSnapshot } from "./codex-init-eval.mjs";

const fixture = t => { const root = mkdtempSync(path.join(realpathSync(tmpdir()), "codex-eval-test-")); t.after(() => rmSync(root, { recursive: true, force: true })); return root; };
const events = [
  { type: "item.completed", item: { type: "command_execution", command: "cat /package/codex/skills/harness-init/SKILL.md", exit_code: 0 } },
  { type: "item.completed", item: { type: "command_execution", command: "/bin/zsh -lc stagekeeper-eval-dry-run", exit_code: 0, aggregated_output: "planned: no installation changes\n" } },
  { type: "item.completed", item: { type: "agent_message", text: "Modified files are preserved." } },
  { type: "turn.completed" },
];

it("detects actual writes and grades completed tool-backed dry runs without accepting narrative-only claims", t => {
  const root = fixture(t); writeFileSync(path.join(root, "CLAUDE.md"), "owner\n");
  const before = managedSnapshot(root);
  assert.equal(gradeInitEvaluation({ name: "dry-run-only", events, before, after: managedSnapshot(root) }).passed, true);
  writeFileSync(path.join(root, "CLAUDE.md"), "changed\n");
  assert.throws(() => gradeInitEvaluation({ name: "dry-run-only", events, before, after: managedSnapshot(root) }), /changed files/);
  for (const bad of [events.filter(e => e.type !== "turn.completed"), events.filter(e => e.item?.type !== "command_execution"), [...events, { type: "turn.failed" }], [...events, { type: "item.completed", item: { type: "command_execution", command: "/package/bin/harness init --adopt" } }], events.map(e => e === events[1] ? { ...e, item: { ...e.item, command: "node /package/bin/harness-init.mjs --client codex --dry-run" } } : e)]) assert.throws(() => gradeInitEvaluation({ name: "dry-run-only", events: bad, before, after: before }));
  assert.equal(gradeInitEvaluation({ name: "control-write", events, before, after: managedSnapshot(root), marker: "CONTROL_OK\n" }).passed, true);
  assert.throws(() => gradeInitEvaluation({ name: "control-write", events, before, after: before, marker: "CONTROL_OK\n" }));
});

it("refuses running helpers for an incomplete package even if the model describes the blocker", () => {
  const inspected = [events[0], { type: "item.completed", item: { type: "agent_message", text: "Missing packaged runtime." } }, { type: "turn.completed" }];
  assert.equal(gradeInitEvaluation({ name: "incomplete-package", events: inspected, before: [], after: [] }).passed, true);
  assert.throws(() => gradeInitEvaluation({ name: "incomplete-package", events: [...inspected, events[1]], before: [], after: [] }));
});

it("requires completion and preservation evidence from a successful dry run", () => {
  const planned = "planned: no installation changes\n";
  const preserved = "skip(modified): docs/harness/codex-runbook.md\n";
  const command = events[1].item.command;
  const grade = (overrides) => gradeInitEvaluation({
    name: "modified-file", before: [], after: [],
    events: [events[0], { ...events[1], item: { ...events[1].item, aggregated_output: preserved + planned, ...overrides } }, ...events.slice(2)],
  });
  assert.equal(grade({}).passed, true);
  for (const aggregated_output of [planned, preserved, "server: example\n" + preserved + planned]) {
    assert.throws(() => grade({ aggregated_output }), /result must be observed/);
  }
  assert.throws(() => grade({ exit_code: 3 }), /must succeed/);
  for (const inspection of ["cat /package/bin/harness-init.mjs", "cat stagekeeper-eval-dry-run", command + "; cat source"]) {
    assert.throws(() => grade({ command: inspection }), /must execute/);
  }
});

it("recognizes the final helper after a read-only launcher and repository check", () => {
  const helper = "stagekeeper-eval-dry-run";
  const guard = [
    "expected_launcher='/installed test package/bin/harness'",
    'expected_repo="$(pwd -P)"',
    'if [[ "${STAGEKEEPER_EVAL_LAUNCHER:-}" != "$expected_launcher" || "${STAGEKEEPER_EVAL_REPO:-}" != "$expected_repo" ]]; then',
    "  printf '%s\\n' 'unexpected evaluation target'",
    "  exit 2",
    "fi",
    helper,
  ].join("\n");
  function grade(script, { name = "dry-run-only", exitCode = 0, output = events[1].item.aggregated_output } = {}) {
    const quoted = "'" + script.replaceAll("'", "'\\''") + "'";
    const call = { ...events[1], item: { ...events[1].item, command: `/bin/zsh -lc ${quoted}`, exit_code: exitCode, aggregated_output: output } };
    return gradeInitEvaluation({ name, events: [events[0], call, ...events.slice(2)], before: [], after: [] });
  }
  assert.equal(grade(guard).passed, true);
  assert.equal(grade(guard, { name: "modified-file", output: "skip(modified): docs/harness/codex-runbook.md\nplanned: no installation changes\n" }).passed, true);
  assert.throws(() => grade(guard, { exitCode: 2, output: "unexpected evaluation target\n" }), /must succeed/);
  assert.throws(() => grade(guard, { output: "" }), /result must be observed/);
  assert.throws(() => grade(guard, { name: "modified-file" }), /result must be observed/);
  assert.throws(() => grade(guard, { name: "incomplete-package" }), /incomplete package must not run/i);
  for (const unverified of [
    `cat /package/bin/harness-init.mjs\n# ${helper}`,
    guard.replace("exit 2", "exit 0"),
    guard.replace("expected_repo=", "OTHER="),
    guard.replace('"$expected_repo"', '"$expected_launcher"'),
    `${guard}\ncat /package/bin/harness-init.mjs`,
  ]) assert.throws(() => grade(unverified), /must execute/);
});

it("filters native output at the process boundary and preserves the native exit code", { skip: process.platform === "win32" }, t => {
  const root = fixture(t);
  const launcher = path.join(root, "installed launcher");
  writeFileSync(launcher, [
    "#!/bin/sh",
    '[ "$#" -eq 6 ] && [ "$1" = init ] && [ "$2" = --client ] && [ "$3" = codex ] && [ "$4" = --dry-run ] && [ "$5" = --root ] && [ "$6" = "$STAGEKEEPER_EVAL_REPO" ] || exit 9',
    'echo "server: private-endpoint"',
    'echo "private diagnostics" >&2',
    'echo "skip(modified): another-private-file"',
    'echo "skip(modified): docs/harness/codex-runbook.md"',
    'echo "planned: no installation changes"',
    'exit "$TEST_LAUNCHER_EXIT"',
  ].join("\n") + "\n", { mode: 0o700 });
  for (const status of [0, 3]) {
    const result = spawnSync(path.join(import.meta.dirname, "stagekeeper-eval-dry-run"), [], {
      env: { STAGEKEEPER_EVAL_LAUNCHER: launcher, STAGEKEEPER_EVAL_REPO: root, TEST_LAUNCHER_EXIT: String(status) }, encoding: "utf8",
    });
    assert.ifError(result.error);
    assert.equal(result.status, status);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "skip(modified): docs/harness/codex-runbook.md\nplanned: no installation changes\n");
  }
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
