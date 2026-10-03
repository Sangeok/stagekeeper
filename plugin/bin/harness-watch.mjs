#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseHarnessConfig } from "../lib/config.mjs";
import { parseBearer } from "../lib/token.mjs";
import { isRunbookVersion } from "../lib/runbook.mjs";
import { actionableWork, hasWork, nextWatchState, parseToolResponse, workSignature } from "../lib/watch.mjs";

import { WatchFailure, Interrupted, gitRoot, stateFiles, readState, atomicWrite, isAlive, withGuard, replaced, matchesBinding, requireOwnership, clearState } from "../runtime/local-session.mjs";

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
const BODY_LIMIT = 1024 * 1024;
const EMPTY_STATE = { lastSignature: null, repeats: 0, stuck: false };
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();

class TransientFailure extends Error {
  constructor(retryAfter = 0) { super("Transient transport failure."); this.retryAfter = retryAfter; }
}
const fail = (code, reason) => { throw new WatchFailure(code, reason); };

function parseArguments(argv) {
  const values = new Set(["root", "server", "commit", "propose", "session", "interval", "deadline", "request-timeout"]);
  const flags = new Set(["start", "force", "check", "stop", "managed"]);
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].startsWith("--") ? argv[i].slice(2) : "";
    if (Object.hasOwn(options, name) || (!values.has(name) && !flags.has(name))) fail("invalid-arguments");
    if (flags.has(name)) options[name] = true;
    else {
      const value = argv[++i];
      if (!nonempty(value) || value.startsWith("--")) fail("invalid-arguments");
      options[name] = value;
    }
  }
  if (Number(Boolean(options.start)) + Number(Boolean(options.check)) + Number(Boolean(options.stop)) > 1) fail("invalid-arguments");
  const mode = options.start ? "start" : options.stop ? "stop" : options.check ? "check" : "poll";
  if (mode === "start") {
    if (options.session || !["yes", "no"].includes(options.commit) || !["yes", "no"].includes(options.propose)) fail("invalid-arguments");
  } else if (!options.session || options.force || options.managed || options.commit || options.propose) fail("invalid-arguments");
  if (mode !== "poll" && ["interval", "deadline", "request-timeout"].some((key) => options[key] !== undefined)) fail("invalid-arguments");
  const timing = (name, fallback, max = Infinity) => {
    const value = options[name] === undefined ? fallback : Number(options[name]);
    if (!Number.isFinite(value) || value <= 0 || value > max) fail("invalid-arguments");
    return value;
  };
  return { ...options, mode, root: options.root ?? ".", interval: timing("interval", 60) * 1000,
    deadline: timing("deadline", 110, 110) * 60000, requestTimeout: timing("request-timeout", 20, 20) * 1000 };
}

function serverUrl(input) {
  if (!nonempty(input)) fail("missing-server");
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) fail("invalid-config");
    url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api\/mcp(?:\/owner)?$/, "");
    return url.href.replace(/\/+$/, "");
  } catch { fail("invalid-config"); }
}

