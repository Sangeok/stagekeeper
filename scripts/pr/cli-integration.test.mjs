import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { fixture } from "./testing/closeout-fixture.mjs";
import { digest, json } from "./git-workspace.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("only the pr entry and new per-OS regression gates remain in current executable configuration", () => {
  for (const file of ["manage-task-worktrees.mjs", "manage-task-worktrees.test.mjs", "cleanup-task-branches.mjs", "cleanup-task-branches.test.mjs"]) {
    assert.equal(fs.existsSync(path.join(root, "scripts", file)), false);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
  assert.equal(manifest.scripts.pr, "node scripts/pr/index.mjs"); assert.equal(manifest.scripts.worktrees, undefined);
  assert.equal(manifest.scripts["branches:cleanup"], undefined);
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "check.yml"), "utf8");
  const matrix = workflow.slice(workflow.indexOf("  task-worktrees:"), workflow.indexOf("\n  check:"));
  assert.match(matrix, /os: \[windows-2022, macos-15\]/); assert.match(matrix, /fetch-depth: 0/);
  for (const name of ["lifecycle", "merge", "cleanup", "recovery", "migration", "preservation", "cli-integration"]) assert.ok(matrix.includes("node --test scripts/pr/" + name + ".test.mjs"));
  for (const file of ["index.mjs", "task-state.mjs", "git-workspace.mjs", "filesystem-inventory.mjs", "github-merge.mjs", "legacy-migration.mjs"]) {
    const source = fs.readFileSync(path.join(root, "scripts", "pr", file), "utf8");
    assert.doesNotMatch(source, /manage-task-worktrees\.mjs|cleanup-task-branches\.mjs|from\s+["'][^"']*testing\//);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /npm run worktrees|branches:cleanup|git branch -D.*fallback/);
});

test("real CLI emits one JSON document, rejects dirty management source and performs explicit empty bootstrap", async t => {
  const f = fixture(t), scripts = path.join(f.root, "scripts"); fs.mkdirSync(scripts);
  fs.cpSync(path.join(root, "scripts", "pr"), path.join(scripts, "pr"), { recursive: true });
  f.git(["add", "scripts"]); f.git(["commit", "-m", "management source"]);
  const cli = path.join(scripts, "pr", "index.mjs");
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args, "--root", f.root], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.error, undefined);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout); assert.equal(report.exitCode, result.status);
    return report;
  };
  assert.equal(run(["status"]).active, false);
  const preview = run(["migrate", "preview"]), plan = preview.plan;
  const file = path.join(f.directory, "real-plan.json"); fs.writeFileSync(file, json(plan));
  const args = ["migrate", "apply", "--plan", file, "--expected-plan-digest", digest(json(plan)), "--expected-migration-state", "absent", "--writers-quiescent", "--owners-confirmed"];
  fs.appendFileSync(path.join(scripts, "pr", "task-state.mjs"), "\n");
  assert.deepEqual(run(args).reasons, ["control-source-dirty"]);
  assert.equal(fs.existsSync(path.join(f.common, "stagekeeper-pr-closeout")), false);
  const original = fs.readFileSync(path.join(root, "scripts", "pr", "task-state.mjs")); fs.writeFileSync(path.join(scripts, "pr", "task-state.mjs"), original);
  const active = run(args); assert.equal(active.phase, "applied", json(active));
  const created = run(["create", "--owner", "fixture", "--branch", "harness/cli", "--path", path.join(f.directory, "cli-task")]);
  assert.equal(created.phase, "working", json(created)); assert.equal(fs.existsSync(created.path), true);
  assert.equal(run(["status", "--task", created.task]).state, created.state);
});
