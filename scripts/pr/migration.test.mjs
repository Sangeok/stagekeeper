import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { fixture } from "./testing/closeout-fixture.mjs";
import { context, digest, json, MARKER } from "./git-workspace.mjs";
import { MIGRATION_REF, loadTask, refOid, readStateObject, stateObject, transaction, withGuard } from "./task-state.mjs";
import { pinStates } from "./legacy-migration.mjs";

test("ownerless fence created before interrupted owner publication remains unverified", async t => {
  const f = fixture(t), input = await plan(f), link = fs.linkSync;
  const fence = path.join(f.common, "stagekeeper-task-worktrees", "command.guard");
  fs.linkSync = (from, to) => { if (to === path.join(fence, "owner.json")) throw Object.assign(new Error("fixture"), { code: "EIO" }); return link(from, to); };
  try { assert.notEqual((await f.run(input)).exitCode, 0); } finally { fs.linkSync = link; }
  const ctx = await context(f.root), oid = await refOid(ctx, MIGRATION_REF);
  assert.equal((await readStateObject(ctx, oid)).record.phase, "preparing");
  assert.deepEqual(fs.readdirSync(fence), []);
  for (const action of ["abort", "recover"]) {
    const result = await f.run({ ...input, action, expectedMigrationState: oid });
    assert.notEqual(result.exitCode, 0); assert.equal(fs.existsSync(fence), true); assert.deepEqual(fs.readdirSync(fence), []);
    assert.equal(await refOid(ctx, MIGRATION_REF), oid);
  }
});

test("abort resumes from its own durable empty-fence receipt after owner unlink", async t => {
  const f = fixture(t), old = legacy(f), a = old.create("a"), input = await plan(f), link = fs.linkSync;
  fs.linkSync = (from, to) => { if (to === path.join(a.gitDir, MARKER)) throw Object.assign(new Error("fixture"), { code: "EIO" }); return link(from, to); };
  try { assert.notEqual((await f.run(input)).exitCode, 0); } finally { fs.linkSync = link; }
  const ctx = await context(f.root), prepared = await refOid(ctx, MIGRATION_REF), rmdir = fs.rmdirSync;
  const fence = path.join(f.common, "stagekeeper-task-worktrees", "command.guard");
  fs.rmdirSync = (target, options) => { if (target === fence) throw Object.assign(new Error("fixture"), { code: "EIO" }); return rmdir(target, options); };
  try { assert.notEqual((await f.run({ ...input, action: "abort", expectedMigrationState: prepared })).exitCode, 0); } finally { fs.rmdirSync = rmdir; }
  const oid = await refOid(ctx, MIGRATION_REF);
  assert.equal((await readStateObject(ctx, oid)).record.phase, "aborting"); assert.deepEqual(fs.readdirSync(fence), []);
  const result = await f.run({ ...input, action: "abort", expectedMigrationState: oid });
  assert.equal(result.phase, "aborted", JSON.stringify(result)); assert.equal(fs.existsSync(fence), false); assert.equal(fs.existsSync(a.path), true);
  const fresh = await plan(f);
  const retry = await f.run({ ...fresh, expectedMigrationState: result.state });
  assert.equal(retry.phase, "applied", JSON.stringify(retry));
});


