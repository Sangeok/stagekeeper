import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fixture } from "./testing/closeout-fixture.mjs";
import { context, inspectFiles, json } from "./git-workspace.mjs";
import { loadTask } from "./task-state.mjs";
import { inventory } from "./filesystem-inventory.mjs";

test("Git locks, sparse checkout, nested repositories and submodules block even ancestor retirement", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), ctx = await context(f.root), stored = await loadTask(ctx, a.task);
  const cases = [
    [() => fs.writeFileSync(path.join(stored.record.admin, "index.lock"), ""), () => fs.unlinkSync(path.join(stored.record.admin, "index.lock"))],
    [() => f.git(["worktree", "lock", a.path]), () => f.git(["worktree", "unlock", a.path])],
    [() => f.git(["config", "core.sparseCheckout", "true"]), () => f.git(["config", "core.sparseCheckout", "false"])],
    [() => { fs.mkdirSync(path.join(a.path, "node_modules", "nested", ".git"), { recursive: true }); }, () => fs.rmSync(path.join(a.path, "node_modules"), { recursive: true })],
    [() => fs.writeFileSync(path.join(a.path, ".gitmodules"), ""), () => fs.unlinkSync(path.join(a.path, ".gitmodules"))],
  ];
  for (const [setup, restore] of cases) {
    setup();
    const result = await f.run(f.effect(a, f.base, "retire")); assert.equal(result.exitCode, 2, json(result));
    assert.equal(result.phase, "working"); assert.equal(fs.existsSync(a.path), true); assert.equal(f.git(["rev-parse", a.branchName]), f.base);
    restore();
  }
});

test("directory link policy rejects foreign target, cache root, broken target and nested target escape", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), ctx = await context(f.root), stored = await loadTask(ctx, a.task);
  const outside = path.join(f.directory, "outside"); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, "sentinel"), "untouched");
  const type = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(outside, path.join(a.path, "node_modules"), type);
  await assert.rejects(() => inspectFiles(ctx, stored.record)); fs.unlinkSync(path.join(a.path, "node_modules"));
  fs.mkdirSync(path.join(a.path, "node_modules", "pg"), { recursive: true });
  fs.mkdirSync(path.join(a.path, ".next", "node_modules"), { recursive: true });
  const link = path.join(a.path, ".next", "node_modules", "pg-build");
  fs.symlinkSync(outside, link, type); await assert.rejects(() => inspectFiles(ctx, stored.record)); fs.unlinkSync(link);
  fs.symlinkSync(path.join(a.path, "node_modules", "pg"), link, type);
  fs.symlinkSync(outside, path.join(a.path, "node_modules", "pg", "escape"), type);
  await assert.rejects(() => inspectFiles(ctx, stored.record)); fs.unlinkSync(path.join(a.path, "node_modules", "pg", "escape"));
  fs.rmSync(path.join(a.path, "node_modules", "pg"), { recursive: true });
  await assert.rejects(() => inspectFiles(ctx, stored.record));
  assert.equal(fs.readFileSync(path.join(outside, "sentinel"), "utf8"), "untouched");
  assert.equal(fs.existsSync(a.path), true);
});

test("foreign-device metadata is rejected before reading that subtree", t => {
  const f = fixture(t), target = path.join(f.directory, "metadata"); fs.mkdirSync(target); fs.mkdirSync(path.join(target, "mounted"));
  fs.writeFileSync(path.join(target, "mounted", "private"), "keep");
  const stat = fs.lstatSync, read = fs.readdirSync; let reads = 0;
  fs.lstatSync = (file, options) => {
    const value = stat(file, options);
    return file === path.join(target, "mounted") ? new Proxy(value, { get: (s, key) => key === "dev" ? s.dev + 1n : Reflect.get(s, key) }) : value;
  };
  fs.readdirSync = (file, options) => { if (file === path.join(target, "mounted")) reads++; return read(file, options); };
  try { assert.throws(() => inventory(target), /foreign-filesystem/); }
  finally { fs.lstatSync = stat; fs.readdirSync = read; }
  assert.equal(reads, 0); assert.equal(fs.readFileSync(path.join(target, "mounted", "private"), "utf8"), "keep");
});

test("same request ID with changed input cannot reuse release consent", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const input = f.effect(a, head), pending = await f.run(input);
  const result = await f.run({ ...input, expectedState: pending.state });
  assert.deepEqual(result.reasons, ["request-conflict"]); assert.equal(f.state.puts, 1); assert.equal(fs.existsSync(a.path), true);
  const noReport = await f.run(f.effect(pending, head, "acknowledge-removal"));
  assert.deepEqual(noReport.reasons, ["handoff-required"]);
});

test("dependent PR and a reused remote ref preserve a branch after explicit manual removal", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const pending = await f.run(f.effect(a, head));
  f.git(["worktree", "remove", "--", a.path]);
  const ack = await f.run(f.effect(pending, head, "acknowledge-removal", { externalRemovalConfirmed: true }));
  f.state.dependency = true;
  const dependent = await f.run(f.effect(ack, head, "cleanup")); assert.deepEqual(dependent.reasons, ["open-dependent-pr"]);
  f.state.dependency = false; f.git(["update-ref", "refs/heads/" + a.branchName, f.base], f.origin);
  const reused = await f.run(f.effect(dependent, head, "cleanup")); assert.deepEqual(reused.reasons, ["remote-branch-reused"]);
  assert.equal(f.git(["rev-parse", a.branchName]), head); assert.equal(f.state.puts, 1);
});

test("symbolic task refs and branch refs never authorize deletion of protected branches", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create();
  const taskRef = "refs/stagekeeper/pr-closeout/tasks/" + randomUUID();
  f.git(["symbolic-ref", taskRef, "refs/heads/main"]);
  const invalid = await f.run({ operation: "status", task: taskRef.split("/").at(-1) });
  assert.deepEqual(invalid.reasons, ["state-ref-unverified"]);
  f.git(["symbolic-ref", "refs/heads/" + a.branchName, "refs/heads/dev"]);
  const result = await f.run(f.effect(a, f.base, "retire")); assert.notEqual(result.exitCode, 0);
  assert.equal(f.git(["rev-parse", "main"]), f.base); assert.equal(f.git(["rev-parse", "dev"]), f.base);
});
