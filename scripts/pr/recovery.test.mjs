import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";

test("a killed invocation retains durable merge intent and only explicit dead-guard recovery permits observation", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const input = { ...f.effect(a, head), root: f.root, branch: a.branchName }, file = path.join(f.directory, "worker.json");
  fs.writeFileSync(file, json(input));
  const worker = fileURLToPath(new URL("./testing/merge-interrupt.mjs", import.meta.url));
  const child = f.ownChild(spawn(process.execPath, [worker, file], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }));
  const closed = new Promise(resolve => child.once("close", resolve));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("intent handshake timeout")), 30000);
    child.stdout.once("data", data => { clearTimeout(timer); data.toString() === "intent-ready\n" ? resolve() : reject(new Error(data.toString())); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("worker exited before intent")); });
  });
  const ctx = await context(f.root), stored = await loadTask(ctx, a.task);
  assert.equal(stored.record.phase, "merge-requested"); assert.equal(stored.record.requests[input.requestId].outcome, "intent");
  const busy = await f.run({ operation: "recover", task: a.task, owner: a.owner, expectedState: stored.oid });
  assert.deepEqual(busy.reasons, ["guard-held"]);
  child.kill("SIGKILL"); await closed;
  const owner = JSON.parse(fs.readFileSync(path.join(f.common, "stagekeeper-pr-closeout", "guards", "task-" + a.task, "owner.json")));
  const guard = await f.run({ operation: "recover-guard", guard: "task", task: a.task, expectedNonce: owner.nonce, confirmedQuiescent: true });
  assert.equal(guard.exitCode, 0, json(guard));
  const recovered = await f.run({ operation: "recover", task: a.task, owner: a.owner, expectedState: stored.oid });
  assert.equal(recovered.phase, "merge-requested"); assert.equal(f.state.puts, 0);
  assert.equal((await f.run(f.effect(recovered, head))).exitCode, 2); assert.equal(f.state.puts, 0);
  assert.equal(fs.existsSync(a.path), true); assert.equal(f.git(["rev-parse", a.branchName]), head);
});

import { fileURLToPath } from "node:url";
import { fixture } from "./testing/closeout-fixture.mjs";
import { parseArgs } from "./index.mjs";
import { context, json, publishJson, MARKER, runCommand } from "./git-workspace.mjs";

test("owned command output and cancellation are bounded and all owned children settle", async t => {
  const f = fixture(t), controller = new AbortController(), ctx = await context(f.root, controller.signal);
  await assert.rejects(() => runCommand(ctx, process.execPath, ["-e", "process.stdout.write(Buffer.alloc(17*1024*1024))"]), { code: "output-limit" });
  assert.equal(ctx.children.size, 0); assert.equal(ctx.unsettled, false);
  const running = runCommand(ctx, process.execPath, ["-e", "setInterval(()=>{},1000)"]);
  controller.abort();
  await assert.rejects(() => running, { code: "cancelled" }); assert.equal(ctx.children.size, 0); assert.equal(ctx.unsettled, false);
  assert.equal(f.git(["rev-parse", "main"]), f.base); assert.equal(f.git(["rev-parse", "dev"]), f.base);
});

import { loadTask, withGuard, saveTask, newTask, createTaskRecord, requireActivation, stateObject, transaction, taskRef } from "./task-state.mjs";

test("strict CLI rejects protected branches, mixed namespaces, duplicate flags, and executable overrides", async t => {
  const f = fixture(t);
  for (const args of [
    ["create", "--owner", "fixture", "--branch", "main", "--path", path.join(f.directory, "main")],
    ["status", "--usage-ended"], ["status", "--root", f.root, "--root", f.root],
    ["status", "--git", "arbitrary"], ["migrate", "preview", "--task", randomUUID()],
    ["create", "--owner", "fixture", "--branch", "dev", "--path", path.join(f.directory, "dev")],
  ]) assert.throws(() => parseArgs(args));
  assert.equal(f.git(["rev-parse", "main"]), f.base); assert.equal(f.git(["rev-parse", "dev"]), f.base);
  assert.equal(fs.existsSync(path.join(f.common, "stagekeeper-pr-closeout")), false);
});

