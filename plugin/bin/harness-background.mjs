#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { RESIDENT_RUNNER_PLAN_GATE } from "../lib/plans/entitlement.mjs";
import { parseBearer } from "../lib/tokens/token.mjs";
import { actionableWork } from "../lib/execution/watch.mjs";
import { backgroundSettings, classifyRun, fileList, fillNotice, INTERVAL_MS, porcelainPaths, pushBlockedEnv, quoteWindowsArgument,
  readStreamLine, ResidentRunUnsettled, RUN_LIMIT_MS, RUN_LOG_KEEP, runArguments, runResident } from "../runtime/background.mjs";
import { atomicWrite, checkoutRunbookVersion, clearState, gitRoot, isAlive, matchesBinding, readState, registerChild, settleChild, stateFiles,
  withGuard } from "../runtime/local-session.mjs";
import { callTool, connectionInput, verifyProject } from "../runtime/mcp-client.mjs";
import { runnerCallWithin, runnerHost } from "../runtime/runner-client.mjs";

const PLUGIN_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SELF = fileURLToPath(import.meta.url);
const REQUEST_TIMEOUT = 20_000;
const EMPTY_STATE = { lastSignature: null, repeats: 0, stuck: false };
const PROBE_LIMIT = 120_000;
const START_WAIT = 20_000;
const BACKGROUND_LOG_MAX = 1024 * 1024;

export const REASONS = {
  "invalid-arguments": "Invalid background arguments. Check the operation and its values.",
  "invalid-config": "Watch configuration is invalid. Run /harness:init and start again.",
  "missing-server": "Server URL required: pass --server <url> or set HARNESS_SERVER.",
  "invalid-token": "HARNESS_TOKEN must be a project or user token.",
  "identity-mismatch": "This token does not match the configured repository. Stop and reconnect with /harness:init.",
  "request-failed": "Five consecutive requests failed. Resolve the server or connection error before starting again.",
  "dirty": "Uncommitted changes: {files}. Commit or stash them before you start the runner.",
  "detached": "This checkout is not on a branch. Switch to the branch the runner should work on.",
  "push-url": "Remote {remote} has its own push URL, which the runner cannot block. Remove it, or start the runner from another clone.",
  "locked": "This checkout already has a watch or runner (started {startedAt}). Stop it first.",
  "busy": "A runner is already running for this project on {host} (last signal {time} UTC). Stop it there, or take it over.",
  "plan": RESIDENT_RUNNER_PLAN_GATE,
  "no-route": "This Stagekeeper server does not take runners yet. Use /harness:watch in a Claude Code session.",
  "no-claude": "Claude Code (claude.exe) was not found on PATH. Install the native Claude Code, then start again.",
  "claude-failed": "Claude Code did not start. Run claude once in a terminal to check the sign-in, then start again.",
  "runner-exited": "The runner exited before it started work. Check {log}.",
  "not-running": "No background runner is running in this checkout.",
  "autostart-branch": "Sign-in start was set up on {branch}, but this checkout is on {current}. Switch back, or turn sign-in start off and on again.",
  "autostart-missing": "Sign-in start is not set up for this checkout.",
  "autostart-windows": "Sign-in start is available on Windows only.",
  "autostart-token": "Sign-in start needs a user token (hu_…) saved in your user environment variables. Save HARNESS_TOKEN there first.",
  "autostart-server": "Sign-in start needs HARNESS_SERVER saved in your user environment variables, or pass --server.",
  "autostart-failed": "Windows refused the sign-in task. Nothing was changed.",
  "corrupt-state": "Watch state is unreadable or inconsistent. Stop all related tasks before removing it.",
  "guard-busy": "Watch state is busy. Stop related tasks before recovering an abandoned guard.",
};
export const START_LINES = {
  started: "Background runner started on {host} for {branch}.",
  logs: "Run logs: {logs}",
  stop: "Stop it with /harness:background stop.",
  edit: "The runner works in this checkout on {branch}. Pause it on the Stagekeeper Board before you edit files here.",
  allowlist: "Auto mode is not available here, so the runner runs only the commands on its allow list.",
};

