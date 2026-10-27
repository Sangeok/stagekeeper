import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runnerHost } from "../runtime/runner-client.mjs";
import { REASONS, RELEASE_LINES, START_LINES } from "./harness-background.mjs";
import { atomicWrite, clearState, LEGACY_RECLAIM_GUARD, readState, recordedChildren, residentLock, startSession, stateFiles, withGuard,
  writeStopRequest } from "../runtime/local-session.mjs";

const BIN = fileURLToPath(new URL("./harness-background.mjs", import.meta.url));
const TOKEN = "hu_" + "b".repeat(43);
const VERSION = "012345abcdef";
const COPY = readFileSync(new URL("../../docs/conventions/product-copy.md", import.meta.url), "utf8");
const CONFIG = { version: 1, project: { owner: "owner", repo: "repo", branch: "main", slug: "owner-repo" },
  workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] };
const IDENTITY = { owner: "OWNER", repo: "REPO", slug: "owner-repo", available: true };
const EMPTY = { head: { action: "none", reason: "No work." }, items: [] };
const READY = { ...EMPTY, items: [{ key: "ITEM-01", node: "plan", version: 1, action: "dispatch", agent: "dev", hint: "Plan.", format: null }] };
const BASE_ENV = { ...process.env };
for (const key of Object.keys(BASE_ENV)) if (key.startsWith("HARNESS_") || key.startsWith("GIT_CONFIG") || key === "NODE_OPTIONS" || key.startsWith("STAGEKEEPER_TEST_")) delete BASE_ENV[key];

const FAKE_CLAUDE = `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const count = Number(process.env.GIT_CONFIG_COUNT ?? 0);
const record = () => appendFileSync(process.env.FAKE_RECORD, JSON.stringify({ args, pid: process.pid, server: process.env.HARNESS_SERVER,
  count: process.env.GIT_CONFIG_COUNT ?? null, key: process.env["GIT_CONFIG_KEY_" + (count - 1)] ?? null,
  value: process.env["GIT_CONFIG_VALUE_" + (count - 1)] ?? null }) + "\\n");
const out = value => process.stdout.write(JSON.stringify(value) + "\\n");
if (args[1] === "Reply with OK.") record();
out({ type: "system", subtype: "hook_started" });
const mode = args[args.indexOf("--permission-mode") + 1];
out({ type: "system", subtype: "init", permissionMode: process.env.FAKE_PERMISSION ?? mode });
if (args[1] === "Reply with OK.") setInterval(() => {}, 1000);
else {
  if (process.env.STAGEKEEPER_TEST_PLAN_DELAY) await new Promise(resolve => setTimeout(resolve, Number(process.env.STAGEKEEPER_TEST_PLAN_DELAY)));
  const plan = JSON.parse(readFileSync(process.env.FAKE_PLAN, "utf8"));
  const step = plan.length > 1 ? plan.shift() : plan[0];
  writeFileSync(process.env.FAKE_PLAN, JSON.stringify(plan));
  record();
  if (step.kind === "hang" && process.env.STAGEKEEPER_TEST_CRASH_CLIENT) writeFileSync(process.env.STAGEKEEPER_TEST_CRASH_CLIENT, JSON.stringify({ pid: process.pid }));
  if (step.touch) writeFileSync(step.touch, "partial\\n");
  if (step.kind === "hang") setInterval(() => {}, 1000);
  else {
    // success는 서버의 일을 넘기고(진전), noop은 성공으로 끝나지만 일을 그대로 둔다(진전 없음).
    if (step.kind === "success") await fetch(process.env.HARNESS_SERVER + "/test/advance", { method: "POST", body: "{}" });
    const ok = step.kind === "success" || step.kind === "noop";
    out({ type: "result", subtype: ok ? "success" : "error_during_execution", is_error: !ok,
      num_turns: 2, terminal_reason: "completed", permission_denials: [] });
    process.exit(ok ? 0 : 1);
  }
}
`;

async function waitFor(predicate, limit = 30000, what = "condition") {
  const expires = performance.now() + limit;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (performance.now() > expires) assert.fail(`Timed out waiting for ${what}.`);
    await delay(100);
  }
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } };
const lines = file => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)) : []);