const repository = fileURLToPath(new URL("../../", import.meta.url));
function legacy(f) {
  const source = path.join(f.directory, "legacy"); fs.mkdirSync(source);
  for (const name of ["manage-task-worktrees.mjs", "cleanup-task-branches.mjs"]) {
    fs.writeFileSync(path.join(source, name), execFileSync("git", ["-C", repository, "show", "6bb915a2cd223364b06a9daf0d4dd9a9ea530e8a:scripts/" + name]));
  }
  const run = args => {
    const result = spawnSync(process.execPath, [path.join(source, "manage-task-worktrees.mjs"), ...args, "--root", f.root], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.error, undefined);
    return { status: result.status, report: JSON.parse(result.stdout) };
  };
  const create = name => {
    const result = run(["create", "--owner", "fixture", "--branch", "harness/" + name, "--path", path.join(f.directory, name)]);
    assert.equal(result.status, 0, JSON.stringify(result));
    const files = fs.readdirSync(path.join(f.common, "stagekeeper-task-worktrees", "tasks"));
    return files.map(name => JSON.parse(fs.readFileSync(path.join(f.common, "stagekeeper-task-worktrees", "tasks", name)))).find(r => r.branch === "harness/" + name);
  };
  return { run, create };
}
async function plan(f) {
  const preview = await f.run({ operation: "migrate", action: "preview" }); assert.equal(preview.exitCode, 0, JSON.stringify(preview));
  const value = preview.plan;
  const file = path.join(f.directory, "migration.json"); fs.writeFileSync(file, json(value));
  return { operation: "migrate", action: "apply", plan: file, expectedPlanDigest: digest(json(value)), expectedMigrationState: "absent", writersQuiescent: true, ownersConfirmed: true };
}
test("migration preserves dirty active and closing tasks, fences the pinned v1 writer, and never resets advanced state", async t => {
  const f = fixture(t), old = legacy(f), a = old.create("a"), b = old.create("b");
  fs.writeFileSync(path.join(a.path, ".env"), "private");
  const oldFile = path.join(f.common, "stagekeeper-task-worktrees", "tasks", b.taskId + ".json");
  Object.assign(b, { state: "closing", revision: 2, closing: { headSha: f.base, requestedAt: new Date().toISOString(), sourceRevision: 1,
    fileFingerprint: "a".repeat(64), usageEnded: true, preservation: { kind: "ancestor", headSha: f.base, devSha: f.base, checkedAt: new Date().toISOString() } },
    branchCleanup: { state: "not-started", headSha: f.base, result: null } });
  fs.writeFileSync(oldFile, json(b)); const historical = fs.readFileSync(oldFile);
  const input = await plan(f);
  const noHandoff = await f.run({ ...input, writersQuiescent: undefined });
  assert.notEqual(noHandoff.exitCode, 0);
  const applied = await f.run(input); assert.equal(applied.exitCode, 0, JSON.stringify(applied));
  const ctx = await context(f.root), imported = await loadTask(ctx, b.taskId);
  assert.equal(imported.record.phase, "working"); assert.equal(imported.record.release, null);
  assert.deepEqual(fs.readFileSync(oldFile), historical); assert.equal(fs.readFileSync(path.join(a.path, ".env"), "utf8"), "private");
  for (const args of [
    ["create", "--owner", "fixture", "--branch", "harness/blocked", "--path", path.join(f.directory, "blocked")],
    ["finish", "--task", b.taskId, "--owner", b.owner, "--expected-revision", "2", "--expected-head", f.base, "--usage-ended"],
    ["recover-guard", "--expected-nonce", JSON.parse(fs.readFileSync(path.join(f.common, "stagekeeper-task-worktrees", "command.guard", "owner.json"))).nonce, "--confirmed-quiescent"],
  ]) assert.notEqual(old.run(args).status, 0);
  assert.equal(fs.existsSync(b.path), true);
  const task = { task: b.taskId, owner: b.owner, state: imported.oid, instance: b.instanceId };
  const pending = await f.run(f.effect(task, f.base, "retire"));
  assert.equal(pending.phase, "cleanup-pending", JSON.stringify(pending));
  const replay = await f.run(input); assert.equal(replay.reason, "already-active");
  assert.equal((await loadTask(ctx, b.taskId)).oid, pending.state); assert.notEqual(pending.state, imported.oid);
});

