import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { fixture } from "./testing/closeout-fixture.mjs";
import { parseArgs } from "./index.mjs";
import { context, digest } from "./git-workspace.mjs";
import { guardStatus, loadTask, saveTask, withGuard } from "./task-state.mjs";
import { macReleaseScope } from "./release-scope.mjs";
import { matchesMacCloseoutHostV1 } from "./macos-closeout-profile.mjs";
import { releaseRef } from "./release-refs.mjs";

const localScope = digest("this device and account");
const otherScope = digest("another account");
const clear = () => ({ status: "clear", capability: { status: "qualified" }, observationPerformed: true,
  observation: { coverageComplete: true }, observer: { state: "settled" } });

async function setup(t, { native = false } = {}) {
  const f = fixture(t, { native });
  await f.bootstrap();
  if (!native) {
    f.ports.releaseScope = async () => localScope;
    f.ports.inspectUsage = async () => clear();
  }
  const request = f.ports.github.request;
  const reads = [];
  f.ports.github.request = async (method, route, ...args) => {
    assert.equal(method, "GET");
    reads.push(route);
    const url = new URL("https://fixture.invalid/" + route);
    if (url.searchParams.get("state") === "all") {
      assert.equal(url.searchParams.get("head"), "fixture:" + f.state.pr.head.ref);
      assert.equal(url.searchParams.get("base"), "dev");
      const rows = f.state.pages?.[Number(url.searchParams.get("page")) - 1] ?? [f.state.pr];
      return { status: 200, data: structuredClone(rows) };
    }
    return request(method, route, ...args);
  };
  const start = name => f.run({ operation: "start", owner: "next-owner", branch: "harness/" + name, path: path.join(f.directory, name) });
  const release = (a, head, extra = {}) => f.effect(a, head, "release", { usageEnded: true, ...extra });
  return { ...f, start, release, reads };
}

test("task namespace exposes only start and release, and the legacy entry retains its commands", () => {
  for (const verb of ["complete", "cleanup", "retire", "create", "migrate"]) assert.throws(() => parseArgs([verb], "task"));
  for (const verb of ["start", "release"]) assert.throws(() => parseArgs([verb], "pr"));
  assert.throws(() => parseArgs(["start", "--owner", "agent", "--branch", "dev", "--path", process.cwd()], "task"));
});

test("an empty release queue delegates once to create and does not query GitHub", async t => {
  const f = await setup(t);
  await f.create("existing");
  async function trace(name, create) {
    const file = path.join(f.directory, name + ".trace");
    process.env.GIT_TRACE2_EVENT = file;
    try { await create(); } finally { delete process.env.GIT_TRACE2_EVENT; }
    return fs.readFileSync(file, "utf8").trim().split("\n").map(line => JSON.parse(line))
      .filter(event => event.event === "start").map(event => event.argv);
  }
  const previous = await trace("legacy", () => f.create("legacy"));
  const current = await trace("new", async () => {
    const result = await f.start("new");
    assert.equal(result.exitCode, 0); assert.deepEqual(result.candidates, []);
  });
  for (const command of ["fetch", "ls-remote", "refs/stagekeeper/pr-closeout/tasks/"]) {
    const count = calls => calls.filter(args => args.includes(command)).length;
    assert.ok(count(previous) > 0, command); assert.equal(count(current), count(previous), command);
  }
  assert.deepEqual(f.reads, []);
});

test("offline release, replay, held scope and same-HEAD resume preserve the original consent", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  const input = f.release(a, head);
  const sealed = await f.run(input);
  assert.equal(sealed.phase, "sealed", JSON.stringify(sealed));
  assert.equal(sealed.handoff, "active");
  assert.equal((await f.run(input)).state, sealed.state);
  assert.deepEqual((await f.run({ ...input, pr: 5 })).reasons, ["request-conflict"]);
  f.ports.releaseScope = async () => otherScope;
  assert.equal((await f.run({ operation: "inspect", task: a.task })).handoff, "foreign");
  assert.deepEqual((await f.start("foreign")).candidates, []);
  const resume = await f.run({ operation: "resume", task: a.task, owner: a.owner, expectedState: sealed.state });
  assert.equal(resume.phase, "working", JSON.stringify(resume));
  assert.deepEqual((await f.run(input)).reasons, ["release-superseded"]);
  f.ports.releaseScope = async () => "held";
  const held = await f.run(f.release(resume, head));
  assert.equal(held.handoff, "held");
  f.ports.releaseScope = async () => localScope;
  assert.deepEqual((await f.start("still-held")).candidates, []);
  assert.equal((await f.run({ operation: "inspect", task: a.task })).handoff, "held");
  assert.deepEqual(f.reads, []);
});