async function fixture(t, { plan = [{ kind: "success" }], env: extra = {}, controlledCrash = false } = {}) {
  const root = mkdtempSync(path.join(realpathSync.native(tmpdir()), "harness-background-test-"));
  const runnerCalls = [];
  let overview = READY;
  let runner = (body, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true, paused: false })); };
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (req.url === "/test/advance") { overview = EMPTY; res.end("{}"); return; }
    const body = JSON.parse(raw);
    if (req.url === "/api/runner") { runnerCalls.push(body); await runner(body, res); return; }
    const value = body.params.name === "project_get" ? IDENTITY : overview;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(value) }] } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  writeFileSync(path.join(root, "harness.json"), JSON.stringify(CONFIG));
  writeFileSync(path.join(root, "CLAUDE.md"), `<!-- harness:runbook:start -->\nThis document is runbook version \`${VERSION}\`.\n<!-- harness:runbook:end -->\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  const tools = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-background-tools-"));
  const fake = path.join(tools, "fake-claude.mjs");
  writeFileSync(fake, FAKE_CLAUDE);
  const planFile = path.join(tools, "plan.json");
  writeFileSync(planFile, JSON.stringify(plan));
  const record = path.join(tools, "record.jsonl");
  const notices = path.join(tools, "notices.jsonl");
  const directory = path.join(root, ".git", "harness");
  const env = { ...BASE_ENV, HARNESS_TOKEN: TOKEN, HARNESS_SERVER: url, STAGEKEEPER_TEST_CLAUDE: fake, STAGEKEEPER_TEST_NOTIFY_FILE: notices,
    FAKE_PLAN: planFile, FAKE_RECORD: record, ...extra };
  const crashCheckpoint = path.join(tools, "crash-checkpoint.json");
  if (controlledCrash) {
    const preload = path.join(tools, "crash-checkpoint.mjs");
    writeFileSync(preload, `
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const remove = fs.rmdirSync;
fs.rmdirSync = function(directory, ...args) {
  const result = remove.call(this, directory, ...args);
  if (!process.argv.includes("--run") || path.basename(directory) !== "watch.guard") return result;
  const lock = JSON.parse(fs.readFileSync(path.join(path.dirname(directory), "watch.lock.json"), "utf8"));
  if (lock.poller?.pid !== process.pid || !lock.children?.length) return result;
  try {
    const client = JSON.parse(fs.readFileSync(process.env.STAGEKEEPER_TEST_CRASH_CLIENT, "utf8"));
    process.kill(client.pid, 0);
  } catch { return result; }
  fs.writeFileSync(process.env.STAGEKEEPER_TEST_CRASH_CHECKPOINT, JSON.stringify({ session: lock.id, pid: process.pid }));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  return result;
};
syncBuiltinESMExports();
`);
    env.NODE_OPTIONS = `--import=${pathToFileURL(preload).href}`;
    env.STAGEKEEPER_TEST_CRASH_CHECKPOINT = crashCheckpoint;
    env.STAGEKEEPER_TEST_CRASH_CLIENT = path.join(tools, "crash-client.json");
  }
  const run = (args, more = {}) => new Promise(resolve => {
    const child = spawn(process.execPath, [BIN, "--root", root, ...args], { env: { ...env, ...more }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("close", code => {
      const text = stdout.trim().split(/\r?\n/);
      resolve({ code, event: JSON.parse(text.pop()), text, stderr });
    });
  });
  const lockPath = path.join(directory, "watch.lock.json");
  const status = () => (existsSync(path.join(directory, "background.json")) ? JSON.parse(readFileSync(path.join(directory, "background.json"), "utf8")) : null);
  t.after(async () => {
    if (existsSync(lockPath)) {
      await run(["--stop"]).catch(() => {});
      await waitFor(() => !existsSync(lockPath), 15000, "runner stop").catch(() => {});
    }
    const pid = status()?.pid;
    if (pid && alive(pid)) { try { process.kill(pid); } catch {   } }
    for (const entry of lines(record)) if (alive(entry.pid)) { try { process.kill(entry.pid); } catch {   } }
    await new Promise(resolve => server.close(resolve));
    for (const dir of [root, tools]) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  return { root, tools, url, git, run, runnerCalls, directory, lockPath, crashCheckpoint, status, record: () => lines(record), notices: () => lines(notices),
    setRunner: handler => { runner = handler; }, setOverview: value => { overview = value; } };
}

const START = ["--start", "--propose", "no", "--interval", "0.2", "--run-limit", "0.2"];

it("waits for a session creation transaction before checking whether the checkout is locked", async t => {
  const f = await fixture(t), files = stateFiles(f.directory);
  await startSession(files, { root: f.root, server: f.url, project: "owner-repo", configHash: "a".repeat(64), tokenHash: "b".repeat(64) },
    { client: "claude", commit: false, propose: false });
  const state = readState(files);
  await withGuard(files, () => clearState(files));
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const writing = withGuard(files, async () => {
    atomicWrite(files.policy, state.policy); entered();
    await gate;
    atomicWrite(files.lock, state.lock);
  });
  await ready;
  let result;
  const checking = f.run(["--preflight"]).then(value => { result = value; return value; });
  try {
    await delay(500);
    assert.equal(result, undefined, JSON.stringify(result?.event));
    release(); await writing;
    assert.equal((await checking).event.code, "locked");
    assert.equal(f.record().length, 0);
    assert.equal(f.runnerCalls.length, 0);
  } finally {
    release(); await writing; await checking;
    await withGuard(files, () => clearState(files));
  }
});

it("records a redacted corrupt-state phase without repairing state or starting a client", async t => {
  const f = await fixture(t), policy = path.join(f.directory, "watch.json"), body = '{"token":"SECRET_STATE_CANARY",';
  mkdirSync(f.directory, { recursive: true }); writeFileSync(f.lockPath, body); writeFileSync(policy, "{}");
  try {
    const refused = await f.run(START);
    assert.equal(refused.event.code, "corrupt-state"); assert.deepEqual(Object.keys(refused.event), ["event", "code", "reason"]);
    assert.equal(readFileSync(f.lockPath, "utf8"), body); assert.equal(readFileSync(policy, "utf8"), "{}");
    const log = readFileSync(path.join(f.directory, "background.log"), "utf8");
    assert.match(log, /"phase":"read-json","target":"lock","errorKind":"SyntaxError"/);
    assert.equal(log.includes("SECRET_STATE_CANARY"), false); assert.equal(log.includes(f.root), false);
    assert.equal(f.record().length, 0); assert.equal(f.runnerCalls.length, 0);
  } finally { unlinkSync(f.lockPath); unlinkSync(policy); }
});

it("records runtime state corruption and preserves the unreadable ownership", async t => {
  const f = await fixture(t);
  f.setOverview(EMPTY);
  const started = await f.run(START);
  assert.equal(started.event.event, "started");
  await waitFor(() => f.status()?.state === "idle");
  const body = '{"token":"SECRET_RUNTIME_STATE_CANARY",';
  writeFileSync(f.lockPath, body);
  await waitFor(() => f.status()?.stopReason === "unsettled");
  await waitFor(() => !alive(f.status().pid));
  try {
    assert.equal(readFileSync(f.lockPath, "utf8"), body);
    const log = readFileSync(path.join(f.directory, "background.log"), "utf8");
    assert.match(log, /"operation":"lifecycle","phase":"read-json","target":"lock","errorKind":"SyntaxError"/);
    assert.equal(log.includes("SECRET_RUNTIME_STATE_CANARY"), false);
    assert.equal(log.includes(f.root), false);
    assert.equal(f.record().filter(entry => entry.args[1] !== "Reply with OK.").length, 0);
  } finally { unlinkSync(f.lockPath); unlinkSync(path.join(f.directory, "watch.json")); }
});

it("records an in-loop status write failure without reflecting the system message", async t => {
  const f = await fixture(t), preload = path.join(f.tools, "status-write-failure.mjs");
  writeFileSync(preload, `
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const rename = fs.renameSync;
fs.renameSync = function(source, target, ...args) {
  if (process.argv.includes("--run") && path.basename(target) === "background.json"
    && JSON.parse(fs.readFileSync(source, "utf8")).state === "working") {
    throw Object.assign(new Error("SECRET_STATUS_WRITE_CANARY " + target), { code: "EPERM" });
  }
  return rename.call(this, source, target, ...args);
};
syncBuiltinESMExports();
`);
  await f.run(START, { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` });
  await waitFor(() => f.status()?.state === "stopped" && !existsSync(f.lockPath));
  assert.equal(f.status().stopReason, "error");
  const log = readFileSync(path.join(f.directory, "background.log"), "utf8");
  assert.match(log, /"operation":"run","phase":"state-write","target":"status","errorKind":"Error","systemCode":"EPERM"/);
  assert.equal(log.includes("SECRET_STATUS_WRITE_CANARY"), false);
  assert.equal(log.includes(f.root), false);
  assert.equal(f.record().filter(entry => entry.args[1] !== "Reply with OK.").length, 0);
});