class Refusal extends Error {
  constructor(code, values = {}) {
    super(REASONS[code].replace(/\{(\w+)\}/g, (match, key) => (Object.hasOwn(values, key) ? String(values[key]) : match)));
    this.code = code;
  }
}
const refuse = (code, values) => { throw new Refusal(code, values); };
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const hash = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();

function parseArguments(argv) {
  const ops = new Set(["preflight", "start", "run", "stop", "status", "autostart-on", "autostart-off"]);
  const values = new Set(["root", "server", "propose", "session", "interval", "run-limit"]);
  const flags = new Set([...ops, "takeover", "from-autostart"]);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].startsWith("--") ? argv[i].slice(2) : "";
    if (Object.hasOwn(options, name) || (!values.has(name) && !flags.has(name))) refuse("invalid-arguments");
    if (flags.has(name)) options[name] = true;
    else {
      const value = argv[++i];
      if (!nonempty(value) || value.startsWith("--")) refuse("invalid-arguments");
      options[name] = value;
    }
  }
  const selected = [...ops].filter(op => options[op]);
  if (selected.length !== 1) refuse("invalid-arguments");
  const op = selected[0];
  const needsPropose = op === "start" || op === "autostart-on";
  if (needsPropose !== ["yes", "no"].includes(options.propose) || (!needsPropose && options.propose)) refuse("invalid-arguments");
  if ((op === "run") !== Boolean(options.session)) refuse("invalid-arguments");
  if (options.takeover && op !== "start") refuse("invalid-arguments");
  if (options["from-autostart"] && op !== "start") refuse("invalid-arguments");
  const timing = (name, fallback, unit) => {
    if (options[name] === undefined) return fallback;
    const value = Number(options[name]);
    if (!Number.isFinite(value) || value <= 0 || !["start", "run"].includes(op)) refuse("invalid-arguments");
    return value * unit;
  };
  return { ...options, op, root: options.root ?? ".", interval: timing("interval", INTERVAL_MS, 1000), runLimit: timing("run-limit", RUN_LIMIT_MS, 60_000) };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
}

function headBranch(root) {
  const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  return head === "HEAD" ? null : head;
}

function treeState(root) {
  const branch = headBranch(root);
  const current = branch ?? git(root, ["rev-parse", "--short=7", "HEAD"]).trim();
  const dirty = porcelainPaths(git(root, ["--no-optional-locks", "status", "--porcelain", "-z"]));
  return { branch, current, dirty };
}

function pushUrlRemotes(root) {
  let output;
  try { output = git(root, ["config", "--get-regexp", "^remote\\..*\\.pushurl$"]); }
  catch (error) { if (error.status === 1) return []; throw error; }
  return [...new Set(output.split(/\r?\n/).filter(Boolean).map(line => line.split(" ")[0].replace(/^remote\./, "").replace(/\.pushurl$/, "")))];
}

function claudeCommand() {
  const fake = process.env.STAGEKEEPER_TEST_CLAUDE;
  if (fake) return { command: process.execPath, prefix: [fake] };
  if (process.platform !== "win32") return { command: "claude", prefix: [] };
  for (const directory of (process.env.PATH ?? "").split(";").filter(Boolean)) {
    const candidate = path.join(directory.replace(/^"|"$/g, ""), "claude.exe");
    if (existsSync(candidate)) return { command: candidate, prefix: [] };
  }
  refuse("no-claude");
}

const powershell = () => path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

