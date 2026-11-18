import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fixture } from "./testing/closeout-fixture.mjs";
import { context, git, branchHead, inspectFiles } from "./git-workspace.mjs";
import { loadTask, withGuard, saveTask } from "./task-state.mjs";

test("native runtime removes only a qualified clear target and preserves an unverified target", async t => {
  const f = fixture(t, { native: true }); await f.bootstrap();
  const a = await f.create("native-a"), b = await f.create("native-b"), head = f.commit(a); f.pr(a, head);
  fs.mkdirSync(path.join(a.path, "node_modules", "pg"), { recursive: true });
  fs.writeFileSync(path.join(a.path, "node_modules", "pg", "index.js"), "fixture");
  fs.mkdirSync(path.join(a.path, ".next", "node_modules"), { recursive: true });
  const result = await f.run(f.effect(a, head));
  const qualified = process.platform === "darwin" && os.release() === "25.2.0" && process.arch === "arm64" && process.version === "v26.4.0" && process.getuid() > 0 && process.getuid() === process.geteuid();
  if (process.env.STAGEKEEPER_CLOSEOUT_NATIVE_REQUIRED === "1") {
    assert.equal(qualified, true, "required native profile unavailable");
    assert.equal(result.phase, "complete", JSON.stringify(result));
  }
  if (result.phase === "complete") {
    assert.equal(qualified, true);
    assert.equal(result.phase, "complete", JSON.stringify(result)); f.absent(a.path);
    assert.equal(f.git(["for-each-ref", "--format=%(refname)", "refs/heads/" + a.branchName]), "");
  } else {
    assert.equal(result.phase, "cleanup-pending", JSON.stringify(result));
    assert.deepEqual(result.reasons, [result.capability === "unqualified" ? "unqualified-profile" : "usage-unverified"]);
    assert.equal(fs.existsSync(a.path), true); assert.equal(f.git(["rev-parse", a.branchName]), head);
    f.git(["worktree", "remove", "--", a.path]);
    const ack = await f.run(f.effect(result, head, "acknowledge-removal", { externalRemovalConfirmed: true }));
    assert.equal(ack.exitCode, 0, JSON.stringify(ack)); assert.equal(f.git(["rev-parse", a.branchName]), head);
    const done = await f.run(f.effect(ack, head, "cleanup"));
    assert.equal(done.phase, "complete", JSON.stringify(done));
    assert.equal(f.git(["for-each-ref", "--format=%(refname)", "refs/heads/" + a.branchName]), "");
  }
  assert.equal(fs.readFileSync(path.join(b.path, "README.md"), "utf8"), "fixture\n");
  assert.equal(f.git(["rev-parse", b.branchName]), f.base); assert.equal(f.state.puts, 1);
  t.diagnostic(JSON.stringify({ platform: process.platform, release: os.release(), node: process.version, qualified, outcome: result.phase }));
});

test("generated directory links remain blocked while a native Git experiment checks target and canary preservation", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create("link-a"), b = await f.create("link-b");
  const external = path.join(f.directory, "canary"); fs.mkdirSync(external); fs.writeFileSync(path.join(external, "data"), "preserve");
  fs.mkdirSync(path.join(a.path, "node_modules", "pg"), { recursive: true });
  fs.writeFileSync(path.join(a.path, "node_modules", "pg", "index.js"), "owned cache");
  fs.mkdirSync(path.join(a.path, ".next", "node_modules"), { recursive: true });
  const link = path.join(a.path, ".next", "node_modules", "pg-generated");
  fs.symlinkSync(path.join(a.path, "node_modules", "pg"), link, process.platform === "win32" ? "junction" : "dir");
  const ctx = await context(f.root), stored = await loadTask(ctx, a.task);
  await assert.rejects(() => inspectFiles(ctx, stored.record), { code: "linked-path" });
  await git(ctx, ["worktree", "remove", "--", a.path]);
  const targetRemains = fs.existsSync(a.path);
  if (process.platform !== "win32") assert.equal(targetRemains, false);
  assert.equal(fs.readFileSync(path.join(external, "data"), "utf8"), "preserve");
  assert.equal(fs.readFileSync(path.join(b.path, "README.md"), "utf8"), "fixture\n");
  assert.equal(await branchHead(ctx, a.branchName), f.base);
  t.diagnostic(JSON.stringify({ platform: process.platform, gitRemovalExitedZero: true, targetRemains, productionExceptionEnabled: false }));
});