it("preserves a live owner when the stop write is denied and accepts a later stop", async t => {
  const f = await fixture(t), preload = path.join(f.tools, "stop-write-failure.mjs");
  f.setOverview(EMPTY);
  writeFileSync(preload, `
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const rename = fs.renameSync;
fs.renameSync = function(source, target, ...args) {
  if (process.argv.includes("--stop") && path.basename(target) === "watch.lock.json") {
    throw Object.assign(new Error("SECRET_STOP_WRITE_CANARY " + target), { code: "EBUSY" });
  }
  return rename.call(this, source, target, ...args);
};
syncBuiltinESMExports();
`);
  const started = await f.run(["--start", "--propose", "no", "--interval", "60"]);
  assert.equal(started.event.event, "started");
  await waitFor(() => f.runnerCalls.some(call => call.op === "beat"));
  const before = readFileSync(f.lockPath, "utf8");
  const refused = await f.run(["--stop"], { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` });
  assert.equal(refused.event.code, "corrupt-state");
  assert.equal(readFileSync(f.lockPath, "utf8"), before);
  assert.equal(alive(JSON.parse(before).poller.pid), true);
  assert.equal(existsSync(f.lockPath + ".tmp"), false);
  const log = readFileSync(path.join(f.directory, "background.log"), "utf8");
  assert.match(log, /"operation":"stop","phase":"state-write","target":"lock","errorKind":"Error","systemCode":"EBUSY"/);
  assert.equal(log.includes("SECRET_STOP_WRITE_CANARY"), false);
  assert.equal(log.includes(f.root), false);
  assert.equal((await f.run(["--stop"])).event.event, "stopping");
  await waitFor(() => !existsSync(f.lockPath));
});

it("starts a resident runner that runs ready work with push blocked, logs it and stops on a local stop", async t => {
  const f = await fixture(t);
  const started = await f.run(START);
  assert.equal(started.code, 0, started.text.join("\n"));
  assert.equal(started.event.event, "started");
  assert.equal(started.event.permission, "auto");
  const session = started.event.session;
  assert.ok(started.text.includes(START_LINES.edit.replace("{branch}", "main")));
  assert.deepEqual(f.runnerCalls[0], { op: "start", session, mode: "resident", host: runnerHost(), branch: "main", permission: "auto",
    autostart: false, project: "owner-repo" });
  const lock = JSON.parse(readFileSync(f.lockPath, "utf8"));
  assert.equal(lock.mode, "resident");
  assert.equal(JSON.parse(readFileSync(path.join(f.directory, "watch.json"), "utf8")).commit, true);

  const runs = await waitFor(() => { const found = f.record().filter(entry => entry.args[1] !== "Reply with OK."); return found.length ? found : null; }, 30000, "a run");
  const args = runs[0].args;
  assert.equal(args[1], `/harness:watch --once --session ${session}`);
  assert.deepEqual(args.slice(2, 4), ["--permission-mode", "auto"]);
  assert.equal(args[args.indexOf("--settings") + 1], path.join(f.directory, "background-settings.json"));
  assert.ok(args.includes("Bash(git push:*)") && args.includes("PowerShell(git push*)"));
  assert.equal(runs[0].count, "1");
  assert.equal(runs[0].key, "url.stagekeeper-push-blocked://.pushInsteadOf");
  assert.equal(runs[0].value, "");
  assert.equal(runs[0].server, f.url);

  const reported = await waitFor(() => f.runnerCalls.find(call => call.op === "beat" && call.lastResult), 30000, "the run result");
  assert.equal(reported.lastResult, "done: 2 turns, 0 denied");
  assert.match(reported.lastLog, /^\d{8}T\d{9}Z\.jsonl$/);
  assert.ok(f.runnerCalls.some(call => call.op === "beat" && call.state === "working"));
  const logs = readdirSync(path.join(f.directory, "runs"));
  assert.ok(logs.includes(reported.lastLog) && logs.includes(reported.lastLog.replace(".jsonl", ".meta.json")));

  const status = await f.run(["--status"]);
  assert.equal(status.event.running, true);
  assert.equal(status.event.branch, "main");
  const stopping = await f.run(["--stop"]);
  if (stopping.event.event !== "stopping") {
    for (const line of readFileSync(path.join(f.directory, "background.log"), "utf8").split(/\r?\n/).filter(line => line.includes('"event":"state-diagnostic"'))) t.diagnostic(line);
  }
  assert.equal(stopping.event.event, "stopping", JSON.stringify(stopping.event));
  await waitFor(() => !existsSync(f.lockPath) && f.status()?.state === "stopped", 15000, "the runner to stop");
  assert.ok(f.runnerCalls.some(call => call.op === "stop" && call.reason === "owner" && call.session === session));
  assert.equal(f.status().stopReason, "owner");
});

it("preserves a successor status written immediately after the stop guard releases", async t => {
  const f = await fixture(t);
  f.setOverview(EMPTY);
  const preload = path.join(f.tools, "successor-after-release.mjs");
  writeFileSync(preload, `
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const original = fs.rmdirSync;
let previous, installed = false;
fs.rmdirSync = function(directory, ...args) {
  const result = original.call(this, directory, ...args);
  if (!process.argv.includes("--run") || path.basename(directory) !== "watch.guard" || installed) return result;
  const root = path.dirname(directory), lock = path.join(root, "watch.lock.json"), policy = path.join(root, "watch.json"), status = path.join(root, "background.json");
  if (fs.existsSync(lock)) previous = JSON.parse(fs.readFileSync(lock, "utf8"));
  else if (previous) {
    installed = true;
    fs.writeFileSync(lock, JSON.stringify({ ...previous, id: "successor", poller: null, lifecycle: "active", children: [] }));
    fs.writeFileSync(policy, JSON.stringify({ schemaVersion: 1, session: "successor", commit: true, propose: false }));
    fs.writeFileSync(status, JSON.stringify({ session: "successor", state: "starting" }));
  }
  return result;
};
syncBuiltinESMExports();
`);
  const started = await f.run(START, { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` });
  assert.equal(started.event.event, "started");
  const pid = JSON.parse(readFileSync(f.lockPath, "utf8")).poller.pid;
  await f.run(["--stop"]);
  await waitFor(() => !alive(pid), 15000, "previous resident exit");
  assert.deepEqual(f.status(), { session: "successor", state: "starting" });
  assert.equal(JSON.parse(readFileSync(f.lockPath, "utf8")).id, "successor");
  assert.equal(f.runnerCalls.filter(call => call.op === "stop" && call.session === "successor").length, 0);
});