function spawnClaude({ root, args, env, claude, requestFile, onLine, log }) {
  let child;
  if (process.platform === "win32") {
    writeFileSync(requestFile, JSON.stringify({ resident: process.pid, cwd: root, executable: claude.command,
      arguments: [...claude.prefix, ...args].map(quoteWindowsArgument).join(" ") }));
    child = spawn(powershell(), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
      path.join(PLUGIN_ROOT, "runtime", "windows", "job-launch.ps1"), "-RequestPath", requestFile],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  } else {
    child = spawn(claude.command, [...claude.prefix, ...args], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  }
  let pending = "";
  child.stdout.on("data", chunk => {
    log?.write(chunk);
    pending += chunk.toString("utf8");
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) if (line.trim()) onLine(line);
  });
  const stderr = [];
  child.stderr.on("data", chunk => { if (stderr.length < 64) stderr.push(chunk); });
  const done = new Promise(resolve => {
    child.on("error", () => resolve({ exitCode: -1, stderr: Buffer.concat(stderr).toString("utf8") }));
    child.on("close", code => {
      if (pending.trim()) onLine(pending);
      resolve({ exitCode: code ?? -1, stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
  const end = () => {
    try {
      if (process.platform === "win32") child.kill();
      else process.kill(-child.pid, "SIGKILL");
    } catch {   }
  };
  return { child, done, end };
}

async function probePermission(root, settings, env, directory) {
  const claude = claudeCommand();
  const run = { permissionMode: null };
  let started;
  const probe = spawnClaude({ root, env, claude, requestFile: path.join(directory, "probe.launch.json"),
    args: ["-p", "Reply with OK.", "--permission-mode", "auto", "--settings", settings,
      "--disallowedTools", "Bash(git push:*)", "PowerShell(git push*)", "--output-format", "stream-json", "--verbose"],
    onLine: line => { readStreamLine(line, run); if (run.permissionMode) started?.end(); } });
  started = probe;
  if (run.permissionMode) probe.end();
  const timer = setTimeout(() => probe.end(), PROBE_LIMIT);
  await probe.done;
  clearTimeout(timer);
  try { unlinkSync(path.join(directory, "probe.launch.json")); } catch {   }
  if (!run.permissionMode) refuse("claude-failed");
  return run.permissionMode === "auto" ? "auto" : "allowlist";
}

function notify(directory, notice) {
  backgroundLog(directory, `notice ${notice.kind}: ${notice.title} — ${notice.body}`);
  const file = process.env.STAGEKEEPER_TEST_NOTIFY_FILE;
  if (file) { appendFileSync(file, JSON.stringify(notice) + "\n"); return Promise.resolve(); }
  if (process.platform !== "win32") return Promise.resolve();
  const child = spawn(powershell(), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    path.join(PLUGIN_ROOT, "runtime", "windows", "notify.ps1"), "-Title", notice.title, "-Body", notice.body],
  { stdio: "ignore", windowsHide: true });
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 15_000);
    const settle = failed => { clearTimeout(timer); if (failed) backgroundLog(directory, "notice failed"); resolve(); };
    child.on("error", () => settle(true));
    child.on("close", code => settle(code !== 0));
  });
}

function backgroundLog(directory, line) {
  try {
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "background.log");
    if (existsSync(file) && statSync(file).size > BACKGROUND_LOG_MAX) renameSync(file, file + ".1");
    appendFileSync(file, `${now()} ${line}\n`);
  } catch {   }
}

const statusFile = directory => path.join(directory, "background.json");
const autostartFile = directory => path.join(directory, "autostart.json");
const runsDirectory = directory => path.join(directory, "runs");
const settingsFile = directory => path.join(directory, "background-settings.json");
function readOptional(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function pruneRuns(runs) {
  const names = readdirSync(runs).filter(name => name.endsWith(".jsonl")).sort();
  for (const name of names.slice(0, Math.max(0, names.length - RUN_LOG_KEEP))) {
    const id = name.slice(0, -".jsonl".length);
    for (const suffix of [".jsonl", ".meta.json", ".stderr.txt", ".launch.json"]) {
      try { unlinkSync(path.join(runs, id + suffix)); } catch {   }
    }
  }
}

function connection(root, options) {
  const token = process.env.HARNESS_TOKEN;
  if (!parseBearer(`Bearer ${token}`, "agent") && !parseBearer(`Bearer ${token}`, "user")) refuse("invalid-token");
  if (!nonempty(options.server ?? process.env.HARNESS_SERVER)) refuse("missing-server");
  let input;
  try { input = connectionInput(root, { client: "claude", server: options.server }); input.runbook = checkoutRunbookVersion(root); }
  catch { refuse("invalid-config"); }
  return input;
}

function staleResident(state) {
  return state.lock.mode === "resident" && state.lock.unsettled !== true && !(state.lock.poller && isAlive(state.lock.poller.pid))
    && (state.lock.children ?? []).every(child => !isAlive(child.pid));
}

async function startChecks(location, files, options) {
  const input = connection(location.root, options);
  const tree = treeState(location.root);
  if (options["from-autostart"]) {
    const autostart = readOptional(autostartFile(files.directory));
    if (!autostart) refuse("autostart-missing");
    if (tree.branch !== autostart.branch) refuse("autostart-branch", { branch: autostart.branch, current: tree.current });
  }
  if (!tree.branch) refuse("detached");
  if (tree.dirty.length > 0) refuse("dirty", { files: fileList(tree.dirty) });
  const remotes = pushUrlRemotes(location.root);
  if (remotes.length > 0) refuse("push-url", { remote: remotes[0] });
  const state = readState(files);
  if (state && !staleResident(state)) refuse("locked", { startedAt: state.lock.startedAt });
  claudeCommand();
  let identity;
  for (let failures = 0;;) {
    try { identity = await verifyProject(input); break; }
    catch (error) {
      if (/identity mismatch/i.test(error?.message ?? "")) refuse("identity-mismatch");
      if (++failures >= 5) refuse("request-failed");
      await delay(1000 * failures);
    }
  }
  return { input, tree, identity, stale: state !== null };
}

const runnerTarget = input => ({ server: input.server, token: input.token, project: input.config.project.slug });

async function retryingRunnerCall(target, payload) {
  let result;
  for (let failures = 0;;) {
    result = await runnerCallWithin(target, payload, REQUEST_TIMEOUT);
    if (result.kind !== "transient" || ++failures >= 5) break;
    await delay(Math.min(Math.max(1000 * failures, result.retryAfter), 10_000));
  }
  return result;
}

async function start(location, files, options) {
  const { input, tree, stale } = await startChecks(location, files, options);
  const directory = files.directory;
  mkdirSync(runsDirectory(directory), { recursive: true });
  const settings = settingsFile(directory);
  writeFileSync(settings, JSON.stringify(backgroundSettings(input.config), null, 2) + "\n");
  const env = pushBlockedEnv({ ...process.env, HARNESS_SERVER: input.server });
  const permission = await probePermission(location.root, settings, env, directory);
  const session = randomUUID();
  const host = runnerHost();
  await withGuard(files, () => {
    const state = readState(files);
    if (state && !(stale && staleResident(state))) refuse("locked", { startedAt: state.lock.startedAt });
    if (state) clearState(files);
    atomicWrite(files.policy, { schemaVersion: 1, session, commit: true, propose: options.propose === "yes" });
    atomicWrite(files.lock, { schemaVersion: 1, id: session, binding: input.binding, startedAt: now(), seenAt: now(), state: EMPTY_STATE,
      poller: null, client: "claude", mode: "resident", lifecycle: "active", children: [], host, runnerLease: true });
  });
  const autostart = existsSync(autostartFile(directory));
  const result = await retryingRunnerCall(runnerTarget(input), { op: "start", session, mode: "resident", host, branch: tree.branch, permission, autostart,
    ...(options.takeover ? { takeover: true } : {}) });
  if (result.kind !== "ok") {
    await withGuard(files, () => { if (readState(files)?.lock.id === session) clearState(files); });
    if (result.kind === "busy") refuse("busy", { host: result.holder.host, time: result.holder.seenAt });
    if (result.kind === "plan") refuse("plan");
    if (result.kind === "missing") refuse("no-route");
    if (result.kind === "transient") refuse("request-failed");
    refuse("request-failed");
  }
  atomicWrite(statusFile(directory), { schemaVersion: 1, session, host, branch: tree.branch, permission, propose: options.propose === "yes",
    autostart, state: "starting", startedAt: now(), updatedAt: now() });
  const out = openSync(path.join(directory, "background.log"), "a");
  const resident = spawn(process.execPath, [SELF, "--run", "--root", location.root, "--session", session,
    ...(options.server ? ["--server", options.server] : []),
    ...(options.interval !== INTERVAL_MS ? ["--interval", String(options.interval / 1000)] : []),
    ...(options.runLimit !== RUN_LIMIT_MS ? ["--run-limit", String(options.runLimit / 60_000)] : [])],
  { detached: true, stdio: ["ignore", out, out], windowsHide: true, env: process.env });
  resident.unref();
  const expires = performance.now() + START_WAIT;
  const exited = async () => {
    await withGuard(files, () => {
      const state = readState(files);
      if (state?.lock.id === session && state.lock.poller === null) clearState(files);
    }).catch(() => {});
    await runnerCallWithin({ server: input.server, token: input.token, project: input.config.project.slug },
      { op: "stop", session, reason: "error" }, REQUEST_TIMEOUT);
    refuse("runner-exited", { log: path.join(directory, "background.log") });
  };
  while (performance.now() < expires) {
    const state = readState(files);
    if (state?.lock.id !== session) await exited();
    if (state.lock.poller) {
      const lines = [START_LINES.started, START_LINES.logs, START_LINES.stop, START_LINES.edit, ...(permission === "allowlist" ? [START_LINES.allowlist] : [])]
        .map(line => line.replaceAll("{host}", host).replaceAll("{branch}", tree.branch).replaceAll("{logs}", runsDirectory(directory)));
      for (const line of lines) process.stdout.write(line + "\n");
      return { event: "started", session, host, branch: tree.branch, permission };
    }
    await delay(200);
  }
  await exited();
}

async function stop(files) {
  if (!existsSync(files.directory)) return { event: "error", code: "not-running", reason: REASONS["not-running"] };
  let stopped = null;
  const event = await withGuard(files, () => {
    const state = readState(files);
    if (state === null || state.lock.mode !== "resident") return { event: "error", code: "not-running", reason: REASONS["not-running"] };
    if (staleResident(state)) {
      stopped = state.lock;
      clearState(files);
      return { event: "stopped", session: state.lock.id };
    }
    state.lock.lifecycle = "stopping";
    atomicWrite(files.lock, state.lock);
    return { event: "stopping", session: state.lock.id };
  });
  if (stopped && nonempty(process.env.HARNESS_TOKEN)) {
    await runnerCallWithin({ server: stopped.binding.server, token: process.env.HARNESS_TOKEN, project: stopped.binding.project },
      { op: "stop", session: stopped.id, reason: "owner" }, REQUEST_TIMEOUT);
  }
  return event;
}

function status(files) {
  const directory = files.directory;
  let state = null;
  try { state = existsSync(directory) ? readState(files) : null; } catch { state = null; }
  const saved = readOptional(statusFile(directory));
  const autostart = readOptional(autostartFile(directory));
  const running = state?.lock.mode === "resident" && state.lock.poller !== null && isAlive(state.lock.poller.pid);
  return { event: "status", running, session: state?.lock.mode === "resident" ? state.lock.id : null,
    lifecycle: state?.lock.mode === "resident" ? state.lock.lifecycle : null,
    otherSession: state && state.lock.mode !== "resident" ? state.lock.mode ?? "watch" : null,
    host: saved?.host ?? null, branch: saved?.branch ?? null, permission: saved?.permission ?? null, state: saved?.state ?? null,
    waitReason: saved?.waitReason ?? null, waitFiles: saved?.waitFiles ?? [], interrupted: saved?.interrupted ?? null,
    lastResult: saved?.lastResult ?? null, lastLog: saved?.lastLog ?? null, stopReason: saved?.stopReason ?? null,
    logs: runsDirectory(directory),
    autostart: autostart ? { registered: true, branch: autostart.branch, propose: autostart.propose, pluginMatches: autostart.pluginRoot === PLUGIN_ROOT } : { registered: false } };
}

function userEnvironment(name) {
  try {
    const output = execFileSync("reg", ["query", "HKCU\\Environment", "/v", name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    const match = output.match(new RegExp(`^\\s*${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$`, "mi"));
    return match ? match[1].trim() : null;
  } catch { return null; }
}

const SIGNIN_CODES = { dirty: "dirty", "autostart-branch": "autostart-branch", detached: "detached", "push-url": "push-url", locked: "checkout-in-use" };
const SIGNIN_UNREPORTED = new Set(["invalid-arguments", "invalid-config", "missing-server", "invalid-token", "identity-mismatch", "busy", "plan",
  "no-route", "autostart-missing"]);

async function reportAutostart(root, options, payload) {
  let input;
  try { input = connection(root, options); } catch { return false; }
  const result = await retryingRunnerCall(runnerTarget(input), { op: "autostart", session: randomUUID(), host: runnerHost(), ...payload });
  return result.kind === "ok";
}

function autostartTask(root) { return `Stagekeeper runner ${hash(root).slice(0, 8)}`; }

function autostartScript(args) {
  const output = execFileSync(powershell(), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    path.join(PLUGIN_ROOT, "runtime", "windows", "autostart.ps1"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  return JSON.parse(output.trim().split(/\r?\n/).pop());
}

async function autostartOn(location, files, options) {
  if (process.platform !== "win32") refuse("autostart-windows");
  if (!parseBearer(`Bearer ${userEnvironment("HARNESS_TOKEN")}`, "user")) refuse("autostart-token");
  if (!options.server && !nonempty(userEnvironment("HARNESS_SERVER"))) refuse("autostart-server");
  const tree = treeState(location.root);
  if (!tree.branch) refuse("detached");
  const conhost = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "conhost.exe");
  const argument = ["--headless", powershell(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
    path.join(PLUGIN_ROOT, "bin", "harness.ps1"), "background", "--start", "--from-autostart", "--root", location.root,
    "--propose", options.propose, ...(options.server ? ["--server", options.server] : [])].map(quoteWindowsArgument).join(" ");
  const task = autostartTask(location.root);
  let result;
  try { result = autostartScript(["-Action", "register", "-TaskName", task, "-Execute", conhost, "-Argument", argument]); }
  catch { refuse("autostart-failed"); }
  if (result?.ok !== true) refuse("autostart-failed");
  mkdirSync(files.directory, { recursive: true });
  atomicWrite(autostartFile(files.directory), { schemaVersion: 1, task, pluginRoot: PLUGIN_ROOT, root: location.root, branch: tree.branch,
    propose: options.propose, server: options.server ?? null, registeredAt: now() });
  if (!await reportAutostart(location.root, options, { state: "on", branch: tree.branch })) backgroundLog(files.directory, "sign-in start on: not reported");
  return { event: "autostart", registered: true, branch: tree.branch };
}

async function autostartOff(location, files, options) {
  if (process.platform !== "win32") refuse("autostart-windows");
  const registered = readOptional(autostartFile(files.directory));
  let result;
  try { result = autostartScript(["-Action", "unregister", "-TaskName", autostartTask(location.root)]); }
  catch { refuse("autostart-failed"); }
  if (result?.ok !== true) refuse("autostart-failed");
  try { unlinkSync(autostartFile(files.directory)); } catch {   }
  if (!await reportAutostart(location.root, { server: options.server ?? registered?.server ?? undefined }, { state: "off" })) {
    backgroundLog(files.directory, "sign-in start off: not reported");
  }
  return { event: "autostart", registered: false };
}

async function resident(location, files, options) {
  const directory = files.directory;
  const session = options.session;
  const log = line => backgroundLog(directory, line);
  const saved = readOptional(statusFile(directory));
  if (saved?.session !== session) return { event: "error", code: "corrupt-state", reason: REASONS["corrupt-state"] };
  const input = connection(location.root, options);
  const target = { server: input.server, token: input.token, project: input.config.project.slug };
  const nonce = randomUUID();
  await withGuard(files, () => {
    const state = readState(files);
    if (state?.lock.id !== session || state.lock.mode !== "resident" || !matchesBinding(state.lock.binding, input.binding)) refuse("corrupt-state");
    state.lock.poller = { pid: process.pid, nonce };
    state.lock.seenAt = now();
    atomicWrite(files.lock, state.lock);
  });
  const env = pushBlockedEnv({ ...process.env, HARNESS_SERVER: input.server });
  const settings = settingsFile(directory);
  const claude = claudeCommand();
  const status = { ...saved, pid: process.pid };
  const save = values => { Object.assign(status, values, { updatedAt: now() }); atomicWrite(statusFile(directory), status); };
  save({ state: "idle" });
  const lifecycle = () => {
    try {
      const state = readState(files);
      if (state?.lock.id !== session) return "gone";
      return state.lock.lifecycle === "stopping" ? "stopping" : "active";
    } catch { return "gone"; }
  };
  const beat = async payload => {
    try {
      await withGuard(files, () => {
        const state = readState(files);
        if (state?.lock.id === session) { state.lock.seenAt = now(); atomicWrite(files.lock, state.lock); }
      });
    } catch {   }
    return runnerCallWithin(target, { op: "beat", session, ...payload }, REQUEST_TIMEOUT);
  };
  const startRun = () => {
    const id = new Date().toISOString().replace(/[-:.]/g, "");
    const runs = runsDirectory(directory);
    mkdirSync(runs, { recursive: true });
    const stream = createWriteStream(path.join(runs, `${id}.jsonl`));
    const run = { permissionMode: null, result: null };
    const startedAt = now();
    const child = spawnClaude({ root: location.root, env, claude, requestFile: path.join(runs, `${id}.launch.json`), log: stream,
      args: runArguments({ session, permission: saved.permission, settings }), onLine: line => readStreamLine(line, run) });
    const owned = { pid: child.child.pid, nonce: randomUUID() };
    let endedFor = null;
    const end = reason => { if (endedFor) return; endedFor = reason; child.end(); };
    const registered = Number.isInteger(owned.pid)
      ? registerChild(files, session, input.binding, owned).catch(() => end("stop"))
      : Promise.resolve();
    const done = (async () => {
      const exit = await child.done;
      await registered;
      await new Promise(resolve => stream.end(resolve));
      await settleChild(files, session, owned);
      try { unlinkSync(path.join(runs, `${id}.launch.json`)); } catch {   }
      if (exit.stderr.trim()) writeFileSync(path.join(runs, `${id}.stderr.txt`), exit.stderr);
      const meta = { startedAt, endedAt: now(), exitCode: exit.exitCode, permissionMode: run.permissionMode, result: run.result, endedFor };
      meta.line = classifyRun({ ...meta }).line;
      writeFileSync(path.join(runs, `${id}.meta.json`), JSON.stringify(meta, null, 2) + "\n");
      pruneRuns(runs);
      log(`run ${id}: ${meta.line}`);
      return { exitCode: exit.exitCode, result: run.result, permissionMode: run.permissionMode, endedFor, log: `${id}.jsonl` };
    })();
    log(`run ${id} started`);
    return { done, end };
  };
  const deps = {
    lifecycle, beat, log, save, now: () => performance.now(),
    sleep: (ms, signal) => delay(ms, undefined, { signal }).catch(() => {}),
    notify: notice => notify(directory, notice),
    overview: async () => actionableWork(await callTool(input, "pipeline_next"), { commit: true, propose: saved.propose === true }),
    tree: () => treeState(location.root),
    branch: () => headBranch(location.root),
    execution: { start: startRun, classify: classifyRun, stopMode: "drain" },
  };
  let reason;
  try {
    log(`runner ${session} started on ${saved.branch} (${saved.permission})`);
    reason = await runResident({ branch: saved.branch, interval: options.interval, runLimit: options.runLimit }, deps);
  } catch (error) {
    log(`runner failed: ${error?.message ?? error}`);
    if (error instanceof ResidentRunUnsettled) {
      await withGuard(files, () => {
        const state = readState(files);
        if (state?.lock.id !== session) return;
        state.lock.lifecycle = "stopping";
        state.lock.unsettled = true;
        atomicWrite(files.lock, state.lock);
        save({ state: "stopping", stopReason: "unsettled" });
      }).catch(() => {});
      return { event: "stopping", session, code: error.code };
    }
    reason = "error";
  }
  return finish(files, { session, target, reason, save, log, directory });
}

const NOTICE_FOR = { stuck: "stuck", error: "error", plan: "plan", replaced: "replaced", missing: "missing" };

async function finish(files, { session, target, reason, save, log, directory }) {
  log(`runner ${session} stopping: ${reason}`);
  if (["owner", "stuck", "error", "plan"].includes(reason)) {
    await runnerCallWithin(target, { op: "stop", session, reason }, REQUEST_TIMEOUT);
  }
  await withGuard(files, () => { if (readState(files)?.lock.id === session) clearState(files); }).catch(() => {});
  save({ state: "stopped", stopReason: reason });
  if (NOTICE_FOR[reason]) await notify(directory, fillNotice(NOTICE_FOR[reason]));
  return { event: "stopped", session, reason };
}

async function main() {
  let options;
  let event;
  let directory = null;
  let root = null;
  try {
    options = parseArguments(process.argv.slice(2));
    const location = gitRoot(options.root);
    const files = { ...stateFiles(location.directory), directory: location.directory };
    directory = location.directory;
    root = location.root;
    if (options.op === "preflight") {
      const { tree } = await startChecks(location, files, options);
      event = { event: "ready", host: runnerHost(), branch: tree.branch, autostart: existsSync(autostartFile(directory)) };
    } else if (options.op === "start") event = await start(location, files, options);
    else if (options.op === "run") event = await resident(location, files, options);
    else if (options.op === "stop") event = await stop(files);
    else if (options.op === "status") event = status(files);
    else if (options.op === "autostart-on") event = await autostartOn(location, files, options);
    else event = await autostartOff(location, files, options);
  } catch (error) {
    const code = error instanceof Refusal ? error.code : error?.code && REASONS[error.code] ? error.code : "corrupt-state";
    const reason = error instanceof Refusal ? error.message : REASONS[code];
    event = { event: "error", code, reason };
    if (options?.["from-autostart"] && directory) {
      await notify(directory, fillNotice("startRefused", { reason }));
      const registered = readOptional(autostartFile(directory));
      if (root && registered?.branch && !SIGNIN_UNREPORTED.has(code)) {
        const payload = { state: "refused", branch: registered.branch, code: Object.hasOwn(SIGNIN_CODES, code) ? SIGNIN_CODES[code] : "other" };
        if (!await reportAutostart(root, options, payload)) backgroundLog(directory, `sign-in start refusal not reported: ${code}`);
      }
    }
    if (options?.op === "start" && directory) backgroundLog(directory, `start refused: ${code}`);
  }
  if (event.event === "error" && event.reason) process.stdout.write(event.reason + "\n");
  process.stdout.write(JSON.stringify(event) + "\n");
  process.exitCode = event.event === "error" ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) void main();
