import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { STUCK_AFTER } from "../lib/watch.mjs";
import { isRunbookVersion } from "../lib/runbook.mjs";
import { atomicWrite as atomicText, safeTarget } from "./file-ownership.mjs";
const REASONS = {
  "invalid-arguments": "Invalid watch arguments. Check the mode, required values, and positive timing limits.",
  "invalid-config": "Watch configuration is invalid. Run /harness:init and start again.",
  "missing-server": "Server URL required: pass --server <url> or set HARNESS_SERVER.",
  "invalid-token": "HARNESS_TOKEN must be a project or user token.",
  "missing-project": "A user token requires harness.json project.slug. Run /harness:init.",
  "identity-mismatch": "This token does not match the configured repository. Stop and reconnect with /harness:init.",
  "binding-changed": "The checkout, server, or configuration changed. Stop and start a new watch.",
  "corrupt-state": "Watch state is unreadable or inconsistent. Stop all related tasks before removing it.",
  "guard-busy": "Watch state is busy. Stop related tasks before recovering an abandoned guard.",
  "poller-active": "A watcher is already running for this session.",
  "protocol-error": "Unexpected MCP response. Update the compatible plugin and server before restarting.",
  "request-failed": "Five consecutive watch requests failed. Resolve the server or connection error before restarting.",
};