test("ambient Git context conflicts are rejected before any Git command and values never leak", async t => {
  const f = fixture(t), cli = fileURLToPath(new URL("./index.mjs", import.meta.url));
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_NAMESPACE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT"]) {
    const result = spawnSync(process.execPath, [cli, "status", "--root", f.root], { encoding: "utf8", env: { ...process.env, [key]: "private-value-never-print", PATH: "" } });
    assert.equal(result.status, 2, result.stdout); assert.deepEqual(JSON.parse(result.stdout).reasons, ["git-environment-conflict"]);
    assert.equal((result.stdout + result.stderr).includes("private-value-never-print"), false);
  }
  assert.equal(fs.existsSync(path.join(f.common, "stagekeeper-pr-closeout")), false);
  assert.deepEqual((await f.run({ operation: "status", root: path.join(f.root, ".git") })).reasons, ["command-failed"]);
});

test("status and remote inspect preserve refs, metadata and config, and never invoke PUT", async t => {
  const f = fixture(t);
  const before = f.git(["show-ref"]), config = fs.readFileSync(path.join(f.common, "config"));
  const inactive = await f.run({ operation: "status" }); assert.equal(inactive.active, false);
  assert.equal(fs.existsSync(path.join(f.common, "stagekeeper-pr-closeout")), false);
  await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const refs = f.git(["show-ref"]), ctx = await context(f.root), state = (await loadTask(ctx, a.task)).oid;
  const report = await f.run({ operation: "inspect", task: a.task, pr: 1, remote: true });
  assert.equal(report.exitCode, 0, json(report)); assert.equal(report.remote.pr.state, "OPEN");
  assert.equal(f.git(["show-ref"]), refs); assert.equal((await loadTask(ctx, a.task)).oid, state);
  assert.deepEqual(fs.readFileSync(path.join(f.common, "config")), config); assert.equal(f.state.puts, 0);
  assert.ok(before.includes(f.base));
});

test("missing promisor state objects never lazy-fetch or change refs during status", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), ctx = await context(f.root), stored = await loadTask(ctx, a.task);
  const blob = f.git(["rev-parse", stored.oid + ":state.json"]), file = path.join(f.common, "objects", blob.slice(0, 2), blob.slice(2));
  fs.unlinkSync(file);
  f.git(["config", "extensions.partialClone", "origin"]); f.git(["config", "remote.origin.promisor", "true"]);
  f.git(["config", "remote.origin.partialclonefilter", "blob:none"]);
  const trace = path.join(f.directory, "trace.json"), refs = f.git(["show-ref"]);
  const prior = process.env.GIT_TRACE2_EVENT; process.env.GIT_TRACE2_EVENT = trace;
  try {
    const result = await f.run({ operation: "status", task: a.task }); assert.notEqual(result.exitCode, 0);
  } finally { if (prior === undefined) delete process.env.GIT_TRACE2_EVENT; else process.env.GIT_TRACE2_EVENT = prior; }
  const events = fs.readFileSync(trace, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  assert.equal(events.some(e => e.event === "child_start" && e.argv?.some(a => a === "fetch" || a === "fetch-pack")), false);
  assert.equal(fs.existsSync(file), false); assert.equal(f.git(["show-ref"]), refs);
});

