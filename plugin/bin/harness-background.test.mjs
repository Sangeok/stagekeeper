import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { runnerHost } from "../runtime/runner-client.mjs";
import { REASONS, START_LINES } from "./harness-background.mjs";

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

// 가짜 claude. 실행 계획(plan.json)의 첫 항목대로 한 번 움직이고, 받은 인자와 환경을 기록한다.
const FAKE_CLAUDE = `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const count = Number(process.env.GIT_CONFIG_COUNT ?? 0);
appendFileSync(process.env.FAKE_RECORD, JSON.stringify({ args, pid: process.pid, server: process.env.HARNESS_SERVER,
  count: process.env.GIT_CONFIG_COUNT ?? null, key: process.env["GIT_CONFIG_KEY_" + (count - 1)] ?? null,
  value: process.env["GIT_CONFIG_VALUE_" + (count - 1)] ?? null }) + "\\n");
const out = value => process.stdout.write(JSON.stringify(value) + "\\n");
out({ type: "system", subtype: "hook_started" });
const mode = args[args.indexOf("--permission-mode") + 1];
out({ type: "system", subtype: "init", permissionMode: process.env.FAKE_PERMISSION ?? mode });
if (args[1] === "Reply with OK.") setInterval(() => {}, 1000);
else {
  const plan = JSON.parse(readFileSync(process.env.FAKE_PLAN, "utf8"));
  const step = plan.length > 1 ? plan.shift() : plan[0];
  writeFileSync(process.env.FAKE_PLAN, JSON.stringify(plan));
  if (step.touch) writeFileSync(step.touch, "partial\\n");
  if (step.kind === "hang") setInterval(() => {}, 1000);
  else {
    if (step.kind === "success") await fetch(process.env.HARNESS_SERVER + "/test/advance", { method: "POST", body: "{}" });
    out({ type: "result", subtype: step.kind === "success" ? "success" : "error_during_execution", is_error: step.kind !== "success",
      num_turns: 2, terminal_reason: "completed", permission_denials: [] });
    process.exit(step.kind === "success" ? 0 : 1);
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

async function fixture(t, { plan = [{ kind: "success" }], env: extra = {} } = {}) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-background-test-"));
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
  // 실행기가 쓰는 파일(.git 안)과 시험 도구(작업 트리 밖)는 작업 트리를 더럽히지 않는다.
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
    // 상주 프로세스는 detached다 — 시험이 실패해도 남기지 않는다.
    if (existsSync(lockPath)) {
      await run(["--stop"]).catch(() => {});
      await waitFor(() => !existsSync(lockPath), 15000, "runner stop").catch(() => {});
    }
    const pid = status()?.pid;
    if (pid && alive(pid)) { try { process.kill(pid); } catch { /* 이미 끝났다 */ } }
    for (const entry of lines(record)) if (alive(entry.pid)) { try { process.kill(entry.pid); } catch { /* 이미 끝났다 */ } }
    await new Promise(resolve => server.close(resolve));
    for (const dir of [root, tools]) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  return { root, url, git, run, runnerCalls, directory, lockPath, status, record: () => lines(record), notices: () => lines(notices),
    setRunner: handler => { runner = handler; }, setOverview: value => { overview = value; } };
}

const START = ["--start", "--propose", "no", "--interval", "0.2", "--run-limit", "0.2"];

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
  assert.equal(stopping.event.event, "stopping");
  await waitFor(() => !existsSync(f.lockPath), 15000, "the runner to release");
  assert.ok(f.runnerCalls.some(call => call.op === "stop" && call.reason === "owner" && call.session === session));
  assert.equal(f.status().stopReason, "owner");
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
  const f = await fixture(t, { plan: [{ kind: "hang" }, { kind: "success" }] });
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

it("stops as stuck after three failed runs and tells the server", async t => {
  const f = await fixture(t, { plan: [{ kind: "fail" }] });
  const started = await f.run(START);
  await waitFor(() => !existsSync(f.lockPath), 60000, "the stuck stop");
  assert.ok(f.runnerCalls.some(call => call.op === "stop" && call.reason === "stuck" && call.session === started.event.session));
  assert.ok(f.notices().some(notice => notice.kind === "stuck"));
  assert.equal(f.record().filter(entry => entry.args[1] !== "Reply with OK.").length, 3);
});

it("stops without a server stop when another runner takes over", async t => {
  const f = await fixture(t);
  f.setOverview(EMPTY);
  assert.equal((await f.run(START)).event.event, "started");
  f.setRunner((body, res) => { res.statusCode = 409; res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "replaced", code: "RUNNER_REPLACED" })); });
  await waitFor(() => !existsSync(f.lockPath), 15000, "the replaced stop");
  assert.ok(!f.runnerCalls.some(call => call.op === "stop"));
  assert.ok(f.notices().some(notice => notice.kind === "replaced"));
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

it("keeps every refusal and start line in product copy", () => {
  for (const [code, reason] of Object.entries(REASONS)) {
    const sentence = reason.replace(/\{\w+\}/g, "{}");
    assert.ok(COPY.replace(/\{\w+\}/g, "{}").includes(sentence), `${code} is missing from product-copy §15`);
  }
  for (const line of Object.values(START_LINES)) assert.ok(COPY.replace(/\{\w+\}/g, "{}").includes(line.replace(/\{\w+\}/g, "{}")), line);
});