function checkoutVersion(root) {
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

function localInput(location, options) {
  let configText, config, runbook;
  try {
    configText = readFileSync(path.join(location.root, "harness.json"), "utf8");
    config = parseHarnessConfig(configText);
    runbook = checkoutVersion(location.root);
  } catch { fail("invalid-config"); }
  const token = process.env.HARNESS_TOKEN;
  if (!parseBearer(`Bearer ${token}`, "agent") && !parseBearer(`Bearer ${token}`, "user")) fail("invalid-token");
  if (token.startsWith("hu_") && !config.project.slug) fail("missing-project");
  const server = serverUrl(options.server ?? process.env.HARNESS_SERVER);
  const binding = { root: location.root, server, project: config.project.slug,
    configHash: hash(configText), tokenHash: hash(token) };
  return { config, runbook, token, server, binding };
}

function cleanReason(value, token, fallback) {
  if (typeof value !== "string" || !value.trim() || value.length > 1000 || /[<>\x00-\x1f]|\bBearer\b|\b(?:hs_|hu_|ho_)[A-Za-z0-9_-]+|Authorization|\bat\s+\S+\s*\(/i.test(value)
    || (token && value.includes(token))) return fallback;
  return value;
}

async function readBody(response, signal) {
  if (!response.body) fail("protocol-error");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) fail("protocol-error");
      chunks.push(value);
    }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { fail("protocol-error"); }
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function retryDelay(header) {
  if (header === null) return 0;
  if (/^\d+(?:\.\d+)?$/.test(header)) {
    const value = Number(header) * 1000;
    return Number.isFinite(value) ? value : 0;
  }
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}
async function callTool(input, name, signal) {
  const id = randomUUID();
  const args = { ...(input.config.project.slug ? { project: input.config.project.slug } : {}),
    ...(name === "pipeline_next" && input.runbook ? { runbook: input.runbook } : {}) };
  let response;
  try {
    response = await fetch(`${input.server}/api/mcp`, { method: "POST", redirect: "manual", signal,
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${input.token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) });
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new TransientFailure();
  }
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    await response.body?.cancel().catch(() => {});
    throw new TransientFailure(response.status === 429 ? retryDelay(response.headers.get("retry-after")) : 0);
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    fail("protocol-error");
  }
  let body;
  try { body = await readBody(response, signal); }
  catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof WatchFailure) throw error;
    throw new TransientFailure();
  }
  if (response.status >= 400) {
    const fallback = response.status === 401 || response.status === 403
      ? `The server refused HARNESS_TOKEN (${response.status}).`
      : `The server refused the watch request (HTTP ${response.status}).`;
    let reason;
    try { reason = JSON.parse(body).error; } catch { reason = null; }
    fail("access-refused", cleanReason(reason, input.token, fallback));
  }
  if (!response.ok) fail("protocol-error");
  const parsed = parseToolResponse(response.headers.get("content-type"), body, id);
  if (!parsed.ok) fail(parsed.error.code, parsed.error.code === "access-refused"
    ? cleanReason(parsed.error.reason, input.token, "The server refused the watch request.") : undefined);
  return parsed.value;
}

async function limitedRequest(input, name, controller, expires, timeout) {
  const request = new AbortController();
  const forward = () => request.abort(controller.signal.reason);
  controller.signal.addEventListener("abort", forward, { once: true });
  if (controller.signal.aborted) forward();
  const remaining = expires - performance.now();
  if (remaining <= 0) {
    controller.signal.removeEventListener("abort", forward);
    throw new Interrupted({ event: "idle" });
  }
  const timer = setTimeout(() => request.abort(remaining <= timeout
    ? new Interrupted({ event: "idle" }) : new TransientFailure()), Math.min(remaining, timeout));
  try { return await callTool(input, name, request.signal); }
  catch (error) { if (request.signal.aborted) throw request.signal.reason; throw error; }
  finally { clearTimeout(timer); controller.signal.removeEventListener("abort", forward); }
}

function verifyIdentity(value, config) {
  const identity = value;
  if (!isObject(identity) || !nonempty(identity.owner) || !nonempty(identity.repo)
    || !nonempty(identity.slug) || typeof value.available !== "boolean") fail("protocol-error");
  if (identity.owner.toLowerCase() !== config.project.owner.toLowerCase()
    || identity.repo.toLowerCase() !== config.project.repo.toLowerCase()
    || (config.project.slug !== null && identity.slug !== config.project.slug)) fail("identity-mismatch");
  if (!value.available) fail("access-refused", cleanReason(value.reason, process.env.HARNESS_TOKEN, "This project is not available for use."));
}