test("a later web PR can be open, then squash-merged with its remote branch gone", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  const sealed = await f.run(f.release(a, head));
  assert.equal(sealed.handoff, "active");
  f.pr(a, head);
  const opened = await f.start("while-open");
  assert.equal(opened.exitCode, 0);
  assert.deepEqual(opened.candidates[0].reasons, ["pr-open"]);
  const tree = f.git(["rev-parse", head + "^{tree}"]);
  const landed = f.git(["commit-tree", tree, "-p", f.base, "-m", "squash"]);
  f.git(["push", "origin", landed + ":refs/heads/dev"]);
  f.git(["update-ref", "-d", "refs/heads/" + a.branchName, head], f.origin);
  f.state.pr.state = "closed"; f.state.pr.merged = true; f.state.pr.merge_commit_sha = landed;
  const before = f.git(["show-ref"], f.origin);
  const created = await f.start("after-merge");
  assert.equal(created.exitCode, 0, JSON.stringify(created));
  assert.equal(created.candidates[0].pr, 1);
  assert.equal(created.candidates[0].worktree, "removed");
  assert.equal(created.candidates[0].branch, "removed");
  assert.equal(f.git(["show-ref"], f.origin), before);
  f.absent(a.path);
  assert.equal(f.git(["for-each-ref", "--format=%(refname)", "refs/heads/" + a.branchName]), "");
  assert.equal((await f.run({ operation: "inspect", task: a.task })).handoff, "absent");
  assert.deepEqual((await f.start("again")).candidates, []);
});

test("known PR, historical merge, ambiguous pages and incomplete discovery never authorize a removal", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  f.pr(a, head);
  const wrong = await f.run(f.release(a, head, { pr: 2 }));
  assert.notEqual(wrong.exitCode, 0); assert.equal(wrong.phase, "working");
  await f.run(f.release(a, head));
  f.state.pr.merged = true; f.state.pr.state = "closed"; f.state.pr.merge_commit_sha = f.base;
  const oldRows = Array.from({ length: 100 }, (_, i) => ({ ...f.state.pr, number: i + 100, head: { ...f.state.pr.head, sha: f.base } }));
  f.state.pages = [oldRows, [f.state.pr]];
  assert.deepEqual((await f.start("historical")).candidates[0].reasons, ["task-merge-unverified"]);
  assert.ok(f.reads.some(route => route.includes("page=2")));
  f.state.pages = [[f.state.pr, { ...f.state.pr, number: 2 }]];
  assert.deepEqual((await f.start("ambiguous")).candidates[0].reasons, ["pr-discovery-ambiguous"]);
  f.state.pages = [[{}]];
  assert.deepEqual((await f.start("invalid-page")).candidates[0].reasons, ["pr-discovery-incomplete"]);
  assert.equal(f.git(["rev-parse", a.branchName]), head); assert.ok(fs.existsSync(a.path));
});

test("an older or divergent merge cannot stand in for this task, even for an explicitly bound PR", async t => {
  const f = await setup(t);
  const tree = f.git(["rev-parse", f.base + "^{tree}"]);
  const advanced = f.git(["commit-tree", tree, "-p", f.base, "-m", "later starting point"]);
  const fork = f.git(["commit-tree", tree, "-p", f.base, "-m", "parallel dev history"]);
  f.git(["push", "origin", advanced + ":refs/heads/dev"]);
  const a = await f.create(), head = f.commit(a);
  f.pr(a, head); await f.run(f.release(a, head, { pr: 1 }));
  Object.assign(f.state.pr, { merged: true, state: "closed", merge_commit_sha: f.base });
  assert.deepEqual((await f.start("already-in-base")).candidates[0].reasons, ["task-merge-unverified"]);
  const joined = f.git(["commit-tree", tree, "-p", advanced, "-p", fork, "-m", "join histories"]);
  f.git(["push", "origin", joined + ":refs/heads/dev"]);
  f.state.pr.merge_commit_sha = fork;
  assert.deepEqual((await f.start("unrelated-to-base")).candidates[0].reasons, ["task-merge-unverified"]);
  assert.equal(f.git(["rev-parse", a.branchName]), head); assert.ok(fs.existsSync(a.path));
});