it("falls back to acceptEdits with the allow list when auto mode is not available", async t => {
  const f = await fixture(t, { env: { FAKE_PERMISSION: "default" } });
  const started = await f.run(START);
  assert.equal(started.event.permission, "allowlist");
  assert.ok(started.text.includes(START_LINES.allowlist));
  assert.equal(f.runnerCalls[0].permission, "allowlist");
  const run = await waitFor(() => f.record().find(entry => entry.args[1] !== "Reply with OK."), 30000, "a run");
  assert.deepEqual(run.args.slice(2, 4), ["--permission-mode", "acceptEdits"]);
});

it("refuses to start on uncommitted changes, a detached HEAD, a remote with its own push URL or an occupied checkout", async t => {
  const f = await fixture(t);
  writeFileSync(path.join(f.root, "new.txt"), "x");
  const dirty = await f.run(["--preflight"]);
  assert.equal(dirty.code, 1);
  assert.equal(dirty.event.code, "dirty");
  assert.equal(dirty.event.reason, "Uncommitted changes: new.txt. Commit or stash them before you start the runner.");
  assert.equal((await f.run(START)).event.code, "dirty");
  unlinkSync(path.join(f.root, "new.txt"));

  f.git("remote", "add", "origin", "https://example.invalid/repo.git");
  f.git("config", "remote.origin.pushurl", "https://example.invalid/push.git");
  assert.equal((await f.run(["--preflight"])).event.code, "push-url");
  f.git("config", "--unset", "remote.origin.pushurl");

  f.git("checkout", "-q", "--detach");
  assert.equal((await f.run(["--preflight"])).event.code, "detached");
  f.git("checkout", "-q", "main");

  const ready = await f.run(["--preflight"]);
  assert.equal(ready.event.event, "ready");
  assert.equal(ready.event.branch, "main");
  assert.equal(f.runnerCalls.length, 0);
  assert.equal(existsSync(f.lockPath), false);

  assert.equal((await f.run(START)).event.event, "started");
  const second = await f.run(START);
  assert.equal(second.event.code, "locked");
});

it("refuses a server without the runner route, a busy project and a Free plan without leaving local state", async t => {
  const f = await fixture(t);
  f.setRunner((body, res) => { res.statusCode = 404; res.end(); });
  const missing = await f.run(START);
  assert.equal(missing.event.code, "no-route");
  assert.equal(existsSync(f.lockPath), false);
  f.setRunner((body, res) => { res.statusCode = 409; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "busy", code: "RUNNER_BUSY", holder: { mode: "session", host: "OTHER-PC", seenAt: "2026-10-21T00:00:00.000Z" } })); });
  const busy = await f.run(START);
  assert.equal(busy.event.code, "busy");
  assert.equal(busy.event.reason, "A runner is already running for this project on OTHER-PC (last signal 2026-10-21T00:00:00.000Z UTC). Stop it there, or take it over.");
  f.setRunner((body, res) => { res.statusCode = 403; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "plan", code: "PLAN_REQUIRED" })); });
  const plan = await f.run(START);
  assert.equal(plan.event.code, "plan");
  assert.equal(existsSync(f.lockPath), false);
});