async function startWatch(files, input, options) {
  // No watch session exists yet: startup can fail, but cannot emit a sessionless idle.
  const expires = Infinity;
  const controller = new AbortController();
  let identity;
  for (let failures = 0;;) {
    try { identity = await limitedRequest(input, "project_get", controller, expires, options.requestTimeout); break; }
    catch (error) {
      if (!(error instanceof TransientFailure)) throw error;
      if (++failures >= 5) fail("request-failed");
      await delay(Math.min(Math.max(options.interval, error.retryAfter), options.deadline));
    }
  }
  verifyIdentity(identity, input.config);
  mkdirSync(path.dirname(files.lock), { recursive: true });
  return withGuard(files, () => {
    if (!matchesBinding(input.binding, localInput({ root: input.binding.root }, options).binding)) fail("binding-changed");
    const state = readState(files);
    if (state && (!options.force || state.lock.lifecycle !== undefined)) return { event: "locked", startedAt: state.lock.startedAt, seenAt: state.lock.seenAt };
    const session = randomUUID();
    const policy = { schemaVersion: 1, session, commit: options.commit === "yes", propose: options.propose === "yes" };
    atomicWrite(files.policy, policy);
    atomicWrite(files.lock, { schemaVersion: 1, id: session, binding: input.binding, startedAt: now(), seenAt: now(), state: EMPTY_STATE, poller: null,
      ...(options.managed ? { client: "claude", mode: "watch", lifecycle: "active", children: [] } : {}) });
    return { event: "started", session, policy: { commit: policy.commit, propose: policy.propose } };
  });
}

async function pollWatch(files, input, options) {
  const session = options.session;
  const nonce = randomUUID();
  const expires = performance.now() + options.deadline;
  const controller = new AbortController();
  let registered = false;
  let event;
  let localTimer;
  let monitorPending;
  const onSignal = () => controller.abort(new Interrupted({ event: "stopped", session }));
  const checkLocal = () => withGuard(files, () => {
    const state = readState(files);
    requireOwnership(state, session, input.binding, nonce);
    requireOwnership(state, session, localInput({ root: input.binding.root }, options).binding, nonce);
    return state;
  }, expires);
  try {
    await withGuard(files, () => {
      const state = readState(files);
      requireOwnership(state, session, input.binding);
      if ((state.lock.mode ?? "watch") !== "watch" || (state.lock.client ?? "claude") !== "claude") fail("binding-changed");
      if (state.lock.poller && isAlive(state.lock.poller.pid)) fail("poller-active");
      state.lock.poller = { pid: process.pid, nonce };
      state.lock.seenAt = now();
      atomicWrite(files.lock, state.lock);
      registered = true;
    }, expires);
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    // Only one local check is outstanding; it never makes an HTTP/model request.
    const monitor = async () => {
      if (controller.signal.aborted) return;
      try {
        if (performance.now() >= expires) throw new Interrupted({ event: "idle", session });
        await checkLocal();
      } catch (error) { controller.abort(error); return; }
      if (!controller.signal.aborted) localTimer = setTimeout(() => { monitorPending = monitor(); }, Math.min(1000, Math.max(1, expires - performance.now())));
    };
    localTimer = setTimeout(() => { monitorPending = monitor(); }, Math.min(1000, options.deadline));
    let failures = 0;
    for (;;) {
      controller.signal.throwIfAborted();
      if (performance.now() >= expires) { event = { event: "idle", session }; break; }
      const started = performance.now();
      let wait;
      try {
        const overview = await limitedRequest(input, "pipeline_next", controller, expires, options.requestTimeout);
        controller.signal.throwIfAborted();
        if (performance.now() >= expires) { event = { event: "idle", session }; break; }
        let work;
        try { work = actionableWork(overview, { commit: false, propose: false }); }
        catch { fail("protocol-error"); }
        event = await withGuard(files, () => {
          const state = readState(files);
          requireOwnership(state, session, input.binding, nonce);
          requireOwnership(state, session, localInput({ root: input.binding.root }, options).binding, nonce);
          work = actionableWork(overview, state.policy);
          if (JSON.stringify(work).includes(input.token)) fail("protocol-error");
          state.lock.state = nextWatchState(state.lock.state, workSignature(work));
          state.lock.seenAt = now();
          atomicWrite(files.lock, state.lock);
          return hasWork(work) ? { event: state.lock.state.stuck ? "stuck" : "work", session, ...work } : null;
        }, expires);
        failures = 0;
        if (event) break;
        wait = Math.max(0, started + options.interval - performance.now());
      } catch (error) {
        if (!(error instanceof TransientFailure)) throw error;
        await withGuard(files, () => {
          const state = readState(files);
          requireOwnership(state, session, input.binding, nonce);
          requireOwnership(state, session, localInput({ root: input.binding.root }, options).binding, nonce);
          state.lock.seenAt = now();
          atomicWrite(files.lock, state.lock);
        }, expires);
        if (++failures >= 5) fail("request-failed");
        wait = Math.max(options.interval, error.retryAfter);
      }
      await delay(Math.min(wait, Math.max(0, expires - performance.now())), undefined, { signal: controller.signal });
    }
  } catch (error) {
    if (controller.signal.aborted) error = controller.signal.reason;
    if (error instanceof Interrupted) event = { ...error.event, session };
    else event = { event: "error", session, code: error instanceof WatchFailure ? error.code : "protocol-error",
      reason: error instanceof WatchFailure ? error.message : REASONS["protocol-error"] };
  } finally {
    clearTimeout(localTimer);
    controller.abort(new Interrupted({ event: "stopped", session }));
    await monitorPending;
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    if (registered) {
      try {
        await withGuard(files, () => {
          const state = readState(files);
          if (state?.lock.id !== session || state.lock.poller?.nonce !== nonce) {
            event = replaced(session, state);
            return;
          }
          if (state.lock.lifecycle === undefined && ["stuck", "error", "stopped"].includes(event?.event)) clearState(files);
          else { state.lock.poller = null; atomicWrite(files.lock, state.lock); }
        }, Math.max(expires, performance.now() + 50));
      } catch (error) {
        event = { event: "error", session, code: error instanceof WatchFailure ? error.code : "corrupt-state",
          reason: error instanceof WatchFailure ? error.message : REASONS["corrupt-state"] };
      }
    }
  }
  return event;
}