const GUARD_LIMIT = 5000;
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const fail = (code, reason) => { throw new WatchFailure(code, reason); };
export class WatchFailure extends Error {
  constructor(code, reason = REASONS[code]) { super(reason); this.code = code; }
}
export class Interrupted extends Error {
  constructor(event) { super(event.event); this.event = event; }
}
export function gitRoot(input) {
  try {
    const git = (...args) => execFileSync("git", ["-C", input, "rev-parse", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (git("--is-bare-repository") !== "false") fail("invalid-config");
    const root = realpathSync(git("--show-toplevel"));
    return { root, directory: path.join(realpathSync(path.resolve(input, git("--git-common-dir"))), "harness") };
  } catch { fail("invalid-config"); }
}

// checkout의 CLAUDE.md가 선언한 런북 판. watch와 background가 pipeline_next에 같은 값을 싣는다.
export function checkoutRunbookVersion(root) {
  const body = readFileSync(path.join(root, "CLAUDE.md"), "utf8");
  const start = "<!-- harness:runbook:start -->";
  const end = "<!-- harness:runbook:end -->";
  const starts = body.split(start).length - 1;
  const ends = body.split(end).length - 1;
  if (starts === 0 && ends === 0) return null;
  if (starts !== 1 || ends !== 1 || body.indexOf(start) >= body.indexOf(end)) fail("invalid-config");
  const managed = body.slice(body.indexOf(start) + start.length, body.indexOf(end));
  const versions = [];
  // Count declaration prefixes too: a damaged quote must not silently become legacy.
  const prefixes = [...managed.matchAll(/This document is runbook version|\brunbook\s*:/g)];
  const declarations = [...managed.matchAll(/This document is runbook version\s+`([^`\r\n]*)`|\brunbook\s*:\s*"([^"\r\n]*)"/g)];
  if (prefixes.length !== declarations.length) fail("invalid-config");
  for (const match of declarations) {
    const value = match[1] ?? match[2];
    if (!isRunbookVersion(value)) fail("invalid-config");
    versions.push(value);
  }
  if (new Set(versions).size > 1) fail("invalid-config");
  return versions[0] ?? null;
}

export function stateFiles(directory) {
  return { policy: path.join(directory, "watch.json"), lock: path.join(directory, "watch.lock.json"), guard: path.join(directory, "watch.guard") };
}
export function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { fail("corrupt-state"); }
}
export function readState(files) {
  const directory = path.dirname(files.lock), common = path.dirname(directory);
  for (const file of [files.policy, files.lock, files.guard]) safeTarget(common, path.relative(common, file));
  if (!existsSync(files.lock) && !existsSync(files.policy)) return null;
  const lock = readJson(files.lock);
  const policy = readJson(files.policy);
  const binding = lock?.binding;
  const state = lock?.state;
  const poller = lock?.poller;
  const validTime = (value) => nonempty(value) && Number.isFinite(Date.parse(value));
  const validHash = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  if (!isObject(lock) || lock.schemaVersion !== 1 || !nonempty(lock.id)
    || !isObject(policy) || policy.schemaVersion !== 1 || policy.session !== lock.id
    || typeof policy.commit !== "boolean" || typeof policy.propose !== "boolean"
    || !isObject(binding) || !nonempty(binding.root) || !nonempty(binding.server)
    || !(binding.project === null || nonempty(binding.project)) || !validHash(binding.configHash) || !validHash(binding.tokenHash)
    || !validTime(lock.startedAt) || !validTime(lock.seenAt) || !isObject(state)
    || !(state.lastSignature === null || nonempty(state.lastSignature))
    || !Number.isInteger(state.repeats) || state.repeats < 0 || typeof state.stuck !== "boolean"
    || (state.lastSignature === null && (state.repeats !== 0 || state.stuck))
    || state.stuck !== (state.repeats >= STUCK_AFTER)
    || !(poller === null || (isObject(poller) && Number.isInteger(poller.pid) && poller.pid > 0 && nonempty(poller.nonce)))
    || (lock.client !== undefined && !["claude", "codex"].includes(lock.client))
    // resident = 창 없는 상주 실행기(harness-background.mjs). 옛 판은 이 값을 손상 상태로 보고 거부한다 — 같은 저장소에서 섞여 돌지 않게.
    || (lock.mode !== undefined && !["watch", "foreground", "resident"].includes(lock.mode))
    || (lock.lifecycle !== undefined && !["active", "stopping"].includes(lock.lifecycle))
    // 서버 lease를 잡았는가(/api/runner). CLI는 매번 새 프로세스라 이 값으로만 안다. 옛 판은 이 키를 읽지 않는다.
    || (lock.runnerLease !== undefined && typeof lock.runnerLease !== "boolean")
    || (lock.children !== undefined && (!Array.isArray(lock.children) || lock.children.some(child => !isObject(child) || !Number.isInteger(child.pid) || child.pid <= 0 || !nonempty(child.nonce))))) fail("corrupt-state");
  return { lock, policy };
}
export function atomicWrite(file, value) { atomicText(file, JSON.stringify(value) + "\n"); }
export function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== "ESRCH"; }
}

export async function withGuard(files, action, expires = Infinity) {
  const directory = path.dirname(files.lock), common = path.dirname(directory);
  safeTarget(common, path.relative(common, files.guard));
  const nonce = randomUUID();
  const limit = Math.min(performance.now() + GUARD_LIMIT, expires);
  const ownerPath = path.join(files.guard, "owner.json");
  for (;;) {
    try { mkdirSync(files.guard); break; }
    catch (error) {
      if (error.code !== "EEXIST") fail("corrupt-state");
      if (performance.now() >= expires) throw new Interrupted({ event: "idle" });
      if (performance.now() >= limit) fail("guard-busy");
      // Abandoned guards are deliberately not stolen, even with --force.
      await delay(Math.min(25, Math.max(1, limit - performance.now())));
    }
  }
  const identity = lstatSync(files.guard, { bigint: true });
  try {
    writeFileSync(ownerPath, JSON.stringify({ pid: process.pid, nonce }), { flag: "wx", mode: 0o600 });
    return await action();
  } finally {
    if (existsSync(ownerPath)) {
      const current = lstatSync(files.guard, { bigint: true });
      const owner = readJson(ownerPath);
      if (!current.isSymbolicLink() && current.ino === identity.ino && current.dev === identity.dev && owner.pid === process.pid && owner.nonce === nonce) { unlinkSync(ownerPath); rmdirSync(files.guard); }
    }
  }
}
export function replaced(session, state) { return { event: "replaced", session, seenAt: state?.lock.seenAt ?? null }; }
export function matchesBinding(a, b) { return Object.keys(a).every((key) => a[key] === b[key]) && Object.keys(a).length === Object.keys(b).length; }
export function requireOwnership(state, session, binding, nonce) {
  if (state === null || state.lock.id !== session) throw new Interrupted(replaced(session, state));
  if (!matchesBinding(state.lock.binding, binding)) fail("binding-changed");
  if (nonce !== undefined && state.lock.poller?.nonce !== nonce) throw new Interrupted(replaced(session, state));
  if (state.lock.lifecycle === "stopping") throw new Interrupted({ event: "stopping", session });
}
export function clearState(files) { unlinkSync(files.lock); unlinkSync(files.policy); }

export function sessionView(state) {
  return { session: state.lock.id, client: state.lock.client ?? "claude", mode: state.lock.mode ?? "watch",
    lifecycle: state.lock.lifecycle ?? "active", host: state.lock.host ?? null,
    policy: { commit: state.policy.commit, propose: state.policy.propose } };
}

export async function startSession(files, binding, options) {
  mkdirSync(path.dirname(files.lock), { recursive: true });
  return withGuard(files, () => {
    const state = readState(files);
    if (state) return { event: "locked", ...sessionView(state) };
    const session = randomUUID(), timestamp = new Date().toISOString();
    const policy = { schemaVersion: 1, session, commit: options.commit, propose: options.propose };
    atomicWrite(files.policy, policy);
    atomicWrite(files.lock, { schemaVersion: 1, id: session, binding, startedAt: timestamp, seenAt: timestamp,
      state: { lastSignature: null, repeats: 0, stuck: false }, poller: null, children: [],
      client: options.client, mode: "foreground", lifecycle: "active", host: options.host ?? null });
    return { event: "started", ...sessionView(readState(files)) };
  });
}

export async function checkSession(files, session, binding) {
  if (!existsSync(path.dirname(files.lock))) return replaced(session, null);
  return withGuard(files, () => {
    const state = readState(files);
    if (state === null || state.lock.id !== session) return replaced(session, state);
    if (!matchesBinding(state.lock.binding, binding)) fail("binding-changed");
    state.lock.seenAt = new Date().toISOString();
    atomicWrite(files.lock, state.lock);
    return { event: "owned", ...sessionView(state) };
  });
}

export async function requestStop(files, session) {
  if (!existsSync(path.dirname(files.lock))) return { event: "stopped", session };
  return withGuard(files, () => {
    const state = readState(files);
    if (state === null) return { event: "stopped", session };
    if (state.lock.id !== session) return replaced(session, state);
    state.lock.lifecycle = "stopping";
    atomicWrite(files.lock, state.lock);
    return { event: "stopping", ...sessionView(state) };
  });
}

export async function releaseSession(files, session) {
  if (!existsSync(path.dirname(files.lock))) return { event: "released", session };
  return withGuard(files, () => {
    const state = readState(files);
    if (state === null) return { event: "released", session };
    if (state.lock.id !== session) return replaced(session, state);
    if (state.lock.lifecycle !== "stopping") return { event: "error", code: "stop-required", session };
    // A dead process is not proof that a pending host task or model turn was settled.
    if (state.lock.poller !== null || (state.lock.children ?? []).length !== 0) return { event: "error", code: "quiescence-required", session };
    clearState(files);
    return { event: "released", session };
  });
}

export async function registerChild(files, session, binding, child) {
  return withGuard(files, () => {
    const state = readState(files);
    requireOwnership(state, session, binding);
    state.lock.children ??= [];
    if (state.lock.children.some(item => item.nonce === child.nonce)) fail("corrupt-state");
    state.lock.children.push(child);
    atomicWrite(files.lock, state.lock);
  });
}

export async function settleChild(files, session, child) {
  return withGuard(files, () => {
    const state = readState(files);
    if (state?.lock.id !== session) return replaced(session, state);
    // The runtime calls this only after both the turn and its owned process have ended.
    state.lock.children = (state.lock.children ?? []).filter(item => item.nonce !== child.nonce || item.pid !== child.pid);
    atomicWrite(files.lock, state.lock);
    return { event: "settled", session };
  });
}
