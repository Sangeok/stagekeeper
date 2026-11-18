import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fixture } from "./testing/closeout-fixture.mjs";
import { context, inspectFiles, json } from "./git-workspace.mjs";
import { loadTask } from "./task-state.mjs";
import { inventory } from "./filesystem-inventory.mjs";
import { matchesMacCloseoutHostV1 } from "./macos-closeout-profile.mjs";

const qualifiedBuildLinkHost = f => matchesMacCloseoutHostV1() && f.git(["--version"]) === "git version 2.50.1 (Apple Git-155)";

test("a build link hands off only with the observed name, its own package target and an entirely untracked package", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create();
  const ctx = await context(f.root), stored = await loadTask(ctx, a.task);
  const modules = path.join(a.path, "node_modules"), pkg = path.join(modules, "pg"), prisma = path.join(modules, "@prisma", "client");
  const build = path.join(a.path, ".next", "node_modules");
  fs.mkdirSync(pkg, { recursive: true }); fs.mkdirSync(path.join(modules, "other")); fs.mkdirSync(prisma, { recursive: true });
  fs.mkdirSync(path.join(build, "@prisma"), { recursive: true });
  const windows = process.platform === "win32", type = windows ? "junction" : "dir";
  const link = (name, target) => {
    const file = path.join(build, name);
    fs.symlinkSync(windows ? path.resolve(path.dirname(file), target) : target, file, type); return file;
  };
  const name = "pg-587764f78a6c7a9c", raw = path.relative(build, pkg);
  const built = [link(name, raw), link("@prisma/client-2c3a283f134fdcb6", path.relative(path.join(build, "@prisma"), prisma))];
  const handoff = await inspectFiles(ctx, stored.record, { purpose: "handoff" });
  if (qualifiedBuildLinkHost(f)) {
    assert.equal((await inspectFiles(ctx, stored.record, { purpose: "removal" })).fingerprint, handoff.fingerprint);
    assert.deepEqual(handoff.removalReasons, []);
  } else {
    await assert.rejects(() => inspectFiles(ctx, stored.record, { purpose: "removal" }), { code: "linked-path" });
    assert.deepEqual(handoff.removalReasons, ["linked-path"]);
  }
  for (const file of built) fs.unlinkSync(file);
  const examples = [
    [name, path.relative(build, path.join(modules, "other"))],
    [name, path.relative(build, prisma)],
    ["pg-123", raw], ["pg-587764f78a6c7a9c.bak", raw],
    ["unknown-587764f78a6c7a9c", raw],
    ...windows ? [] : [[name, pkg], [name, path.join("..", "..", "node_modules", "other") + path.sep + ".." + path.sep + "pg"]],
  ];
  for (const [basename, target] of examples) {
    const file = link(basename, target);
    try {
      for (const purpose of ["handoff", "removal"]) await assert.rejects(() => inspectFiles(ctx, stored.record, { purpose }), { code: "linked-path" });
    } finally { fs.unlinkSync(file); }
  }
  const tracked = path.join(pkg, "user-file"); fs.writeFileSync(tracked, "keep");
  f.git(["add", "-f", "node_modules/pg/user-file"], a.path); f.git(["commit", "-m", "track package file"], a.path);
  link(name, raw);
  for (const purpose of ["handoff", "removal"]) await assert.rejects(() => inspectFiles(ctx, stored.record, { purpose }), { code: "linked-path" });
  assert.equal(fs.readFileSync(tracked, "utf8"), "keep");
});

test("a Windows runtime without device numbers runs only status and inspect and leaves no guard behind", { skip: process.platform !== "win32" && "device 0 is refused only on Windows" }, async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const late = path.join(f.directory, "late"), stat = fs.lstatSync, results = {};
  fs.lstatSync = (file, options) => {
    const value = stat(file, options);
    return value.isDirectory() ? new Proxy(value, { get: (s, key) => key === "dev" ? (typeof s.dev === "bigint" ? 0n : 0) : Reflect.get(s, key) }) : value;
  };
  try {
    results.status = await f.run({ operation: "status" });
    results.inspect = await f.run({ operation: "inspect", task: a.task });
    results.complete = await f.run(f.effect(a, head));
    results.create = await f.run({ operation: "create", owner: "fixture", branch: "harness/late", path: late });
    results.preview = await f.run({ operation: "migrate", action: "preview" });
  } finally { fs.lstatSync = stat; }
  assert.equal(results.status.exitCode, 0, json(results.status));
  assert.equal(results.inspect.exitCode, 0); assert.deepEqual(results.inspect.local.reasons, ["device-identity-unavailable"]);
  for (const key of ["complete", "create", "preview"]) assert.deepEqual(results[key].reasons, ["device-identity-unavailable"], key);
  assert.equal(results.complete.phase, "working"); assert.equal(f.state.puts, 0); f.absent(late);
  assert.equal(f.git(["for-each-ref", "--format=%(refname)", "refs/heads/harness/late"]), "");
  assert.equal((await f.run({ operation: "status" })).tasks.length, 1);
  assert.deepEqual(fs.readdirSync(path.join(f.common, "stagekeeper-pr-closeout", "guards")), []);
  const resumed = await f.run(f.effect(a, head));
  assert.equal(resumed.phase, "cleanup-pending", json(resumed)); assert.equal(f.state.puts, 1);
});

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
  const handoff = () => inspectFiles(ctx, stored.record, { purpose: "handoff" });
  fs.symlinkSync(outside, path.join(a.path, "node_modules"), type);
  await assert.rejects(handoff, { code: "linked-path" }); fs.unlinkSync(path.join(a.path, "node_modules"));
  fs.mkdirSync(path.join(a.path, "node_modules", "pg"), { recursive: true });
  fs.mkdirSync(path.join(a.path, ".next", "node_modules"), { recursive: true });
  const link = path.join(a.path, ".next", "node_modules", "pg-587764f78a6c7a9c");
  fs.symlinkSync(outside, link, type); await assert.rejects(handoff, { code: "linked-path" }); fs.unlinkSync(link);
  fs.symlinkSync(path.join(a.path, "node_modules", "pg"), link, type);
  fs.symlinkSync(outside, path.join(a.path, "node_modules", "pg", "escape"), type);
  await assert.rejects(handoff, { code: "linked-path" }); fs.unlinkSync(path.join(a.path, "node_modules", "pg", "escape"));
  fs.rmSync(path.join(a.path, "node_modules", "pg"), { recursive: true });
  await assert.rejects(handoff);
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

test("the inventory refuses a Windows root without a device number", { skip: process.platform !== "win32" && "device 0 is refused only on Windows" }, t => {
  const f = fixture(t), target = path.join(f.directory, "metadata"); fs.mkdirSync(target);
  const stat = fs.lstatSync;
  fs.lstatSync = (file, options) => {
    const value = stat(file, options);
    return file === target ? new Proxy(value, { get: (s, key) => key === "dev" ? 0n : Reflect.get(s, key) }) : value;
  };
  try { assert.throws(() => inventory(target), /device-identity-unavailable/); }
  finally { fs.lstatSync = stat; }
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