test("an unsettled observer stops the entire start and reports the held candidate", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  f.pr(a, head); await f.run(f.release(a, head, { pr: 1 })); f.mergeRemote();
  f.ports.inspectUsage = async () => ({ ...clear(), status: "unknown", observer: { state: "unsettled" } });
  const failed = await f.start("must-not-start");
  assert.notEqual(failed.exitCode, 0);
  assert.deepEqual(failed.candidates[0].reasons, ["usage-observer-unsettled"]);
  f.absent(path.join(f.directory, "must-not-start"));
  assert.ok(fs.existsSync(a.path)); assert.equal(f.git(["rev-parse", a.branchName]), head);
  const ctx = await context(f.root);
  assert.equal(guardStatus(ctx, "common").state, "absent");
  assert.equal(guardStatus(ctx, "task", a.task).state, "live");
});

test("repeated holds reuse the cleanup request, and a retry never deletes a branch on past removal alone", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  f.pr(a, head);
  const sealed = await f.run(f.release(a, head, { pr: 1 }));
  assert.equal(sealed.handoff, "active");
  f.mergeRemote();
  f.ports.inspectUsage = async () => ({ ...clear(), status: "busy" });
  const first = await f.start("busy");
  assert.deepEqual(first.candidates[0].reasons, ["worktree-in-use"]);
  const ctx = await context(f.root);
  const pending = await loadTask(ctx, a.task);
  assert.equal(Object.keys(pending.record.requests).length, 1);
  assert.equal((await f.start("busy-again")).candidates[0].state, pending.oid);
  assert.ok(!f.reads.some(route => route.includes("state=all")));
  f.ports.inspectUsage = async () => clear();
  const request = f.ports.github.request;
  f.ports.github.request = async (...args) => {
    if (!fs.existsSync(a.path)) return { status: 503, data: null };
    return request(...args);
  };
  const partial = await f.start("partial");
  assert.equal(partial.exitCode, 0);
  assert.equal(partial.candidates[0].worktree, "removed"); assert.equal(partial.candidates[0].branch, "not-started");
  f.ports.github.request = request;
  const retained = await f.start("recovering");
  assert.deepEqual(retained.candidates[0].reasons, ["branch-ownership-unconfirmed"]);
  assert.equal(f.git(["rev-parse", a.branchName]), head);
});

test("a rebased PR on a newer dev commit cleans only after local preservation checks", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  f.pr(a, head); await f.run(f.release(a, head, { pr: 1 }));
  const tree = f.git(["rev-parse", head + "^{tree}"]);
  const baseTree = f.git(["rev-parse", f.base + "^{tree}"]);
  const advanced = f.git(["commit-tree", baseTree, "-p", f.base, "-m", "new dev parent"]);
  const rebased = f.git(["commit-tree", tree, "-p", advanced, "-m", "rebased change"]);
  f.git(["push", "origin", rebased + ":refs/heads/dev"]);
  Object.assign(f.state.pr, { merged: true, state: "closed", merge_commit_sha: rebased });
  fs.writeFileSync(path.join(a.path, ".env"), "retained fixture");
  const result = await f.start("rebased-with-user-data");
  assert.equal(result.exitCode, 0); assert.deepEqual(result.candidates[0].reasons, ["unpreserved-files"]);
  assert.equal(fs.readFileSync(path.join(a.path, ".env"), "utf8"), "retained fixture");
  assert.equal(f.git(["rev-parse", a.branchName]), head);
  fs.unlinkSync(path.join(a.path, ".env"));
  assert.equal((await f.start("rebased-clean")).candidates[0].branch, "removed");
});

test("macOS handoff scopes distinguish the installation, device and account without disclosing inputs", () => {
  const device = randomUUID(), installation = randomUUID();
  const key = macReleaseScope(installation, device, 501, 501);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, macReleaseScope(installation, device.toUpperCase(), 501, 501));
  assert.notEqual(key, macReleaseScope(installation, randomUUID(), 501, 501));
  assert.notEqual(key, macReleaseScope(randomUUID(), device, 501, 501));
  assert.notEqual(key, macReleaseScope(installation, device, 502, 502));
  assert.equal(macReleaseScope(installation, device, 501, 502), "held");
  assert.equal(macReleaseScope(installation, "00000000-0000-0000-0000-000000000000", 501, 501), "held");
});

test("the native scope survives a new process", { skip: !matchesMacCloseoutHostV1() }, () => {
  const scopeModule = new URL("./release-scope.mjs", import.meta.url).href;
  const gitModule = new URL("./git-workspace.mjs", import.meta.url).href;
  const script = `import {releaseScope} from ${JSON.stringify(scopeModule)};
    import {context} from ${JSON.stringify(gitModule)};
    process.stdout.write(await releaseScope(await context(process.cwd()), "fixture"));`;
  const read = () => execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  const scope = read();
  assert.match(scope, /^[a-f0-9]{64}$/);
  assert.equal(read() === scope, true);
});

