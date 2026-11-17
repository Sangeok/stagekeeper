import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const preload = fileURLToPath(new URL("./smoke-server-listener.cjs", import.meta.url));
const host = "127.0.0.1";
const startupMs = 120_000;
const shutdownMs = 5_000;

async function candidatePort(signal) {
  signal.throwIfAborted();
  const reservation = createServer();
  try {
    await new Promise((resolve, reject) => {
      const aborted = () => reject(signal.reason);
      signal.addEventListener("abort", aborted, { once: true });
      reservation.once("close", () => signal.removeEventListener("abort", aborted));
      reservation.once("error", reject);
      reservation.listen({ host, port: 0, signal }, resolve);
    });
    signal.throwIfAborted();
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Smoke port reservation failed");
    return address.port;
  } finally {
    await new Promise((resolve, reject) => reservation.close(error => {
      if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
      else resolve();
    }));
    reservation.removeAllListeners();
  }
}

function within(work, milliseconds) {
  let timer;
  return Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Owned smoke child did not close")), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

/** @param {{ databaseUrl: string, log: string, env?: NodeJS.ProcessEnv, signal?: AbortSignal, port?: number }} options */
export async function startSmokeServer({ databaseUrl, log, env = process.env, signal, port }, { launch = spawn } = {}) {
  signal?.throwIfAborted();
  if (typeof databaseUrl !== "string" || !databaseUrl || typeof log !== "string" || !log
    || port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("Invalid smoke server options");
  const startup = new AbortController();
  const abort = () => startup.abort(signal.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => startup.abort(new Error("Smoke server startup timed out")), startupMs);
  let child, stop;
  let failureListener, messageListener, disconnectListener, abortListener;
  let exitListener, closeListener;
  const detachStartup = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    if (abortListener) startup.signal.removeEventListener("abort", abortListener);
    if (child) {
      child.off("message", messageListener);
      child.off("disconnect", disconnectListener);
    }
  };
  try {
    const selectedPort = port ?? await candidatePort(startup.signal);
    startup.signal.throwIfAborted();
    const origin = `http://${host}:${selectedPort}`;
    const runId = randomUUID();
    const output = openSync(log, "a");
    try {
      child = launch(process.execPath, ["--require", preload, fileURLToPath(new URL("../../node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", host, "--port", String(selectedPort)], {
        cwd: root, windowsHide: true, stdio: ["ignore", output, output, "ipc"],
        env: { ...env, DATABASE_URL: databaseUrl, AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_URL: origin,
          AUTH_TRUST_HOST: "true", HARNESS_PUBLIC_URL: origin, STAGEKEEPER_SMOKE_RUN_ID: runId,
          STAGEKEEPER_SMOKE_PORT: String(selectedPort), STAGEKEEPER_SMOKE_PARENT_PID: String(process.pid) },
      });
    } finally {
      closeSync(output);
    }
    let closed = false, exited = false, failure;
    let rejectFailure, resolveListening, resolveClosed;
    const failed = new Promise((_, reject) => { rejectFailure = reject; });
    void failed.catch(() => {});
    const listening = new Promise(resolve => { resolveListening = resolve; });
    const closure = new Promise(resolve => { resolveClosed = resolve; });
    const fail = error => { failure ??= error; rejectFailure(failure); };
    failureListener = error => fail(new Error("Smoke child process error", { cause: error }));
    exitListener = () => { exited = true; fail(new Error("Smoke child exited")); };
    closeListener = () => { closed = true; resolveClosed(); fail(new Error("Smoke child closed")); };
    disconnectListener = () => fail(new Error("Smoke child IPC disconnected during startup"));
    messageListener = message => {
      if (message?.event !== "stagekeeper-smoke-listening") return;
      if (message.version !== 1 || message.runId !== runId || message.pid !== child.pid || message.host !== host || message.port !== selectedPort
        || Object.keys(message).sort().join(",") !== "event,host,pid,port,runId,version") {
        fail(new Error("Invalid smoke listener ownership message"));
        return;
      }
      resolveListening();
    };
    abortListener = () => fail(startup.signal.reason);
    child.on("error", failureListener);
    child.once("exit", exitListener);
    child.once("close", closeListener);
    child.on("message", messageListener);
    child.once("disconnect", disconnectListener);
    startup.signal.addEventListener("abort", abortListener, { once: true });
    if (startup.signal.aborted) abortListener();
    let stopping;
    stop = () => {
      stopping ??= (async () => {
        try {
          if (closed) return;
          if (child.pid && !exited) child.kill("SIGTERM");
          try {
            await within(closure, shutdownMs);
          } catch {
            if (child.pid && !exited) child.kill("SIGKILL");
            await within(closure, shutdownMs);
          }
        } finally {
          detachStartup();
          if (child.connected) child.disconnect();
          child.off("error", failureListener);
          child.off("exit", exitListener);
          child.off("close", closeListener);
          if (!closed) child.unref();
        }
      })();
      return stopping;
    };
    await Promise.race([listening, failed]);
    while (true) {
      if (failure) throw failure;
      startup.signal.throwIfAborted();
      const response = await Promise.race([
        fetch(origin + "/login", { redirect: "manual", signal: AbortSignal.any([startup.signal, AbortSignal.timeout(2_000)]) })
          .catch(() => null),
        failed,
      ]);
      await response?.body?.cancel();
      if (response?.status === 200) {
        await new Promise(resolve => setImmediate(resolve));
        if (failure) throw failure;
        if (exited || closed || child.exitCode !== null || child.signalCode !== null) throw new Error("Smoke child exited after HTTP readiness");
        startup.signal.throwIfAborted();
        detachStartup();
        return { child, origin, stop };
      }
      await Promise.race([delay(100, undefined, { signal: startup.signal }), failed]);
    }
  } catch (error) {
    try {
      if (stop) await stop();
    } catch (cleanupError) {
      throw Object.assign(new AggregateError([error, cleanupError], "Smoke server startup and cleanup failed"), { code: "server-start", cleanupFailed: true });
    }
    throw Object.assign(new Error("Smoke server startup failed", { cause: error }), { code: "server-start", cleanupFailed: false });
  } finally {
    detachStartup();
  }
}