async function main() {
  let options;
  let event;
  try {
    options = parseArguments(process.argv.slice(2));
    const location = gitRoot(options.root);
    const files = stateFiles(location.directory);
    if (options.mode === "stop") {
      if (!existsSync(location.directory)) event = { event: "stopped", session: options.session };
      else event = await withGuard(files, () => {
        const state = readState(files);
        if (state === null) return { event: "stopped", session: options.session };
        if (state.lock.id !== options.session) return replaced(options.session, state);
        if (state.lock.lifecycle !== undefined) {
          state.lock.lifecycle = "stopping";
          atomicWrite(files.lock, state.lock);
          return { event: "stopping", session: options.session };
        }
        clearState(files);
        return { event: "stopped", session: options.session };
      });
    } else {
      const input = localInput(location, options);
      if (options.mode === "start") event = await startWatch(files, input, options);
      else if (!existsSync(location.directory)) event = replaced(options.session, null);
      else if (options.mode === "check") event = await withGuard(files, () => {
        const state = readState(files);
        requireOwnership(state, options.session, input.binding);
        state.lock.seenAt = now();
        atomicWrite(files.lock, state.lock);
        return { event: "owned", session: options.session, policy: { commit: state.policy.commit, propose: state.policy.propose } };
      });
      else event = await pollWatch(files, input, options);
    }
  } catch (error) {
    if (error instanceof Interrupted) event = { ...error.event, session: options?.session ?? null };
    else event = { event: "error", session: options?.session ?? null,
      code: error instanceof WatchFailure ? error.code : "protocol-error",
      reason: error instanceof WatchFailure ? error.message : REASONS["protocol-error"] };
  }
  process.stdout.write(JSON.stringify(event) + "\n");
  process.exitCode = event.event === "error" ? 1 : 0;
}

void main();
