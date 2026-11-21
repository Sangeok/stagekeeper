import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "./testing/closeout-fixture.mjs";

const usage = (status, capability = "qualified") => async () => ({ status, capability: { status: capability }, observationPerformed: true,
  observation: { coverageComplete: true }, observer: { state: "settled" } });
const clear = usage("clear");
const remoteRefs = f => f.git(["for-each-ref", "--format=%(refname) %(objectname)"], f.origin);
const ledger = (f, task) => f.git(["rev-parse", "refs/stagekeeper/pr-closeout/tasks/" + task.task]);
const localBranch = (f, task) => f.git(["for-each-ref", "--format=%(objectname)", "refs/heads/" + task.branchName]);
const row = (result, task) => result.sweep.results.find(entry => entry.task === task.task);
const sweep = async f => { const result = await f.run({ operation: "sweep" }); assert.equal(result.exitCode, 0, JSON.stringify(result)); return result; };
function mergedByPerson(f, task) {
  const head = f.commit(task); f.pr(task, head); f.mergeRemote(); return head;
}

test("a task a person merged is removed by sweep with no GitHub write and no remote ref change, and unmerged tasks stay", async t => {
  const f = fixture(t); await f.bootstrap(); f.ports.inspectUsage = clear;
  const merged = await f.create("merged"), unmerged = await f.create("unmerged"), untouched = await f.create("untouched");
  f.commit(unmerged, "other\n"); mergedByPerson(f, merged);
  f.git(["update-ref", "-d", "refs/heads/" + merged.branchName], f.origin);
  const before = remoteRefs(f);
  const result = await sweep(f);
  assert.deepEqual(row(result, merged), { task: merged.task, branchName: merged.branchName, path: merged.path, pr: 1,
    phase: "complete", worktree: "removed", branch: "removed", reasons: [] });
  assert.deepEqual(row(result, unmerged).reasons, ["no-merged-pr"]);
  assert.deepEqual(row(result, untouched).reasons, ["no-task-commits"]);
  assert.deepEqual([result.sweep.examined, result.sweep.removed, result.sweep.held, result.sweep.notExamined], [3, 1, 2, 0]);
  f.absent(merged.path); assert.equal(localBranch(f, merged), "");
  assert.equal(fs.existsSync(unmerged.path), true); assert.equal(fs.existsSync(untouched.path), true);
  assert.equal(f.state.puts, 0); assert.equal(remoteRefs(f), before);
  assert.equal((await f.run({ operation: "status", task: merged.task })).phase, "complete");
});

test("create sweeps before creating, leaves a held task's ledger untouched, and still creates the new task", async t => {
  const f = fixture(t); await f.bootstrap();
  const merged = await f.create("merged"), head = mergedByPerson(f, merged), recorded = ledger(f, merged);
  const status = await f.run({ operation: "status" });
  assert.equal(status.sweep, undefined);
  const next = await f.create("next");
  assert.deepEqual(row(next, merged).reasons, ["unqualified-profile"]);
  assert.equal(ledger(f, merged), recorded); assert.equal(localBranch(f, merged), head); assert.equal(fs.existsSync(merged.path), true);
  assert.equal(next.phase, "working"); assert.equal(fs.existsSync(next.path), true);
  assert.equal(row(next, next), undefined);
  f.ports.inspectUsage = clear;
  const later = await f.create("later");
  assert.equal(row(later, merged).phase, "complete"); f.absent(merged.path); assert.equal(localBranch(f, merged), "");
  assert.equal(later.phase, "working"); assert.equal(f.state.puts, 0);
});

test("each preservation boundary holds a merged task without a ledger write until the boundary is cleared", async t => {
  const f = fixture(t); await f.bootstrap(); f.ports.inspectUsage = clear;
  const task = await f.create("merged"), head = mergedByPerson(f, task), recorded = ledger(f, task);
  const note = path.join(task.path, "notes.txt"), secret = path.join(task.path, ".env");
  const boundaries = [
    { reason: "unpreserved-files", offline: true, set: () => fs.writeFileSync(note, "unsaved\n"), reset: () => fs.rmSync(note) },
    { reason: "unpreserved-files", offline: true, set: () => fs.writeFileSync(secret, "TOKEN=1\n"), reset: () => fs.rmSync(secret) },
    { reason: "no-merged-pr", set: () => f.git(["commit", "--allow-empty", "-m", "after merge"], task.path), reset: () => f.git(["reset", "--hard", head], task.path) },
    { reason: "no-merged-pr", set: () => { f.state.pr.merged = false; }, reset: () => { f.state.pr.merged = true; } },
    { reason: "worktree-in-use", set: () => { f.ports.inspectUsage = usage("busy"); }, reset: () => { f.ports.inspectUsage = clear; } },
    { reason: "usage-unverified", set: () => { f.ports.inspectUsage = usage("unknown"); }, reset: () => { f.ports.inspectUsage = clear; } },
    { reason: "open-dependent-pr", set: () => { f.state.dependency = true; }, reset: () => { f.state.dependency = false; } },
    { reason: "remote-branch-reused", set: () => f.git(["update-ref", "refs/heads/" + task.branchName, f.base], f.origin),
      reset: () => f.git(["update-ref", "refs/heads/" + task.branchName, head], f.origin) },
  ];
  for (const boundary of boundaries) {
    boundary.set();
    const requests = f.state.gets.length, result = await sweep(f);
    assert.deepEqual(row(result, task).reasons, [boundary.reason]);
    if (boundary.offline) assert.equal(f.state.gets.length, requests);
    assert.equal(ledger(f, task), recorded); assert.equal(fs.existsSync(task.path), true);
    boundary.reset();
    assert.equal(localBranch(f, task), head);
  }
  assert.equal(row(await sweep(f), task).phase, "complete"); f.absent(task.path); assert.equal(f.state.puts, 0);
});