test("the pinned old reader can resume a released task and its stale link cannot grant cleanup", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  const sealed = await f.run(f.release(a, head)), ctx = await context(f.root);
  const old = path.join(f.directory, "old-reader");
  fs.mkdirSync(old);
  const source = fileURLToPath(new URL("../../", import.meta.url));
  for (const file of ["task-state.mjs", "git-workspace.mjs", "macos-closeout-profile.mjs"]) {
    fs.writeFileSync(path.join(old, file), execFileSync("git", ["show", "84d801654128e2f02e3f607463cbfcdac02b817c:scripts/pr/" + file], { cwd: source }));
  }
  const legacy = await import(pathToFileURL(path.join(old, "task-state.mjs")).href);
  const stored = await legacy.loadTask(ctx, a.task);
  assert.equal(stored.oid, sealed.state);
  await legacy.withGuard(ctx, "task", a.task, () => legacy.withGuard(ctx, "common", undefined, () =>
    legacy.saveTask(ctx, stored, { phase: "working", release: null, pr: null, observation: null, reasons: [] })));
  const skipped = await f.start("legacy-resume");
  assert.deepEqual(skipped.candidates[0].reasons, ["release-state-changed"]);
  assert.deepEqual(f.reads, []);
  assert.equal((await f.run({ operation: "inspect", task: a.task })).handoff, "stale");
  const fresh = await f.run(f.release({ ...a, state: stored.oid }, head));
  assert.equal(fresh.handoff, "active");
});

test("the release link and task state participate in the same branch deletion transaction", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a), ctx = await context(f.root);
  const sealed = await f.run(f.release(a, head));
  const name = releaseRef(localScope, a.task), stored = await loadTask(ctx, a.task);
  stored.releaseLink = { name, oid: f.base };
  await withGuard(ctx, "task", a.task, () => withGuard(ctx, "common", undefined, async () => {
    await assert.rejects(saveTask(ctx, stored, { reasons: ["stale-link"] }, { deleteBranch: true }), { code: "state-changed" });
  }));
  assert.equal(f.git(["rev-parse", name]), sealed.state); assert.equal((await loadTask(ctx, a.task)).oid, sealed.state);
  assert.equal(f.git(["rev-parse", a.branchName]), head);
  f.git(["update-ref", releaseRef(otherScope, a.task), sealed.state]);
  const result = await f.start("ambiguous-link");
  assert.equal(result.exitCode, 0); assert.deepEqual(result.candidates[0].reasons, ["release-state-changed"]);
  assert.equal((await f.run({ operation: "inspect", task: a.task })).handoff, "ambiguous");
  assert.ok(fs.existsSync(a.path)); assert.deepEqual(f.reads, []);
});

test("the fifth waiting task gets a turn even when all preceding PRs remain absent", async t => {
  const f = await setup(t);
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const a = await f.create("pending-" + i);
    assert.equal((await f.run(f.release(a, f.base))).handoff, "active");
    ids.push(a.task);
  }
  f.ports.github.request = async (method, route) => {
    assert.equal(method, "GET");
    if (route.includes("/pulls?")) return { status: 200, data: [] };
    return { status: 200, data: { id: 42, full_name: "fixture/stagekeeper", disabled: false, archived: false } };
  };
  const first = await f.start("round-one"), second = await f.start("round-two");
  assert.deepEqual(first.candidates.map(row => row.task), ids.sort().slice(0, 4));
  assert.equal(second.candidates[0].task, ids[4]); assert.equal(second.candidates.length, 4);
});

test("expiration before removal preserves both resources, expiration after removal still verifies the branch", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  f.pr(a, head); await f.run(f.release(a, head, { pr: 1 })); f.mergeRemote();
  let now = 0;
  f.ports.clock = () => now;
  f.ports.inspectUsage = async () => { now += 20001; return clear(); };
  const before = await f.start("deadline-before");
  assert.equal(before.exitCode, 0); assert.deepEqual(before.candidates[0].reasons, ["task-admission-expired"]);
  assert.ok(fs.existsSync(a.path)); assert.equal(f.git(["rev-parse", a.branchName]), head);
  let postRemovalChecks = 0;
  const request = f.ports.github.request;
  f.ports.github.request = async (...args) => {
    if (!fs.existsSync(a.path)) { now += 20001; postRemovalChecks++; }
    return request(...args);
  };
  f.ports.inspectUsage = async () => clear();
  const after = await f.start("deadline-after");
  assert.equal(after.candidates[0].branch, "removed"); assert.ok(postRemovalChecks > 0);
});