it("waits on uncommitted changes with one notice and continues once the tree is clean", async t => {
  const f = await fixture(t, { plan: [{ kind: "success" }] });
  f.setOverview(EMPTY);
  assert.equal((await f.run(START)).event.event, "started");
  writeFileSync(path.join(f.root, "draft.txt"), "x");
  f.setOverview(READY);
  await waitFor(() => f.runnerCalls.find(call => call.op === "beat" && call.state === "waiting" && call.waitReason === "dirty"), 30000, "a dirty wait");
  await delay(1000);
  assert.deepEqual(f.notices().map(notice => notice.kind), ["waitDirty"]);
  assert.equal(f.notices()[0].body, "Uncommitted changes: draft.txt. Commit or stash them, and it continues.");
  assert.equal(f.record().filter(entry => entry.args[1] !== "Reply with OK.").length, 0);
  unlinkSync(path.join(f.root, "draft.txt"));
  await waitFor(() => f.runnerCalls.find(call => call.op === "beat" && call.lastResult), 30000, "the run after the wait");
});

it("ends a run when the branch changes, waits on the branch and resumes after switching back", async t => {
  const f = await fixture(t, { plan: [{ kind: "hang" }, { kind: "success" }], env: { STAGEKEEPER_TEST_PLAN_DELAY: "1500" } });
  const started = await f.run(["--start", "--propose", "no", "--interval", "0.3", "--run-limit", "5"]);
  assert.equal(started.event.event, "started");
  const hung = await waitFor(() => f.record().find(entry => entry.args[1] !== "Reply with OK."), 30000, "the first run");
  f.git("switch", "-q", "-c", "other");
  await waitFor(() => f.notices().some(notice => notice.kind === "branchEnded"), 30000, "the branch notice");
  await waitFor(() => !alive(hung.pid), 15000, "the run to end");
  const notice = f.notices().find(item => item.kind === "branchEnded");
  assert.equal(notice.body, "The checkout switched to other during a run, so the runner ended that run. Switch back to main, and it continues.");
  await waitFor(() => f.runnerCalls.find(call => call.op === "beat" && call.state === "waiting" && call.waitReason === "branch"), 15000, "a branch wait");
  assert.equal(f.status().failures, 0);
  assert.ok(!f.notices().some(item => item.kind === "waitBranch"));
  f.git("switch", "-q", "main");
  await waitFor(() => f.runnerCalls.find(call => call.op === "beat" && call.lastResult?.startsWith("done:")), 30000, "the run after switching back");
});

it("stops with an error after three failed runs and tells the server", async t => {
  const f = await fixture(t, { plan: [{ kind: "fail" }] });
  const started = await f.run(START);
  // 실행기는 잠금을 지운 뒤에 알림을 쓴다 — 둘 다 끝날 때까지 기다린다.
  await waitFor(() => !existsSync(f.lockPath) && f.notices().some(notice => notice.kind === "error"), 60000, "the error stop and its notice");
  assert.ok(f.runnerCalls.some(call => call.op === "stop" && call.reason === "error" && call.session === started.event.session));
  assert.equal(f.record().filter(entry => entry.args[1] !== "Reply with OK.").length, 3);
});

it("stops as stuck after three runs that leave the same work", async t => {
  const f = await fixture(t, { plan: [{ kind: "noop" }] });
  const started = await f.run(START);
  await waitFor(() => !existsSync(f.lockPath) && f.notices().some(notice => notice.kind === "stuck"), 60000, "the stuck stop and its notice");
  assert.ok(f.runnerCalls.some(call => call.op === "stop" && call.reason === "stuck" && call.session === started.event.session));
});

it("stops without a server stop when another runner takes over", async t => {
  const f = await fixture(t);
  f.setOverview(EMPTY);
  assert.equal((await f.run(START)).event.event, "started");
  f.setRunner((body, res) => { res.statusCode = 409; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "replaced", code: "RUNNER_REPLACED" })); });
  await waitFor(() => !existsSync(f.lockPath) && f.notices().some(notice => notice.kind === "replaced"), 15000, "the replaced stop and its notice");
  assert.ok(!f.runnerCalls.some(call => call.op === "stop"));
});

it("clears a dead runner's lock on the next start and keeps only the newest fifty run logs", async t => {
  const f = await fixture(t);
  f.setOverview(EMPTY);
  const first = await f.run(START);
  const pid = await waitFor(() => f.status()?.pid, 15000, "the runner pid");
  process.kill(pid);
  await waitFor(() => !alive(pid), 15000, "the runner to die");
  const runs = path.join(f.directory, "runs");
  for (let i = 0; i < 55; i++) writeFileSync(path.join(runs, `20200101T0000${String(i).padStart(5, "0")}Z.jsonl`), "");
  f.setOverview(READY);
  const second = await f.run(START);
  assert.equal(second.event.event, "started");
  assert.notEqual(second.event.session, first.event.session);
  await waitFor(() => f.runnerCalls.find(call => call.op === "beat" && call.lastResult && call.session === second.event.session), 30000, "a run");
  assert.equal(readdirSync(runs).filter(name => name.endsWith(".jsonl")).length, 50);
});

