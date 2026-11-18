import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { startSmokeServer } from "./smoke-server.mjs";

const listener = fileURLToPath(new URL("./smoke-server-listener.cjs", import.meta.url));
const legacyListener = fileURLToPath(new URL("../smoke-server-listener.cjs", import.meta.url));
const fixtureSource = `
const http = require("node:http");
const mode = process.env.FIXTURE_MODE;
const port = Number(process.env.STAGEKEEPER_SMOKE_PORT);
const identity = { version: 1, event: "stagekeeper-smoke-listening", runId: process.env.STAGEKEEPER_SMOKE_RUN_ID, pid: process.pid, host: "127.0.0.1", port };
if (mode === "hold") { process.send({ event: "fixture-ready" }); setInterval(() => {}, 1000); }
else if (mode.startsWith("wrong-")) {
  const key = mode.slice(6);
  process.send({ ...identity, [key]: key === "pid" || key === "port" || key === "version" ? -1 : "wrong" });
  setInterval(() => {}, 1000);
} else if (mode === "exit-before") { process.send(identity); process.exit(1); }
else {
  const server = http.createServer((req, res) => {
    process.send?.({ event: "fixture-request", path: req.url });
    if (mode === "exit-http") { res.writeHead(200); res.end("fixture"); process.exit(1); return; }
    if (mode === "hang-http") return;
    res.end("fixture");
  });
  const returned = server.listen(port, "127.0.0.1", () => {
    process.send({ event: "fixture-ready", returned: returned === server, restored: !String(http.Server.prototype.listen).includes("stagekeeper-smoke-listening") });
  });
  if (mode === "ignore-term") process.on("SIGTERM", () => process.send({ event: "fixture-term" }));
}
`;

function fixture(t, mode = "ready", additionalPreloads = []) {
  const work = mkdtempSync(join(realpathSync.native(tmpdir()), "stagekeeper-smoke-"));
  const script = join(work, "server.cjs");
  writeFileSync(script, fixtureSource);
  let child;
  const messages = [];
  const waiting = new Map();
  const dependencies = {
    launch(file, args, options) {
      assert.deepEqual(args.slice(0, 3), ["--require", listener, join(options.cwd, "node_modules/next/dist/bin/next")]);
      assert.equal(realpathSync.native(options.cwd), realpathSync.native(fileURLToPath(new URL("../../../", import.meta.url))));
      assert.ok(realpathSync.native(args[2]));
      const preloads = mode.startsWith("wrong-") || mode === "exit-before" ? [] : [...additionalPreloads, ...args.slice(0, 2)];
      child = spawn(file, [...preloads, script], { ...options, env: { ...options.env, FIXTURE_MODE: mode } });
      child.on("message", message => {
        messages.push(message);
        for (const resolve of waiting.get(message.event) ?? []) resolve(message);
        waiting.delete(message.event);
      });
      return child;
    },
  };
  const message = event => {
    const found = messages.find(entry => entry.event === event);
    return found ? Promise.resolve(found) : new Promise(resolve => waiting.set(event, [...(waiting.get(event) ?? []), resolve]));
  };
  t.after(async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.ref();
      const closed = once(child, "exit");
      child.kill("SIGKILL");
      await closed;
    }
    rmSync(work, { recursive: true, force: true });
  });
  return { options: { databaseUrl: "postgresql://fixture@127.0.0.1/stagekeeper_test_smoke", log: join(work, "server.log"), env: process.env },
    dependencies, message, messages, child: () => child, work };
}

it("starts only the owned listener, preserves HTTP behavior and returns one idempotent stop promise", { timeout: 15000 }, async t => {
  const f = fixture(t);
  const server = await startSmokeServer(f.options, f.dependencies);
  assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(await (await fetch(server.origin + "/other")).text(), "fixture");
  assert.deepEqual(await f.message("fixture-ready"), { event: "fixture-ready", returned: true, restored: true });
  assert.deepEqual(f.messages.filter(message => message.event === "stagekeeper-smoke-listening").length, 1);
  const stopping = server.stop();
  assert.equal(server.stop(), stopping);
  await stopping;
  assert.ok(server.child.exitCode !== null || server.child.signalCode !== null);
  assert.equal(server.child.listenerCount("message"), 1);
});

