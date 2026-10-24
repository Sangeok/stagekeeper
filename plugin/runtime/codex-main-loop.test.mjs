import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { it } from "node:test";
import { createCodexExecution } from "./codex-main-loop.mjs";
import { atomicWrite, readState, startSession, stateFiles } from "./local-session.mjs";

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "resident-main-loop-test-")), scratch = [];
  t.after(() => { rmSync(root, { recursive: true }); for (const folder of scratch) rmSync(folder, { recursive: true }); });
  const git = (...args) => execFileSync("git", args, { cwd: root, windowsHide: true, stdio: "pipe" });
  git("init", "-q", "--initial-branch=fixture"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.test");
  writeFileSync(path.join(root, "source.txt"), "test"); git("add", "."); git("commit", "-qm", "baseline");
  const binding = { root, server: "http://127.0.0.1:1", project: "test", configHash: "a".repeat(64), tokenHash: "b".repeat(64) };
  const files = stateFiles(path.join(root, ".git/harness"));
  const started = await startSession(files, binding, { client: "codex", commit: true, propose: false });
  const owned = readState(files); owned.lock.mode = "resident"; atomicWrite(files.lock, owned.lock);
  mkdirSync(path.join(root, "docs/harness"), { recursive: true });
  const verifier = { path: "fixture/SKILL.md", checksum: "fixture" }; writeFileSync(path.join(root, "docs/harness/codex-package.json"), JSON.stringify({ verifier }));
  const startedTurn = deferred(), records = [], servers = [], counts = { file: 0, fileClosed: 0, bridge: 0, bridgeClosed: 0, spawned: 0, interrupted: 0, closed: 0, tools: 0 };
  let policyRefusal;
  const fail = at => { if (options.fail === at) throw new Error("Injected " + at); };
  const runtime = {
    verifierPackage: () => verifier, stageVerifierPackage: (_verifier, directory) => { scratch.push(directory); return { ...verifier, path: path.join(directory, ".agents/skills/verifier/SKILL.md") }; },
    createRoleFiles: () => { counts.file++; return { close: async () => { counts.fileClosed++; } }; },
    installedWindowsRuntime: () => ({}), verifyNativeRuntime: async () => { fail("native"); },
    createRoleCommands: async ({ fileBroker }) => { fail("commands"); return fileBroker; },
    createMainLoopTools: async () => { fail("inventory"); counts.tools++; return { tools: [{ name: "pipeline_next" }] }; },
    createMainLoopBridge: async (_tools, _signal, _record, onRefusal) => { policyRefusal = onRefusal; counts.bridge++; return { url: "http://fixture", close: async () => { counts.bridgeClosed++; } }; },
    codexExecutable: () => ({ executable: "test", prefix: [] }), inspectHostPolicy: async () => { fail("policy"); return []; },
    spawn: () => { counts.spawned++; return { pid: process.pid, stdin: new PassThrough() }; },
    assertRolePolicy: () => { fail("effective"); }, verifyRoleExecution: async () => {},
    createAppServer: () => {
      const server = { closed: false, listeners: new Set(),
        emit(status = "completed") { for (const listener of this.listeners) listener({ method: "turn/completed", params: { threadId: "thread-" + servers.length, turn: { id: "turn", status } } }); },
        request: async function (method) {
          if (method === "initialize") { fail("initialize"); return {}; }
          if (method === "config/read") return { config: {} };
          if (method === "skills/list") return { data: [] };
          if (method === "thread/start") { fail("thread"); return { thread: { id: "thread-" + servers.length } }; }
          if (method === "turn/start") { startedTurn.resolve(); if (options.startGate) await options.startGate.promise; return { turn: { id: "turn" } }; }
          if (method === "turn/interrupt") { counts.interrupted++; this.emit(options.interruptStatus ?? "interrupted"); return {}; }
          throw new Error("Unexpected method " + method);
        }, close: async function () { counts.closed++; this.closed = true; },
      };
      servers.push(server); return server;
    },
  };
  const execution = createCodexExecution({ input: { binding, config: { project: { slug: "test" }, workspaces: [] } }, files, session: started.session, branch: "fixture",
    beat: async () => ({ kind: "ok", paused: false, stop: null }), record: event => records.push(event) }, runtime);
  return { execution, counts, records, servers, files, startedTurn, git, refusePolicy: () => policyRefusal() };
}

