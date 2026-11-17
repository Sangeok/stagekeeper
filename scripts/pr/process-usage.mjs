import childProcess from "node:child_process";
import { lstat, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { ObservationProtocolError, parseProcessInventory, parseLsofCwds, reconcileProcessInventory, parseWindowsObservation } from "./process-usage-protocol.mjs";

const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_TIMEOUT = 20000;
const SETTLE_TIMEOUT = 4000;
const decoder = new TextDecoder("utf-8", { fatal: true });

class ObservationFailure extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

async function directoryIdentity(input) {
  if (!(await lstat(input)).isDirectory()) throw new ObservationFailure("invalid-target");
  const canonicalPath = await realpath(input);
  const value = await stat(canonicalPath, { bigint: true });
  if (!value.isDirectory()) throw new ObservationFailure("invalid-target");
  return { canonicalPath, device: String(value.dev), inode: String(value.ino) };
}

function sameIdentity(a, b) {
  return a.canonicalPath === b.canonicalPath && a.device === b.device && a.inode === b.inode;
}

function createRunner(signal, timeout) {
  const started = performance.now();
  const pids = new Set();
  let bytes = 0, observerState = "not-started", unsettledPid = null;
  const check = () => {
    if (signal?.aborted) throw new ObservationFailure("cancelled");
    if (performance.now() - started >= timeout) throw new ObservationFailure("observation-timeout");
  };
  const run = (file, args) => {
    check();
    return new Promise((resolve, reject) => {
      let child, timer, escalation, settleTimer, failure, settled = false;
      const stdout = [], stderr = [];
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer); clearTimeout(escalation); clearTimeout(settleTimer);
        signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(value);
      };
      const stop = reason => {
        if (failure) return;
        failure = reason;
        child.kill("SIGTERM");
        escalation = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 1000);
        settleTimer = setTimeout(() => {
          observerState = "unsettled"; unsettledPid = child.pid ?? null;
          finish(new ObservationFailure("observer-unsettled"));
        }, SETTLE_TIMEOUT);
      };
      const abort = () => stop("cancelled");
      try {
        child = childProcess.spawn(file, args, {
          cwd: os.tmpdir(), shell: false, windowsHide: true,
          env: { ...process.env, LC_ALL: "en_US.UTF-8", POWERSHELL_TELEMETRY_OPTOUT: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        observerState = "settled";
        if (child.pid) pids.add(child.pid);
        timer = setTimeout(() => stop("observation-timeout"), Math.max(1, timeout - (performance.now() - started)));
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        const collect = (chunks, chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_OUTPUT) stop("output-limit");
          else if (!failure) chunks.push(chunk);
        };
        child.stdout.on("data", value => collect(stdout, value));
        child.stderr.on("data", value => collect(stderr, value));
        child.once("error", () => { failure ??= "observer-unavailable"; });
        child.once("close", (code, exitSignal) => {
          observerState = "settled";
          if (failure || exitSignal || code !== 0) finish(new ObservationFailure(failure ?? "observer-failed"));
          else finish(null, { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
        });
      } catch (error) {
        observerState = "not-started";
        finish(["ENOENT", "EACCES", "EPERM"].includes(error?.code) ? new ObservationFailure("observer-unavailable") : error);
      }
    });
  };
  return { run, check, pids, state: () => ({ state: observerState, pid: unsettledPid, scratchRetained: false }), bytes: () => bytes };
}

async function macObservation(runner) {
  const version = await runner.run("/usr/sbin/lsof", ["-v"]);
  const info = decoder.decode(Buffer.concat([version.stdout, version.stderr]));
  if (!/revision:\s*4\.91\b/.test(info) || !info.includes("libproc-based") || !info.includes("Anyone can list all files.")) {
    throw new ObservationFailure("unsupported-profile");
  }
  const inventory = async () => {
    const result = await runner.run("/bin/ps", ["-axo", "uid=,pid=,stat=,lstart="]);
    if (result.stderr.length) throw new ObservationFailure("observer-diagnostic");
    return parseProcessInventory(result.stdout, process.getuid());
  };
  const before = await inventory();
  const listed = await runner.run("/usr/sbin/lsof", ["-nP", "-a", "-u", String(process.getuid()), "-d", "cwd", "-Fpfn0"]);
  if (listed.stderr.length) throw new ObservationFailure("observer-diagnostic");
  const cwds = parseLsofCwds(listed.stdout);
  const after = await inventory();
  return { ...reconcileProcessInventory(before, after, cwds, runner.pids), profile: "darwin-lsof-4.91-current-uid-v1" };
}

async function windowsObservation(runner) {
  const executable = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "PowerShell", "7", "pwsh.exe");
  const script = fileURLToPath(new URL("./platform/windows-process-usage.ps1", import.meta.url));
  const result = await runner.run(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", script]);
  if (result.stderr.length) throw new ObservationFailure("observer-diagnostic");
  return parseWindowsObservation(result.stdout);
}

export async function inspectWorktreeUsage(options = {}) {
  const result = {
    status: "unknown", target: null, holders: [], reasons: [],
    observation: { at: new Date().toISOString(), platform: process.platform, architecture: process.arch, release: os.release(),
      scope: "current-account-all-sessions-non-zombie-cwd", coverageComplete: false, profile: null, processCount: 0, missingCount: 0, snapshotAttempts: 0, populationChanges: 0, durationMs: 0, outputBytes: 0 },
    observer: { state: "not-started", pid: null, scratchRetained: false },
  };
  const started = performance.now();
  const finish = () => {
    result.observation.durationMs = Math.round(performance.now() - started);
    return result;
  };
  if (!options || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).some(key => !["worktreePath", "signal", "observationTimeoutMs"].includes(key))) {
    result.reasons = ["invalid-input"]; return finish();
  }
  const { worktreePath, signal, observationTimeoutMs = MAX_TIMEOUT } = options;
  if (typeof worktreePath !== "string" || !path.isAbsolute(worktreePath) || worktreePath.includes("\0")
    || signal !== undefined && !(signal instanceof AbortSignal)
    || !Number.isInteger(observationTimeoutMs) || observationTimeoutMs < 1 || observationTimeoutMs > MAX_TIMEOUT) {
    result.reasons = ["invalid-input"]; return finish();
  }
  if (signal?.aborted) { result.reasons = ["cancelled"]; return finish(); }
  if (!["darwin", "win32"].includes(process.platform)) { result.reasons = ["unsupported-platform"]; return finish(); }
  if (process.platform === "win32" && (process.arch !== "x64" || worktreePath.startsWith("\\\\"))) {
    result.reasons = ["unsupported-profile"]; return finish();
  }
  let runner;
  try {
    result.target = await directoryIdentity(worktreePath);
    runner = createRunner(signal, observationTimeoutMs);
    let observation;
    do {
      runner.check();
      observation = await (process.platform === "darwin" ? macObservation(runner) : windowsObservation(runner));
      result.observation.snapshotAttempts++;
      if (observation.reasons.includes("population-changed")) result.observation.populationChanges++;
    } while (observation.reasons.includes("population-changed"));
    result.observation.profile = observation.profile;
    result.observation.processCount = observation.count;
    result.observation.missingCount = observation.missing ?? 0;
    if (observation.reasons.length) throw new ObservationFailure(observation.reasons[0]);
    const directories = new Map();
    for (const row of observation.records) {
      runner.check();
      if (!directories.has(row.cwd)) directories.set(row.cwd, process.platform === "darwin" ? path.resolve(row.cwd) : await realpath(row.cwd));
      const cwd = directories.get(row.cwd);
      const relative = path.relative(result.target.canonicalPath, cwd);
      if (relative === "" || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) {
        result.holders.push({ pid: row.pid, startIdentity: row.startIdentity, relation: relative === "" ? "target" : "descendant" });
      }
    }
    runner.check();
    if (!sameIdentity(result.target, await directoryIdentity(worktreePath))) throw new ObservationFailure("target-changed");
    runner.check();
    result.observation.coverageComplete = true;
    result.status = result.holders.length ? "busy" : "clear";
  } catch (error) {
    if (error instanceof ObservationFailure) result.reasons = [error.reason];
    else if (error instanceof ObservationProtocolError) result.reasons = ["invalid-observation"];
    else if (["ENOENT", "EACCES", "EPERM", "ENOTDIR", "ELOOP"].includes(error?.code)) result.reasons = ["path-unavailable"];
    else throw error;
  } finally {
    if (runner) { result.observer = runner.state(); result.observation.outputBytes = runner.bytes(); }
  }
  return finish();
}