test("creating recovery requires explicit ownership for a markerless instance and never overwrites a foreign marker", async t => {
  const f = fixture(t); await f.bootstrap(); const ctx = await context(f.root), active = await requireActivation(ctx);
  const record = newTask(ctx, active.installationId, { owner: "fixture", branch: "harness/partial", path: path.join(f.directory, "partial"), baseSha: f.base, toolRevision: f.base });
  let stored;
  await withGuard(ctx, "common", undefined, async () => { stored = await createTaskRecord(ctx, record); });
  f.git(["worktree", "add", "-b", record.branch, "--", record.path, f.base]);
  const input = { operation: "create", task: record.taskId, owner: record.owner, expectedState: stored.oid };
  const denied = await f.run(input); assert.deepEqual(denied.reasons, ["creation-confirmation-required"]);
  assert.equal(fs.existsSync(record.path), true);
  const done = await f.run({ ...input, confirmCreatedByTask: true }); assert.equal(done.phase, "working", json(done));
  const admin = (await loadTask(ctx, record.taskId)).record.admin;
  fs.writeFileSync(path.join(admin, MARKER), json({ schemaVersion: 1, installationId: active.installationId, taskId: randomUUID(), instanceId: record.instanceId }));
  const bad = await f.run(f.effect(done, f.base, "retire"));
  assert.equal(bad.exitCode, 2); assert.equal(fs.existsSync(record.path), true); assert.equal(f.git(["rev-parse", record.branch]), f.base);
});

test("guard recovery preserves live, unknown and wrong-nonce owners and archives only an explicitly quiescent dead guard", async t => {
  const f = fixture(t); await f.bootstrap();
  const file = path.join(f.common, "stagekeeper-pr-closeout", "guards", "common"); fs.mkdirSync(file);
  const owner = { schemaVersion: 1, nonce: randomUUID(), host: hostname(), pid: process.pid, kind: "common", taskId: null, createdAt: new Date().toISOString() };
  publishJson(path.join(file, "owner.json"), owner);
  const input = { operation: "recover-guard", guard: "common", expectedNonce: owner.nonce, confirmedQuiescent: true };
  assert.equal((await f.run(input)).exitCode, 2); assert.equal(fs.existsSync(file), true);
  fs.unlinkSync(path.join(file, "owner.json"));
  assert.equal((await f.run(input)).exitCode, 2); assert.equal(fs.existsSync(file), true);
  const child = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" }); assert.equal(child.status, 0);
  publishJson(path.join(file, "owner.json"), { ...owner, pid: child.pid });
  assert.equal((await f.run({ ...input, expectedNonce: randomUUID() })).exitCode, 2);
  const result = await f.run(input); assert.equal(result.exitCode, 0, json(result)); assert.equal(result.guard.state, "retired");
  assert.equal(fs.existsSync(file), false); assert.equal(fs.existsSync(path.join(f.common, "stagekeeper-pr-closeout", "retired-guards", owner.nonce, "owner.json")), true);
});

test("recover records an absent worktree with durable removal intent and performs no branch deletion", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const pending = await f.run(f.effect(a, head)), ctx = await context(f.root), stored = await loadTask(ctx, a.task);
  await withGuard(ctx, "task", a.task, async () => withGuard(ctx, "common", undefined, async () => {
    await saveTask(ctx, stored, { worktree: { state: "intent", requestId: randomUUID() } });
  }));
  f.git(["worktree", "remove", "--", a.path]);
  const recovered = await f.run({ operation: "recover", task: a.task, owner: a.owner, expectedState: stored.oid });
  assert.equal(recovered.worktree.state, "removed", json(recovered));
  assert.equal(f.git(["rev-parse", a.branchName]), head); assert.equal(f.state.puts, 1);
  assert.equal((await f.run(f.effect(recovered, head, "cleanup"))).phase, "complete");
  assert.equal(pending.phase, "cleanup-pending");
});

test("a helper source parent cannot substitute for the first-parent state lineage", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), ctx = await context(f.root), stored = await loadTask(ctx, a.task);
  const next = { ...stored.record, sequence: stored.record.sequence + 1, previousStateOid: stored.oid };
  const forged = await stateObject(ctx, next, [f.base, stored.oid]);
  await withGuard(ctx, "common", undefined, async () => transaction(ctx, [{ ref: taskRef(a.task), old: stored.oid, next: forged }]));
  const result = await f.run({ operation: "status", task: a.task }); assert.deepEqual(result.reasons, ["state-lineage-invalid"]);
  assert.equal(fs.existsSync(a.path), true); assert.equal(f.git(["rev-parse", a.branchName]), f.base);
});