it("holds an unconfirmed child settlement until the owner releases it", async t => {
  const f = await fixture(t);
  const preload = path.join(f.tools, "fail-settlement.mjs");
  writeFileSync(preload, `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const rename = fs.renameSync;
let failed = false;
fs.renameSync = (source, target) => {
  if (!failed && process.argv.includes("--run") && String(target).endsWith("watch.lock.json")) {
    const before = JSON.parse(fs.readFileSync(target, "utf8"));
    const after = JSON.parse(fs.readFileSync(source, "utf8"));
    if (before.children?.length && after.children?.length === 0) {
      failed = true;
      throw new Error("Injected child settlement failure");
    }
  }
  return rename(source, target);
};
syncBuiltinESMExports();
`);
  const started = await f.run(START, { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` });
  assert.equal(started.event.event, "started");
  await waitFor(() => f.status()?.stopReason === "unsettled", 15000, "unconfirmed settlement");
  await waitFor(() => !alive(f.status().pid), 15000, "the failed runner to exit");
  const lock = JSON.parse(readFileSync(f.lockPath, "utf8"));
  assert.equal(lock.id, started.event.session);
  assert.equal(lock.lifecycle, "stopping");
  assert.equal(lock.unsettled, true);
  assert.equal(recordedChildren(lock).length, 1);
  assert.ok(recordedChildren(lock).every(child => !alive(child.pid)));
  assert.deepEqual(lock.children.filter(child => child.nonce === LEGACY_RECLAIM_GUARD.nonce), [LEGACY_RECLAIM_GUARD]);
  assert.ok(f.runnerCalls.every(call => call.op !== "stop" && !call.lastResult));
  const held = REASONS.held.replace("{startedAt}", lock.startedAt);
  for (const args of [START, ["--stop"]]) {
    const refused = await f.run(args);
    assert.deepEqual([refused.code, refused.event.code, refused.event.reason], [1, "held", held]);
  }
  assert.equal((await f.run(["--status"])).event.held, true);
  assert.deepEqual(JSON.parse(readFileSync(f.lockPath, "utf8")), lock);
  assert.ok(f.runnerCalls.every(call => call.op !== "stop"));

  const runs = path.join(f.directory, "runs");
  const log = path.join(runs, readdirSync(runs).filter(name => name.endsWith(".jsonl")).sort().at(-1));
  const check = await f.run(["--release"]);
  assert.deepEqual([check.code, check.event.event, check.event.session, check.event.unsettled], [0, "release-check", lock.id, true]);
  assert.deepEqual(check.text, [RELEASE_LINES.process.replace("{startedAt}", lock.startedAt), RELEASE_LINES.unsettled, RELEASE_LINES.log.replace("{log}", log)]);
  const changed = await f.run(["--release", "--session", "another-session"]);
  assert.deepEqual([changed.code, changed.event.code, changed.event.reason], [1, "release-changed", REASONS["release-changed"]]);
  assert.deepEqual(JSON.parse(readFileSync(f.lockPath, "utf8")), lock);

  const released = await f.run(["--release", "--session", lock.id]);
  assert.deepEqual([released.code, released.event.event, released.text], [0, "released", [RELEASE_LINES.released]]);
  assert.equal(existsSync(f.lockPath), false);
  assert.deepEqual([f.status().state, f.status().stopReason], ["stopped", "owner"]);
  assert.ok(f.runnerCalls.some(call => call.op === "stop" && call.session === lock.id && call.reason === "owner"));
  assert.equal((await f.run(["--status"])).event.held, false);
});

it("refuses to release a runner that is still running", async t => {
  const f = await fixture(t);
  f.setOverview(EMPTY);
  const started = await f.run(START);
  assert.equal(started.event.event, "started");
  for (const args of [["--release"], ["--release", "--session", started.event.session]]) {
    const refused = await f.run(args);
    assert.deepEqual([refused.code, refused.event.code, refused.event.reason], [1, "still-running", REASONS["still-running"]]);
  }
  assert.equal(JSON.parse(readFileSync(f.lockPath, "utf8")).id, started.event.session);
});

it("names Codex commands for a crashed Codex runner and treats a fresh lock as still starting", async t => {
  const f = await fixture(t), files = stateFiles(f.directory);
  const binding = { root: f.root, server: f.url, project: "owner-repo", configHash: "a".repeat(64), tokenHash: "b".repeat(64) };
  const install = lock => {
    mkdirSync(f.directory, { recursive: true });
    atomicWrite(files.policy, { schemaVersion: 1, session: lock.id, commit: true, propose: false });
    atomicWrite(files.lock, lock);
  };
  const codex = text => text.replaceAll("/harness:background", "$harness-background");
  const starting = residentLock({ session: randomUUID(), binding, client: "codex", host: "test", at: new Date().toISOString() });
  install(starting);
  assert.deepEqual((await f.run(["--release"])).event.reason, codex(REASONS["still-running"]));
  assert.equal(existsSync(f.lockPath), true);

  const crashed = residentLock({ session: randomUUID(), binding, client: "codex", host: "test", at: new Date(Date.now() - 3_600_000).toISOString() });
  crashed.poller = { pid: spawnSync(process.execPath, ["-e", ""], { windowsHide: true }).pid, nonce: randomUUID() };
  install(crashed);
  const held = REASONS.held.replace("{startedAt}", crashed.startedAt);
  assert.deepEqual((await f.run(["--stop"])).event.reason, codex(held));
  assert.deepEqual((await f.run(START)).event.reason, held);
  assert.equal((await f.run(["--status"])).event.held, true);

  const check = await f.run(["--release"]);
  assert.deepEqual([check.event.event, check.event.client, check.event.unsettled], ["release-check", "codex", false]);
  assert.equal(check.text.at(-1), RELEASE_LINES.log.replace("{log}", path.join(f.directory, "background.log")));
  assert.equal((await f.run(["--release", "--session", starting.id])).event.reason, codex(REASONS["release-changed"]));
  assert.equal((await f.run(["--release", "--session", crashed.id])).event.event, "released");
  assert.equal(existsSync(f.lockPath), false);
  assert.ok(f.runnerCalls.some(call => call.op === "stop" && call.session === crashed.id && call.client === "codex" && call.reason === "owner"));
});

it("stops a runner from a stop request file alone and removes the request with its lock", async t => {
  const f = await fixture(t);
  f.setOverview(EMPTY);
  const started = await f.run(START);
  assert.equal(started.event.event, "started");
  await waitFor(() => f.status()?.state === "idle");
  const files = stateFiles(f.directory);
  writeStopRequest(files, started.event.session);
  await waitFor(() => !existsSync(f.lockPath), 20000, "the runner to stop on the request");
  assert.equal(existsSync(files.stop), false);
  assert.equal(f.status().state, "stopped");
});

it("shows a lock written by a newer plugin and only requests its stop", async t => {
  const f = await fixture(t), files = stateFiles(f.directory), session = randomUUID();
  mkdirSync(f.directory, { recursive: true });
  writeFileSync(files.lock, JSON.stringify({ schemaVersion: 2, id: session, client: "codex", shape: "future" }));
  writeFileSync(files.policy, JSON.stringify({ schemaVersion: 2, session }));
  const status = (await f.run(["--status"])).event;
  assert.deepEqual([status.newer, status.session, status.client, status.held, status.running], [true, session, "codex", false, false]);
  for (const args of [START, ["--release"], ["--release", "--session", session]]) {
    const refused = await f.run(args);
    assert.deepEqual([refused.code, refused.event.code, refused.event.reason], [1, "newer-state", REASONS["newer-state"]]);
  }
  assert.deepEqual((await f.run(["--stop"])).event, { event: "stopping", session });
  assert.equal(JSON.parse(readFileSync(files.stop, "utf8")).session, session);
  assert.equal(JSON.parse(readFileSync(files.lock, "utf8")).shape, "future");
  for (const file of [files.lock, files.policy, files.stop]) unlinkSync(file);
});

async function killMidRun(f, session) {
  const checkpoint = await waitFor(() => {
    try { const value = JSON.parse(readFileSync(f.crashCheckpoint, "utf8")); return value.session === session ? value : null; }
    catch { return null; }
  }, 20000, "a run outside its state guard");
  const lock = await waitFor(() => {
    try {
      const value = JSON.parse(readFileSync(f.lockPath, "utf8"));
      return value.id === session && value.poller && value.children?.length ? value : null;
    } catch { return null; }
  }, 20000, "a run in progress");
  assert.equal(checkpoint.pid, lock.poller.pid);
  assert.equal(existsSync(path.join(f.directory, "watch.guard")), false);
  const client = await waitFor(() => f.record().findLast(entry => !entry.args.includes("Reply with OK.") && alive(entry.pid)), 20000, "the running client");
  const pids = [lock.poller.pid, ...lock.children.map(child => child.pid), client.pid];
  for (const pid of pids) { try { process.kill(pid, "SIGKILL"); } catch {   } }
  await waitFor(() => pids.every(pid => !alive(pid)), 15000, "the killed runner");
}

it("clears a runner that died mid-run on the next start and on a stop", async t => {
  const f = await fixture(t, { plan: [{ kind: "hang" }, { kind: "hang" }, { kind: "success" }], controlledCrash: true });
  const first = await f.run(START);
  assert.equal(first.event.event, "started");
  await killMidRun(f, first.event.session);

  const second = await f.run(START);
  assert.equal(second.event.event, "started");
  assert.notEqual(second.event.session, first.event.session);
  await killMidRun(f, second.event.session);

  assert.deepEqual((await f.run(["--stop"])).event, { event: "stopped", session: second.event.session });
  assert.equal(existsSync(f.lockPath), false);
  assert.ok(f.runnerCalls.some(call => call.op === "stop" && call.session === second.event.session && call.reason === "owner"));
});

it("starts at sign-in after a runner died mid-run", async t => {
  const f = await fixture(t, { plan: [{ kind: "hang" }, { kind: "success" }], controlledCrash: true });
  const first = await f.run(START);
  assert.equal(first.event.event, "started");
  await killMidRun(f, first.event.session);
  writeFileSync(path.join(f.directory, "autostart.json"), JSON.stringify({ schemaVersion: 1, branch: "main" }));

  const signIn = await f.run([...START, "--from-autostart"]);
  assert.equal(signIn.event.event, "started", JSON.stringify({ event: signIn.event, status: f.status(), log: readFileSync(path.join(f.directory, "background.log"), "utf8").slice(-8000) }));
  assert.notEqual(signIn.event.session, first.event.session);
  assert.ok(f.runnerCalls.every(call => call.op !== "autostart"));
});

it("refuses sign-in recovery while an abandoned state guard remains", async t => {
  const f = await fixture(t, { plan: [{ kind: "hang" }], controlledCrash: true });
  const started = await f.run(START);
  assert.equal(started.event.event, "started");
  await killMidRun(f, started.event.session);
  const guard = path.join(f.directory, "watch.guard"), owner = path.join(guard, "owner.json");
  mkdirSync(guard);
  writeFileSync(owner, JSON.stringify({ pid: f.status().pid, nonce: "abandoned-test-guard" }));
  writeFileSync(path.join(f.directory, "autostart.json"), JSON.stringify({ schemaVersion: 1, branch: "main" }));
  const before = [f.lockPath, path.join(f.directory, "watch.json"), owner].map(file => readFileSync(file));
  try {
    const refused = await f.run([...START, "--from-autostart"]);
    assert.equal(refused.event.code, "guard-busy");
    assert.deepEqual([f.lockPath, path.join(f.directory, "watch.json"), owner].map(file => readFileSync(file)), before);
    assert.equal(f.runnerCalls.filter(call => call.op === "start").length, 1);
    assert.equal(existsSync(guard), true);
  } finally { unlinkSync(owner); rmdirSync(guard); }
});

it("refuses a Codex start without its installed configuration before starting a client or server lease", async t => {
  const f = await fixture(t);
  const result = await f.run([...START, "--client", "codex"]);
  assert.equal(result.code, 1);
  assert.equal(result.event.code, "codex-config");
  assert.equal(f.record().length, 0);
  assert.equal(f.runnerCalls.length, 0);
  assert.equal(existsSync(f.lockPath), false);
});

it("refuses Codex autostart, inferred-client overrides and unknown clients before acquiring state", async t => {
  const f = await fixture(t);
  for (const args of [[...START, "--client", "unknown"], ["--autostart-on", "--client", "codex", "--propose", "no"],
    ["--autostart-off", "--client", "codex"], [...START, "--client", "codex", "--from-autostart"],
    ["--stop", "--client", "codex"], ["--status", "--client", "codex"]]) {
    const result = await f.run(args); assert.equal(result.code, 1); assert.equal(result.event.code, "invalid-arguments");
  }
  assert.equal(f.record().length, 0); assert.equal(f.runnerCalls.length, 0); assert.equal(existsSync(f.lockPath), false);
});

it("keeps every refusal and start line in product copy", () => {
  for (const [code, reason] of Object.entries(REASONS)) {
    const sentence = reason.replace(/\{\w+\}/g, "{}");
    assert.ok(COPY.replace(/\{\w+\}/g, "{}").includes(sentence), `${code} is missing from product-copy §15`);
  }
  for (const line of [...Object.values(START_LINES), ...Object.values(RELEASE_LINES)]) assert.ok(COPY.replace(/\{\w+\}/g, "{}").includes(line.replace(/\{\w+\}/g, "{}")), line);
});

it("reports a refused sign-in start to the Board with a fixed code, and a manual start never does", async t => {
  const f = await fixture(t);
  const signIn = [...START, "--from-autostart"];
  const registered = branch => { mkdirSync(f.directory, { recursive: true }); writeFileSync(path.join(f.directory, "autostart.json"), JSON.stringify({ schemaVersion: 1, branch })); };
  const reports = () => f.runnerCalls.filter(call => call.op === "autostart");
  registered("main");
  writeFileSync(path.join(f.root, "draft.txt"), "x");
  assert.equal((await f.run(signIn)).event.code, "dirty");
  assert.deepEqual(reports(), [{ op: "autostart", session: reports()[0]?.session, state: "refused", host: runnerHost(), branch: "main", code: "dirty", project: "owner-repo" }]);
  assert.match(reports()[0].session, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(f.notices().some(notice => notice.kind === "startRefused"));

  registered("release");
  assert.equal((await f.run(signIn)).event.code, "autostart-branch");
  assert.deepEqual(reports().map(call => [call.branch, call.code]), [["main", "dirty"], ["release", "autostart-branch"]]);

  registered("main");
  assert.equal((await f.run(START)).event.code, "dirty");
  assert.equal(reports().length, 2, "a manual start reports nothing");
  unlinkSync(path.join(f.root, "draft.txt"));
  f.setRunner((body, res) => { res.statusCode = 409; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "busy", code: "RUNNER_BUSY", holder: { mode: "resident", host: "OTHER-PC", seenAt: "2026-10-22T00:00:00.000Z" } })); });
  assert.equal((await f.run(signIn)).event.code, "busy");
  assert.equal(reports().length, 2, "a busy project already shows the runner that holds it");
});

it("reports a sign-in start that finds a runner already in this checkout as checkout-in-use", async t => {
  const f = await fixture(t);
  f.setOverview(EMPTY);
  assert.equal((await f.run(START)).event.event, "started");
  writeFileSync(path.join(f.directory, "autostart.json"), JSON.stringify({ schemaVersion: 1, branch: "main" }));
  assert.equal((await f.run([...START, "--from-autostart"])).event.code, "locked");
  assert.deepEqual(f.runnerCalls.filter(call => call.op === "autostart").map(call => [call.state, call.branch, call.code]), [["refused", "main", "checkout-in-use"]]);
});

it("keeps sending a refused sign-in start report while the server is briefly unreachable", async t => {
  const f = await fixture(t);
  mkdirSync(f.directory, { recursive: true });
  writeFileSync(path.join(f.directory, "autostart.json"), JSON.stringify({ schemaVersion: 1, branch: "main" }));
  writeFileSync(path.join(f.root, "draft.txt"), "x");
  let unavailable = 2;
  f.setRunner((body, res) => {
    if (unavailable-- > 0) { res.statusCode = 503; res.end(); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, paused: false }));
  });
  assert.equal((await f.run([...START, "--from-autostart"])).event.code, "dirty");
  const reports = f.runnerCalls.filter(call => call.op === "autostart");
  assert.deepEqual(reports.map(call => [call.state, call.code]), [["refused", "dirty"], ["refused", "dirty"], ["refused", "dirty"]]);
  assert.equal(new Set(reports.map(call => call.session)).size, 1);
  assert.doesNotMatch(readFileSync(path.join(f.directory, "background.log"), "utf8"), /not reported/);
});
