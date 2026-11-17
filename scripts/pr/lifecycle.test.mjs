import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "./testing/closeout-fixture.mjs";

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

test("retire requires dev ancestry and closed or absent PR, while no deletion follows unsupported usage", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create();
  const retired = await f.run(f.effect(a, f.base, "retire")); assert.equal(retired.phase, "cleanup-pending"); assert.equal(retired.merge, null);
  assert.equal(fs.existsSync(a.path), true);
  const b = await f.create("unique"), head = f.commit(b);
  assert.deepEqual((await f.run(f.effect(b, head, "retire"))).reasons, ["head-not-in-dev"]);
  f.pr(b, head); f.state.pr.state = "closed"; f.git(["update-ref", "refs/heads/dev", head], f.origin);
  const closed = await f.run(f.effect(b, head, "retire", { pr: 1 }));
  assert.equal(closed.phase, "cleanup-pending"); assert.equal(f.state.puts, 0);
});