it("loads the old and new preloads in one process and restores listen after one ownership message", { timeout: 15000 }, async t => {
  const f = fixture(t, "ready", ["--require", legacyListener]);
  const server = await startSmokeServer(f.options, f.dependencies);
  try {
    assert.deepEqual(await f.message("fixture-ready"), { event: "fixture-ready", returned: true, restored: true });
    assert.equal(f.messages.filter(message => message.event === "stagekeeper-smoke-listening").length, 1);
  } finally {
    await server.stop();
  }
});

it("runs two servers on separate addresses and stopping one preserves the other", { timeout: 15000 }, async t => {
  const a = fixture(t), b = fixture(t);
  const [first, second] = await Promise.all([startSmokeServer(a.options, a.dependencies), startSmokeServer(b.options, b.dependencies)]);
  t.after(() => second.stop());
  assert.notEqual(first.origin, second.origin);
  await first.stop();
  assert.equal(await (await fetch(second.origin + "/login")).text(), "fixture");
  await second.stop();
});

it("never probes or kills an unrelated listener on an occupied port", { timeout: 15000 }, async t => {
  let requests = 0;
  const foreign = createServer((_req, res) => { requests++; res.end("foreign"); });
  await new Promise(resolve => foreign.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => foreign.close(resolve)));
  const f = fixture(t), port = foreign.address().port;
  await assert.rejects(startSmokeServer({ ...f.options, port }, f.dependencies), /startup failed/);
  assert.equal(requests, 0);
  assert.equal(foreign.listening, true);
  assert.equal(f.child().exitCode !== null || f.child().signalCode !== null, true);
});

for (const field of ["runId", "pid", "host", "port", "version"]) {
  it(`rejects a child with the wrong ${field} before HTTP`, { timeout: 15000 }, async t => {
    const f = fixture(t, "wrong-" + field);
    await assert.rejects(startSmokeServer(f.options, f.dependencies), error => error.cause?.message.includes("ownership"));
    assert.equal(f.messages.some(message => message.event === "fixture-request"), false);
    assert.ok(f.child().exitCode !== null || f.child().signalCode !== null);
  });
}

for (const mode of ["exit-before", "exit-http"]) {
  it(`rejects a child that exits at ${mode}`, { timeout: 15000 }, async t => {
    const f = fixture(t, mode);
    if (mode === "exit-http") {
      const request = globalThis.fetch;
      t.mock.method(globalThis, "fetch", async (...args) => {
        const response = await request(...args);
        if (f.child().exitCode === null && f.child().signalCode === null) await once(f.child(), "exit");
        return response;
      });
    }
    await assert.rejects(startSmokeServer(f.options, f.dependencies), /startup failed/);
    assert.ok(f.child().exitCode !== null || f.child().signalCode !== null);
  });
}

it("cleans up spawn errors and permits a separate later attempt", { timeout: 15000 }, async t => {
  const f = fixture(t);
  await assert.rejects(startSmokeServer(f.options, { launch: (_file, args, options) => spawn(join(f.work, "missing-node"), args, options) }), /startup failed/);
  const server = await startSmokeServer(f.options, f.dependencies);
  await server.stop();
});

it("creates no child when already aborted and stops only its child when aborted during startup", { timeout: 15000 }, async t => {
  const f = fixture(t, "hold");
  await assert.rejects(startSmokeServer({ ...f.options, signal: AbortSignal.abort() }, f.dependencies));
  assert.equal(f.child(), undefined);
  const controller = new AbortController();
  const starting = startSmokeServer({ ...f.options, signal: controller.signal }, f.dependencies);
  const rejected = assert.rejects(starting, /startup failed/);
  await f.message("fixture-ready");
  controller.abort();
  await rejected;
  assert.ok(f.child().exitCode !== null || f.child().signalCode !== null);
});

