import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { evalTurn, gradeInitEvaluation, managedSnapshot } from "./codex-init-eval.mjs";

const fixture = t => { const root = mkdtempSync(path.join(realpathSync(tmpdir()), "codex-eval-test-")); t.after(() => rmSync(root, { recursive: true, force: true })); return root; };
const events = [
  { type: "item.completed", item: { type: "command_execution", command: "cat /package/codex/skills/harness-init/SKILL.md", exit_code: 0 } },
  { type: "item.completed", item: { type: "command_execution", command: "/package/bin/harness init --client codex --dry-run", exit_code: 0 } },
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

it("retains private child output on timeout and never treats it as a completed evaluation", { skip: process.platform === "win32" ? "The macOS eval uses POSIX process groups" : false }, async t => {
  const root = fixture(t), log = path.join(root, "private.json"), file = path.join(root, "fake.mjs");
  writeFileSync(file, 'console.error("synthetic-private-log"); setInterval(() => {}, 1000);');
  await assert.rejects(evalTurn({ cli: { executable: process.execPath, prefix: [] }, args: [file], env: {}, cwd: root, log, timeoutMs: 150 }), /eval-timeout/);
  assert.match(readFileSync(log, "utf8"), /synthetic-private-log/);
});