test("a squash merge is proven by its merge commit, and a merge commit no newer than the task base is refused", async t => {
  const f = fixture(t); await f.bootstrap(); f.ports.inspectUsage = clear;
  const task = await f.create("squashed"), head = f.commit(task); f.pr(task, head);
  const tree = f.git(["rev-parse", head + "^{tree}"], f.origin);
  const squash = f.git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit-tree", tree, "-p", f.base, "-m", "squash"], f.origin);
  Object.assign(f.state.pr, { state: "closed", merged: true, merge_commit_sha: f.base });
  assert.deepEqual(row(await sweep(f), task).reasons, ["merge-predates-task"]); assert.equal(fs.existsSync(task.path), true);
  f.git(["update-ref", "refs/heads/dev", squash], f.origin); f.state.pr.merge_commit_sha = squash;
  assert.equal(row(await sweep(f), task).phase, "complete"); f.absent(task.path); assert.equal(localBranch(f, task), "");
  assert.throws(() => f.git(["merge-base", "--is-ancestor", head, squash], f.origin));
});

test("a file written after the precheck is caught by the guarded recheck and nothing is removed", async t => {
  const f = fixture(t); await f.bootstrap();
  const task = await f.create("raced"), head = mergedByPerson(f, task), recorded = ledger(f, task), late = path.join(task.path, "late.txt");
  f.ports.inspectUsage = async () => { fs.writeFileSync(late, "written during the sweep\n"); return clear(); };
  assert.deepEqual(row(await sweep(f), task).reasons, ["unpreserved-files"]);
  assert.equal(ledger(f, task), recorded); assert.equal(localBranch(f, task), head);
  assert.equal(fs.readFileSync(late, "utf8"), "written during the sweep\n");
});

test("a sweep that loses the race to the owner's complete changes nothing, and a later sweep finishes the pending cleanup", async t => {
  const f = fixture(t); await f.bootstrap();
  const task = await f.create("owned"), head = mergedByPerson(f, task);
  let owner;
  f.ports.inspectUsage = async () => {
    if (owner) return usage("unknown", "unqualified")();
    owner = f.run(f.effect(task, head));
    await owner;
    return clear();
  };
  const lost = row(await sweep(f), task);
  assert.deepEqual([lost.phase, lost.reasons], ["cleanup-pending", ["state-changed"]]);
  const pending = await owner;
  assert.deepEqual([pending.phase, pending.reasons], ["cleanup-pending", ["unqualified-profile"]]);
  assert.equal(ledger(f, task), pending.state); assert.equal(fs.existsSync(task.path), true);
  f.ports.inspectUsage = clear;
  assert.equal(row(await sweep(f), task).phase, "complete"); f.absent(task.path); assert.equal(localBranch(f, task), "");
});

test("a task whose worktree was already removed keeps its branch for the explicit cleanup procedure", async t => {
  const f = fixture(t); await f.bootstrap();
  const task = await f.create("interrupted"), head = mergedByPerson(f, task);
  const pending = await f.run(f.effect(task, head));
  f.git(["worktree", "remove", "--", task.path]);
  const acknowledged = await f.run(f.effect(pending, head, "acknowledge-removal", { externalRemovalConfirmed: true }));
  f.ports.inspectUsage = clear;
  assert.deepEqual(row(await sweep(f), task).reasons, ["worktree-effect-recorded"]);
  assert.equal(ledger(f, task), acknowledged.state); assert.equal(localBranch(f, task), head);
});

test("the start budget stops new candidates and reports them without abandoning the one already started", async t => {
  const f = fixture(t); await f.bootstrap(); f.ports.inspectUsage = clear;
  const merged = await f.create("merged"), other = await f.create("other");
  f.commit(other, "other\n"); mergedByPerson(f, merged);
  let now = 0;
  f.ports.clock = () => (now += 15000);
  const limited = await sweep(f);
  assert.deepEqual([limited.sweep.examined, limited.sweep.notExamined], [1, 1]);
  const started = limited.sweep.results[0];
  assert.deepEqual(started.task === merged.task ? started.phase : started.reasons, started.task === merged.task ? "complete" : ["no-merged-pr"]);
  f.ports.clock = () => 0;
  const rest = await sweep(f);
  assert.equal(rest.sweep.notExamined, 0);
  f.absent(merged.path); assert.equal(fs.existsSync(other.path), true);
});