it("startup cancellation after return does not stop a server still in use", { timeout: 15000 }, async t => {
  const f = fixture(t), controller = new AbortController();
  const server = await startSmokeServer({ ...f.options, signal: controller.signal }, f.dependencies);
  controller.abort();
  assert.equal(await (await fetch(server.origin + "/login")).text(), "fixture");
  await server.stop();
});

it("bounds a startup that listens but never completes HTTP and confirms child exit", { timeout: 15000 }, async t => {
  const f = fixture(t, "hang-http");
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const rejected = assert.rejects(startSmokeServer(f.options, f.dependencies), error => error.cause?.message.includes("timed out"));
  await f.message("fixture-request");
  t.mock.timers.tick(120000);
  await rejected;
  t.mock.timers.reset();
  assert.ok(f.child().exitCode !== null || f.child().signalCode !== null);
});

it("escalates an ignored graceful stop and waits for actual termination", { timeout: 15000, skip: process.platform === "win32" && "Windows SIGTERM already terminates the process" }, async t => {
  const f = fixture(t, "ignore-term");
  const server = await startSmokeServer(f.options, f.dependencies);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const stopped = server.stop();
  await f.message("fixture-term");
  t.mock.timers.tick(5000);
  await stopped;
  t.mock.timers.reset();
  assert.equal(server.child.signalCode, "SIGKILL");
});

it("reports an unconfirmed stop instead of treating signal delivery as termination", { timeout: 20000 }, async t => {
  const f = fixture(t), server = await startSmokeServer(f.options, f.dependencies);
  const kill = server.child.kill.bind(server.child);
  const signals = [];
  server.child.kill = signal => { signals.push(signal); return false; };
  try {
    const stopped = server.stop();
    assert.equal(server.stop(), stopped);
    await assert.rejects(stopped, /did not close/);
    assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
    assert.equal(server.child.exitCode, null);
  } finally {
    server.child.kill = kill;
  }
});

it("rejects invalid direct preload configuration before changing listen", t => {
  const f = fixture(t);
  const code = `const http = require("node:http"), before = http.Server.prototype.listen;
    try { require(${JSON.stringify(listener)}); process.exit(1); }
    catch { if (http.Server.prototype.listen !== before) process.exit(2); }`;
  for (const patch of [{ STAGEKEEPER_SMOKE_PARENT_PID: "invalid" }, { STAGEKEEPER_SMOKE_PARENT_PID: String(process.pid), STAGEKEEPER_SMOKE_PORT: "0" }]) {
    const result = spawnSync(process.execPath, ["-e", code], { env: { ...process.env, ...patch }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(readFileSync(join(f.work, "server.cjs"), "utf8"), fixtureSource);
});

it("leaves inherited preloads in descendants inactive", { timeout: 15000 }, async t => {
  const f = fixture(t);
  const descendant = join(f.work, "descendant.cjs"), capture = join(f.work, "capture.cjs");
  writeFileSync(capture, 'global.beforeListen = require("node:http").Server.prototype.listen;');
  writeFileSync(descendant, 'process.send({event:"descendant", untouched:global.beforeListen === require("node:http").Server.prototype.listen}); process.disconnect();');
  const direct = join(f.work, "direct.cjs");
  writeFileSync(direct, `const {fork}=require("node:child_process"); const child=fork(${JSON.stringify(descendant)});
    child.on("message", value => process.send(value)); child.on("close", () => process.disconnect());`);
  const child = spawn(process.execPath, ["--require", capture, "--require", listener, direct], {
    stdio: ["ignore", "ignore", "pipe", "ipc"], env: { ...process.env, STAGEKEEPER_SMOKE_PARENT_PID: String(process.pid), STAGEKEEPER_SMOKE_RUN_ID: "11111111-1111-4111-8111-111111111111", STAGEKEEPER_SMOKE_PORT: "54321" },
  });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  const closed = once(child, "close");
  const [message] = await once(child, "message");
  assert.deepEqual(message, { event: "descendant", untouched: true });
  const [code] = await closed;
  assert.equal(code, 0);
});