it("starts fresh serial native contexts and settles each child before the next generation", async t => {
  const f = await fixture(t);
  for (const generation of [1, 2]) {
    const cycle = f.execution.start({ generation });
    assert.throws(() => f.execution.start({ generation: generation + 1 }), /already active/);
    while (f.records.filter(value => value.event === "model-start").length < generation) await new Promise(resolve => setImmediate(resolve));
    f.servers.at(-1).emit();
    const result = await cycle.done; assert.equal(f.execution.classify(result).outcome, "success");
    assert.equal(readState(f.files).lock.children.length, 0);
  }
  assert.deepEqual(f.records.filter(value => value.event === "model-start").map(value => value.threadId), ["thread-1", "thread-2"]);
  assert.equal(f.counts.closed, 2); assert.equal(f.counts.fileClosed, 2); assert.equal(f.counts.bridgeClosed, 2);
});

it("interrupts exactly once when ownership is lost before turn acknowledgement and rejects late success", async t => {
  const startGate = deferred(), f = await fixture(t, { startGate }), cycle = f.execution.start({ generation: 1 });
  await f.startedTurn.promise;
  f.execution.observeLease({ kind: "replaced" }); cycle.end("stop"); cycle.end("timeout");
  startGate.resolve();
  const result = await cycle.done;
  assert.equal(f.counts.interrupted, 1); assert.equal(result.terminal, "interrupted"); assert.equal(f.execution.classify(result).outcome, "cancelled");
  f.servers[0].emit("completed");
  assert.equal(f.execution.classify(result).outcome, "cancelled"); assert.equal(readState(f.files).lock.children.length, 0);
});

for (const terminal of ["interrupted", "completed"]) it(`keeps a fatal tool refusal failed when the terminal is ${terminal}`, async t => {
  const f = await fixture(t, { interruptStatus: terminal }), cycle = f.execution.start({ generation: 1 });
  while (!f.records.some(value => value.event === "model-start")) await new Promise(resolve => setImmediate(resolve));
  f.refusePolicy(); f.refusePolicy(); cycle.end("stop");
  const result = await cycle.done;
  assert.equal(result.endedFor, "policy"); assert.equal(result.terminal, terminal);
  assert.equal(f.execution.classify(result).outcome, "error"); assert.equal(f.counts.interrupted, 1);
  assert.equal(f.counts.closed, 1); assert.equal(f.counts.bridgeClosed, 1); assert.equal(f.counts.fileClosed, 1);
  assert.equal(readState(f.files).lock.children.length, 0);
});

for (const fail of ["native", "commands", "inventory", "policy", "initialize", "effective", "thread"]) it(`cleans partial main-loop acquisition after ${fail} without starting a model`, async t => {
  const f = await fixture(t, { fail }), result = await f.execution.start({ generation: 1 }).done;
  assert.equal(result.failed, true); assert.equal(f.execution.classify(result).outcome, "error");
  assert.equal(f.records.some(value => value.event === "model-start"), false); assert.equal(readState(f.files).lock.children.length, 0);
  assert.equal(f.counts.fileClosed, f.counts.file); assert.equal(f.counts.bridgeClosed, f.counts.bridge); assert.equal(f.counts.closed, f.counts.spawned);
});

it("refuses a changed branch before any runtime acquisition", async t => {
  const f = await fixture(t); f.git("switch", "-qc", "another");
  const result = await f.execution.start({ generation: 1 }).done;
  assert.equal(result.failed, true); assert.equal(f.counts.file, 0); assert.equal(f.counts.spawned, 0);
});