test("present worktree stays intact for busy and unknown usage, including a qualified incomplete observation", async t => {
  const f = fixture(t); await f.bootstrap();
  const a = await f.create(), head = f.commit(a); f.pr(a, head);
  f.ports.inspectUsage = async () => ({ status: "busy", capability: { status: "qualified" }, observationPerformed: true, observation: { coverageComplete: true }, observer: { state: "settled" } });
  const busy = await f.run(f.effect(a, head)); assert.deepEqual(busy.reasons, ["worktree-in-use"]); assert.equal(f.state.puts, 0);
  f.ports.inspectUsage = async () => ({ status: "unknown", capability: { status: "qualified" }, observationPerformed: true, observation: { coverageComplete: false }, observer: { state: "settled" } });
  const unknown = await f.run(f.effect(a, head)); assert.equal(unknown.phase, "cleanup-pending");
  assert.equal(unknown.observationPerformed, true); assert.equal(unknown.purpose, "merged"); assert.equal(unknown.pr.number, 1);
  assert.equal(fs.existsSync(a.path), true); assert.equal(f.git(["rev-parse", a.branchName]), head); assert.equal(f.state.puts, 1);
  f.git(["worktree", "remove", "--", a.path]);
  const ack = await f.run(f.effect(unknown, head, "acknowledge-removal", { externalRemovalConfirmed: true }));
  assert.equal(ack.observationPerformed, false); assert.equal(ack.lastObservation.performed, true);
  const done = await f.run(f.effect(ack, head, "cleanup"));
  assert.equal(done.phase, "complete"); assert.equal(done.observationPerformed, false); assert.equal(done.lastObservation.status, "unknown");
});

test("manual receipt cannot delete a changed tip or a re-created target", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const pending = await f.run(f.effect(a, head));
  f.git(["worktree", "remove", "--", a.path]);
  const ack = await f.run(f.effect(pending, head, "acknowledge-removal", { externalRemovalConfirmed: true }));
  f.git(["update-ref", "refs/heads/" + a.branchName, f.base, head]);
  const changed = await f.run(f.effect(ack, head, "cleanup")); assert.deepEqual(changed.reasons, ["head-changed"]);
  assert.equal(f.git(["rev-parse", a.branchName]), f.base);
  f.git(["update-ref", "refs/heads/" + a.branchName, head, f.base]);
  fs.mkdirSync(a.path); fs.writeFileSync(path.join(a.path, "new"), "owned elsewhere");
  const restored = await f.run(f.effect(changed, head, "cleanup")); assert.equal(restored.exitCode, 2);
  assert.equal(fs.readFileSync(path.join(a.path, "new"), "utf8"), "owned elsewhere");
});

test("atomic branch deletion CAS cannot overwrite a concurrent task update", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), ctx = await context(f.root), old = await loadTask(ctx, a.task);
  const concurrent = structuredClone(old);
  await withGuard(ctx, "task", a.task, async () => withGuard(ctx, "common", undefined, async () => {
    await saveTask(ctx, concurrent, { reasons: ["newer-state"] });
    await assert.rejects(() => saveTask(ctx, old, { reasons: ["stale-state"] }), { code: "state-changed" });
  }));
  assert.equal((await loadTask(ctx, a.task)).oid, concurrent.oid);
  assert.equal(f.git(["rev-parse", a.branchName]), f.base); assert.equal(fs.existsSync(a.path), true);
});