test("concurrent starts and a same-head resume cannot duplicate a cleanup", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  f.pr(a, head); const sealed = await f.run(f.release(a, head, { pr: 1 })); f.mergeRemote();
  const entered = Promise.withResolvers(), proceed = Promise.withResolvers();
  const request = f.ports.github.request;
  f.ports.github.request = async (...args) => {
    if (args[1].endsWith("/pulls/1")) { entered.resolve(); await proceed.promise; }
    return request(...args);
  };
  const first = f.start("concurrent-one");
  try {
    await entered.promise;
    const second = await f.start("concurrent-two");
    assert.equal(second.exitCode, 0); assert.deepEqual(second.candidates[0].reasons, ["guard-held"]);
    const resume = await f.run({ operation: "resume", task: a.task, owner: a.owner, expectedState: sealed.state });
    assert.deepEqual(resume.reasons, ["guard-held"]);
  } finally { proceed.resolve(); }
  assert.equal((await first).candidates[0].branch, "removed");
  assert.deepEqual((await f.start("post-concurrency")).candidates, []);
});

test("native handoff compares equivalent work lists before and after a human merge", {
  skip: process.env.STAGEKEEPER_CLOSEOUT_NATIVE_REQUIRED !== "1",
}, async t => {
  assert.equal(matchesMacCloseoutHostV1(), true);
  for (const operation of ["create", "start"]) {
    await t.test(operation, async sub => {
      const f = await setup(sub, { native: true });
      f.ports.clock = () => performance.now();
      const a = await f.create(), head = f.commit(a);
      const counts = {};
      async function measure(name) {
        const previous = f.reads.length, began = performance.now();
        const result = await f[operation](name);
        assert.equal(result.exitCode, 0, JSON.stringify(result));
        counts[name] = { milliseconds: Math.round(performance.now() - began), githubReads: f.reads.length - previous };
        return result;
      }
      await measure("empty");
      const sealed = await f.run(f.release(a, head));
      assert.equal(sealed.handoff, "active", JSON.stringify(sealed));
      f.pr(a, head);
      const open = await measure("open");
      if (operation === "start") assert.deepEqual(open.candidates[0].reasons, ["pr-open"]);
      f.mergeRemote();
      const merged = await measure("merged");
      if (operation === "start") {
        assert.equal(merged.candidates[0].branch, "removed", JSON.stringify(merged));
        f.absent(a.path);
      } else {
        assert.ok(fs.existsSync(a.path));
      }
      sub.diagnostic(JSON.stringify(counts));
    });
  }
});

test("a killed start cannot recover a dead guard or erase a recreated same-head branch", async t => {
  const f = await setup(t), a = await f.create(), head = f.commit(a);
  f.pr(a, head); await f.run(f.release(a, head, { pr: 1 })); f.mergeRemote();
  const options = { root: f.root, operation: "start", owner: "next-owner", branch: "harness/interrupted", path: path.join(f.directory, "interrupted") };
  const input = path.join(f.directory, "start-input.json");
  fs.writeFileSync(input, JSON.stringify({ options, repository: f.state.pr.head.repo, pr: f.state.pr, worktree: a.path, scope: localScope }));
  const script = fileURLToPath(new URL("./testing/interrupt-task-start.mjs", import.meta.url));
  const child = f.ownChild(spawn(process.execPath, [script, input], { stdio: ["pipe", "pipe", "pipe"] }));
  const closed = new Promise(resolve => child.once("close", resolve));
  try {
    const signal = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("start interruption handshake timed out")), 60000);
      child.stdout.once("data", chunk => { clearTimeout(timer); resolve(chunk.toString()); });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("lost start worker")); });
    });
    assert.equal(signal, "removed-before-branch\n");
  } finally { child.kill("SIGKILL"); await closed; }
  f.absent(a.path);
  const ctx = await context(f.root), owner = guardStatus(ctx, "task", a.task);
  assert.equal(owner.state, "dead");
  const blocked = await f.start("dead-guard");
  assert.equal(blocked.exitCode, 0); assert.deepEqual(blocked.candidates[0].reasons, ["guard-held"]);
  assert.equal(guardStatus(ctx, "task", a.task).nonce, owner.nonce);
  const released = await f.run({ operation: "recover-guard", guard: "task", task: a.task, expectedNonce: owner.nonce, confirmedQuiescent: true });
  assert.equal(released.exitCode, 0);
  f.git(["update-ref", "-d", "refs/heads/" + a.branchName, head]);
  f.git(["branch", a.branchName, head]);
  const result = await f.start("after-interrupt");
  assert.deepEqual(result.candidates[0].reasons, ["branch-ownership-unconfirmed"]);
  assert.equal(f.git(["rev-parse", a.branchName]), head);
});