test("prepared migration is recoverable after marker publication fails, but published markers make abort forward-only", async t => {
  const f = fixture(t), old = legacy(f), a = old.create("a"), b = old.create("b"), input = await plan(f);
  const [first, second] = [a, b].sort((left, right) => left.taskId.localeCompare(right.taskId));
  const link = fs.linkSync;
  fs.linkSync = (from, to) => { if (to === path.join(second.gitDir, MARKER)) throw Object.assign(new Error("fixture failure"), { code: "EIO" }); return link(from, to); };
  let failed;
  try { failed = await f.run(input); } finally { fs.linkSync = link; }
  assert.notEqual(failed.exitCode, 0);
  const ctx = await context(f.root), oid = await refOid(ctx, MIGRATION_REF), before = await readStateObject(ctx, oid);
  assert.equal(before.record.phase, "prepared"); assert.equal(fs.existsSync(path.join(first.gitDir, MARKER)), true);
  assert.equal(await refOid(ctx, "refs/stagekeeper/pr-closeout/tasks/" + a.taskId), null);
  const abort = await f.run({ ...input, action: "abort", expectedMigrationState: oid });
  assert.deepEqual(abort.reasons, ["migration-forward-only"]);
  const recovered = await f.run({ ...input, action: "recover", expectedMigrationState: oid });
  assert.equal(recovered.exitCode, 0, JSON.stringify(recovered)); assert.equal(recovered.phase, "applied");
  assert.equal((await loadTask(ctx, a.taskId)).record.release, null); assert.equal((await loadTask(ctx, b.taskId)).record.release, null);
});

test("pre-marker abort removes only its verified fence", async t => {
  const f = fixture(t), old = legacy(f), a = old.create("a"), input = await plan(f);
  const link = fs.linkSync;
  fs.linkSync = (from, to) => { if (to === path.join(a.gitDir, MARKER)) throw Object.assign(new Error("fixture"), { code: "EIO" }); return link(from, to); };
  try { assert.notEqual((await f.run(input)).exitCode, 0); } finally { fs.linkSync = link; }
  const ctx = await context(f.root), oid = await refOid(ctx, MIGRATION_REF);
  const aborted = await f.run({ ...input, action: "abort", expectedMigrationState: oid });
  assert.equal(aborted.phase, "aborted", JSON.stringify(aborted));
  assert.equal(fs.existsSync(path.join(f.common, "stagekeeper-task-worktrees", "command.guard")), false);
  assert.equal(fs.existsSync(a.path), true); assert.equal(fs.existsSync(path.join(a.gitDir, MARKER)), false);
});

test("source drift and corrupt legacy records prevent activation without changing user data", async t => {
  const f = fixture(t), old = legacy(f), a = old.create("a"), input = await plan(f);
  const file = path.join(f.common, "stagekeeper-task-worktrees", "tasks", a.taskId + ".json");
  fs.writeFileSync(file, json({ ...a, owner: "new-owner" }));
  const drifted = await f.run(input); assert.deepEqual(drifted.reasons, ["migration-source-changed"]);
  assert.equal(fs.existsSync(path.join(f.common, "stagekeeper-pr-closeout", "activation.json")), false);
  fs.writeFileSync(file, json({ ...a, schemaVersion: 99 }));
  const before = fs.readFileSync(file), preview = await f.run({ operation: "migrate", action: "preview" });
  assert.deepEqual(preview.reasons, ["legacy-corrupt"]); assert.deepEqual(fs.readFileSync(file), before); assert.equal(fs.existsSync(a.path), true);
});

test("bounded pin tree retains more than 32 state commits through Git GC", async t => {
  const f = fixture(t), ctx = await context(f.root), commits = [];
  for (let i = 0; i < 40; i++) commits.push(await stateObject(ctx, { fixture: i }, [f.base]));
  const pin = await pinStates(ctx, commits);
  await withGuard(ctx, "common", undefined, async () => transaction(ctx, [{ ref: MIGRATION_REF, old: null, next: pin }]));
  f.git(["gc", "--prune=now"]);
  for (let i = 0; i < commits.length; i++) assert.equal((await readStateObject(ctx, commits[i])).record.fixture, i);
});
