import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "./testing/closeout-fixture.mjs";

const clear = async () => ({ status: "clear", capability: { status: "qualified" }, observationPerformed: true,
  observation: { coverageComplete: true }, observer: { state: "settled" } });
const remoteRefs = f => f.git(["for-each-ref", "--format=%(refname) %(objectname)"], f.origin);
const remoteBranch = (f, task, ...change) => f.git(["update-ref", ...change.length ? ["refs/heads/" + task.branchName, ...change] : ["-d", "refs/heads/" + task.branchName]], f.origin);
const localBranch = (f, task) => f.git(["for-each-ref", "--format=%(objectname)", "refs/heads/" + task.branchName]);

test("unqualified completion merges once, preserves both worktrees and supports receipt-only manual removal", async t => {
  const f = fixture(t); await f.bootstrap();
  const a = await f.create("a"), b = await f.create("b");
  const head = f.commit(a); f.pr(a, head);
  const input = f.effect(a, head), pending = await f.run(input);
  assert.equal(pending.phase, "cleanup-pending", JSON.stringify(pending));
  assert.equal(pending.exitCode, 2); assert.equal(pending.merge.head, head); assert.equal(f.state.puts, 1);
  assert.equal(fs.existsSync(a.path), true); assert.equal(fs.existsSync(b.path), true);
  assert.equal(f.git(["rev-parse", "refs/heads/" + a.branchName]), head);
  const repeat = await f.run(input); assert.equal(repeat.phase, "cleanup-pending"); assert.equal(f.state.puts, 1);
  f.git(["worktree", "remove", "--", a.path]);
  const unconfirmed = await f.run(f.effect(repeat, head, "cleanup")); assert.deepEqual(unconfirmed.reasons, ["external-removal-unconfirmed"]);
  const calls = f.usageCalls(), ref = f.git(["rev-parse", "refs/heads/" + a.branchName]);
  const ackInput = f.effect(unconfirmed, head, "acknowledge-removal", { externalRemovalConfirmed: true });
  const ack = await f.run(ackInput);
  assert.equal(ack.exitCode, 0, JSON.stringify(ack)); assert.equal(ack.worktree.state, "external");
  assert.equal(f.git(["rev-parse", "refs/heads/" + a.branchName]), ref); assert.equal(f.state.puts, 1); assert.equal(f.usageCalls(), calls);
  const ackAgain = await f.run(ackInput); assert.equal(ackAgain.exitCode, 0); assert.equal(ackAgain.state, ack.state);
  const cleanupInput = f.effect(ackAgain, head, "cleanup"), done = await f.run(cleanupInput);
  assert.equal(done.phase, "complete", JSON.stringify(done)); assert.equal(done.exitCode, 0);
  assert.equal(f.git(["for-each-ref", "--format=%(refname)", "refs/heads/" + a.branchName]), "");
  assert.equal(f.git(["rev-parse", "refs/heads/" + b.branchName]), f.base);
  assert.equal(fs.readFileSync(path.join(b.path, "README.md"), "utf8"), "fixture\n");
  assert.equal((await f.run(cleanupInput)).exitCode, 0); assert.equal(f.state.puts, 1); assert.equal(f.usageCalls(), calls);
  fs.mkdirSync(a.path); fs.writeFileSync(path.join(a.path, "new-user-file"), "preserve");
  assert.equal((await f.run(cleanupInput)).exitCode, 2);
  assert.equal(fs.readFileSync(path.join(a.path, "new-user-file"), "utf8"), "preserve");
  assert.equal(f.git(["rev-parse", "main"]), f.base); assert.equal(f.git(["rev-parse", "dev"]), f.base);
});

test("fresh create requires explicit activation; stale owner and input cannot merge", async t => {
  const f = fixture(t);
  const inactive = await f.run({ operation: "create", owner: "fixture", branch: "harness/a", path: path.join(f.directory, "a") });
  assert.deepEqual(inactive.reasons, ["activation-required"]); f.absent(path.join(f.directory, "a"));
  await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  for (const change of [{ owner: "other" }, { expectedState: f.base }, { expectedInstance: "00000000-0000-4000-8000-000000000001" }, { usageEnded: false }]) {
    const result = await f.run({ ...f.effect(a, head), ...change }); assert.notEqual(result.exitCode, 0); assert.equal(f.state.puts, 0);
    assert.equal(fs.existsSync(a.path), true); assert.equal(f.git(["rev-parse", "refs/heads/" + a.branchName]), head);
  }
});

test("dirty, private ignored data, hidden index flags and external links preserve source before merge", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const cases = [
    [() => fs.writeFileSync(path.join(a.path, "README.md"), "dirty"), () => fs.writeFileSync(path.join(a.path, "README.md"), "fixture\n")],
    [() => fs.writeFileSync(path.join(a.path, ".env"), "private"), () => fs.unlinkSync(path.join(a.path, ".env"))],
    [() => f.git(["update-index", "--assume-unchanged", "README.md"], a.path), () => f.git(["update-index", "--no-assume-unchanged", "README.md"], a.path)],
  ];
  for (const [setup, undo] of cases) {
    setup(); const result = await f.run(f.effect(a, head)); assert.equal(result.exitCode, 2, JSON.stringify(result));
    assert.equal(f.state.puts, 0); assert.equal(result.phase, "working"); undo();
  }
  fs.mkdirSync(path.join(a.path, "node_modules"));
  const external = path.join(f.directory, "external"); fs.mkdirSync(external); fs.writeFileSync(path.join(external, "sentinel"), "untouched");
  fs.symlinkSync(external, path.join(a.path, "node_modules", "foreign"), process.platform === "win32" ? "junction" : "dir");
  const result = await f.run(f.effect(a, head)); assert.equal(result.exitCode, 2); assert.equal(f.state.puts, 0);
  assert.equal(fs.readFileSync(path.join(external, "sentinel"), "utf8"), "untouched");
});

test("retire requires a preserved head and closed or absent PR, while no deletion follows unsupported usage", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create();
  const retired = await f.run(f.effect(a, f.base, "retire")); assert.equal(retired.phase, "cleanup-pending"); assert.equal(retired.merge, null);
  assert.equal(fs.existsSync(a.path), true);
  const b = await f.create("unique"), head = f.commit(b);
  remoteBranch(f, b);
  assert.deepEqual((await f.run(f.effect(b, head, "retire"))).reasons, ["head-not-preserved"]);
  f.pr(b, head); f.state.pr.state = "closed"; f.git(["update-ref", "refs/heads/dev", head], f.origin);
  const closed = await f.run(f.effect(b, head, "retire", { pr: 1 }));
  assert.equal(closed.phase, "cleanup-pending"); assert.equal(f.state.puts, 0);
});

test("retire removes an unmerged task whose head is on its remote branch, with or without a closed PR, and writes nothing to GitHub", async t => {
  const f = fixture(t); await f.bootstrap(); f.ports.inspectUsage = clear;
  const abandoned = await f.create("abandoned"), closed = await f.create("closed");
  const abandonedHead = f.commit(abandoned), closedHead = f.commit(closed, "other\n"), before = remoteRefs(f);
  const withoutPr = await f.run(f.effect(abandoned, abandonedHead, "retire"));
  assert.equal(withoutPr.phase, "retired", JSON.stringify(withoutPr)); assert.equal(withoutPr.exitCode, 0); assert.equal(withoutPr.merge, null);
  f.absent(abandoned.path); assert.equal(localBranch(f, abandoned), "");
  f.pr(closed, closedHead); f.state.pr.state = "closed";
  const withClosedPr = await f.run(f.effect(closed, closedHead, "retire", { pr: 1 }));
  assert.equal(withClosedPr.phase, "retired", JSON.stringify(withClosedPr)); assert.equal(withClosedPr.pr.number, 1);
  f.absent(closed.path); assert.equal(localBranch(f, closed), "");
  assert.equal(f.state.puts, 0); assert.equal(remoteRefs(f), before);
  assert.equal(f.git(["rev-parse", "refs/heads/dev"], f.origin), f.base);
});

test("retire keeps an unmerged task whose remote branch is missing or moved, or that still has an open PR", async t => {
  const f = fixture(t); await f.bootstrap(); f.ports.inspectUsage = clear;
  const task = await f.create(), head = f.commit(task);
  const kept = async (reason, extra) => {
    const result = await f.run(f.effect(task, head, "retire", extra));
    assert.deepEqual(result.reasons, [reason], JSON.stringify(result)); assert.equal(result.phase, "working"); assert.equal(result.purpose, null);
    assert.equal(fs.existsSync(task.path), true); assert.equal(localBranch(f, task), head);
  };
  remoteBranch(f, task, f.base); await kept("remote-branch-reused");
  remoteBranch(f, task); await kept("head-not-preserved");
  remoteBranch(f, task, head);
  f.state.dependency = true; await kept("open-dependent-pr"); f.state.dependency = false;
  f.pr(task, head); await kept("retire-pr-not-closed", { pr: 1 });
  assert.equal(f.state.puts, 0);
});

test("a remote branch deleted after the worktree is gone keeps the local branch until the head is on the remote again", async t => {
  const f = fixture(t); await f.bootstrap();
  const task = await f.create(), head = f.commit(task);
  const pending = await f.run(f.effect(task, head, "retire"));
  assert.equal(pending.phase, "cleanup-pending", JSON.stringify(pending)); assert.equal(pending.purpose, "retire");
  f.git(["worktree", "remove", "--", task.path]);
  const ack = await f.run(f.effect(pending, head, "acknowledge-removal", { externalRemovalConfirmed: true }));
  assert.equal(ack.exitCode, 0, JSON.stringify(ack));
  remoteBranch(f, task);
  const unpreserved = await f.run(f.effect(ack, head, "cleanup"));
  assert.deepEqual(unpreserved.reasons, ["head-not-preserved"]); assert.equal(unpreserved.phase, "cleanup-pending");
  assert.equal(localBranch(f, task), head);
  remoteBranch(f, task, head);
  const done = await f.run(f.effect(unpreserved, head, "cleanup"));
  assert.equal(done.phase, "retired", JSON.stringify(done)); assert.equal(localBranch(f, task), "");
  assert.equal(f.git(["rev-parse", "refs/heads/" + task.branchName], f.origin), head);
});
