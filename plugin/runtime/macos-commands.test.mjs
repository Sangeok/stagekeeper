import assert from "node:assert/strict";
import { it } from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { installedMacosRuntime } from "./macos-runtime.mjs";
import { createMacosCommands, runMacosCommand, verifyMacosRuntime } from "./macos-commands.mjs";
import { createRoleFiles } from "./role-files.mjs";
import { checkSession, gitRoot, readState, releaseSession, requestStop, startSession, stateFiles } from "./local-session.mjs";
import { recoverMacosCommands } from "./macos-recovery.mjs";

let runtime;
try { if (process.platform === "darwin") runtime = installedMacosRuntime(); } catch (error) { if (process.env.STAGEKEEPER_MACOS_RUNTIME_REQUIRED === "1") throw error; }
const native = { skip: process.platform !== "darwin" ? "macOS only" : !runtime ? "Packaged macOS runtime required" : false, timeout: 60000 };
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const nodeCommand = source => `node -e ${shellQuote(source)}`;
function fixture(t) {
  const base = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-command-"));
  const root = path.join(base, "repo"), scratch = path.join(base, "scratch");
  mkdirSync(root); mkdirSync(scratch);
  t.after(() => rmSync(base, { recursive: true }));
  return { base, root, scratch };
}

it("macOS preflight proves allowed work, inherited denial and network refusal with the packaged Node", native, async () => {
  const active = new Set();
  const result = await verifyMacosRuntime(runtime, { onSpawn: child => active.add(child.nonce), onSettled: child => active.delete(child.nonce) });
  assert.equal(result.event, "native-command-ready");
  assert.equal(active.size, 0);
});

it("macOS command snapshots accept the 300000 ms maximum, preserve internal npm executable links and discard every write", native, async t => {
  const f = fixture(t);
  mkdirSync(path.join(f.root, "node_modules/.bin"), { recursive: true });
  mkdirSync(path.join(f.root, "node_modules/example"));
  writeFileSync(path.join(f.root, "node_modules/example/check"), '#!/bin/sh\nprintf linked-ok\n', { mode: 0o700 });
  symlinkSync("../example/check", path.join(f.root, "node_modules/.bin/check"));
  writeFileSync(path.join(f.root, "source.txt"), "ORIGINAL");
  writeFileSync(path.join(f.root, ".env"), "DENIED_CANARY");
  writeFileSync(path.join(f.root, "package.json"), JSON.stringify({ scripts: { test: "check" } }));
  const files = createRoleFiles({ ":root": "deny", [f.root]: "read", [f.scratch]: "write" }, "plan-verifier");
  const backend = await createMacosCommands({ root: f.root, scratch: f.scratch, agent: "plan-verifier", fileBroker: files, runtime });
  t.after(() => backend.close());
  const result = await backend.call("role_command_exec", { command: "npm test && printf CHANGED > source.txt", timeoutMs: 300000 });
  assert.equal(result.status, "exited"); assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /linked-ok/); assert.ok(result.omitted.includes(".env"));
  assert.equal(result.originalRepositoryWrites, false); assert.equal(result.snapshotWrites, "discarded");
  assert.equal(readFileSync(path.join(f.root, "source.txt"), "utf8"), "ORIGINAL");
});

it("macOS snapshots copy fully accounted internal hardlinks independently while direct file tools still refuse them", native, async t => {
  const f = fixture(t), first = path.join(f.root, "binary"), second = path.join(f.root, "alias");
  writeFileSync(first, '#!/bin/sh\nprintf original\n', { mode: 0o700 }); linkSync(first, second);
  symlinkSync("binary", path.join(f.root, "command"));
  const files = createRoleFiles({ ":root": "deny", [f.root]: "write", [f.scratch]: "write" }, "plan-verifier");
  assert.throws(() => files.call("role_file_read", { path: first }), /Hard-linked/);
  assert.throws(() => files.call("role_file_write", { path: first, content: "changed", expectedHash: null }), /Hard-linked/);
  const backend = await createMacosCommands({ root: f.root, scratch: f.scratch, agent: "plan-verifier", fileBroker: files, runtime });
  t.after(() => backend.close());
  const result = await backend.call("role_command_exec", { command: './command && node -e "const fs=require(\'node:fs\'),a=require(\'node:assert/strict\');a.equal(fs.statSync(\'binary\').nlink,1);a.equal(fs.statSync(\'alias\').nlink,1);fs.writeFileSync(\'alias\',\'changed\');a.match(fs.readFileSync(\'binary\',\'utf8\'),/original/);"', timeoutMs: 10000 });
  assert.equal(result.exitCode, 0, result.stderr); assert.match(result.stdout, /original/);
  assert.equal(readFileSync(first, "utf8"), readFileSync(second, "utf8"));
  assert.match(readFileSync(first, "utf8"), /original/);
});

it("macOS snapshots refuse hardlink ownership changing after enumeration", native, async t => {
  const f = fixture(t), source = path.join(f.root, "source");
  writeFileSync(source, "ORIGINAL"); linkSync(source, path.join(f.root, "alias"));
  const files = createRoleFiles({ ":root": "deny", [f.root]: "read", [f.scratch]: "write" }, "plan-verifier");
  let changed = false;
  const observed = { ...files, resolveRead(name, proof) {
    if (proof && !changed) { changed = true; linkSync(source, path.join(f.base, "external")); }
    return files.resolveRead(name, proof);
  } };
  const backend = await createMacosCommands({ root: f.root, scratch: f.scratch, agent: "plan-verifier", fileBroker: observed, runtime });
  t.after(() => backend.close());
  await assert.rejects(backend.call("role_command_exec", { command: "cat source", timeoutMs: 10000 }), /hardlink identity changed/);
  assert.equal(changed, true);
});

for (const denied of ["external", ".env"]) it(`macOS snapshots refuse a hardlink alias in ${denied}`, native, async t => {
  const f = fixture(t), source = path.join(denied === "external" ? f.base : f.root, denied);
  writeFileSync(source, "PRIVATE_CANARY"); linkSync(source, path.join(f.root, "public"));
  const files = createRoleFiles({ ":root": "deny", [f.root]: "read", [f.scratch]: "write" }, "plan-verifier");
  const backend = await createMacosCommands({ root: f.root, scratch: f.scratch, agent: "plan-verifier", fileBroker: files, runtime });
  t.after(() => backend.close());
  await assert.rejects(backend.call("role_command_exec", { command: "cat public", timeoutMs: 10000 }), /unaccounted or denied alias/);
  assert.equal(readFileSync(source, "utf8"), "PRIVATE_CANARY");
});

it("macOS stop ends a command started with the 300000 ms maximum and its detached descendant before acknowledging settlement", native, async t => {
  const f = fixture(t), controller = new AbortController();
  const source = "const c=require('node:child_process').spawn(process.execPath,['-e',\"setInterval(()=>{},1000)\"],{detached:true,stdio:'ignore'});require('node:fs').writeFileSync('../scratch/child.json',JSON.stringify({pid:c.pid}));setInterval(()=>{},1000)";
  let descendant = null, observed = false;
  const timer = setInterval(() => {
    try { descendant = JSON.parse(readFileSync(path.join(f.scratch, "child.json"), "utf8")).pid; observed = true; controller.abort(); } catch { }
  }, 20);
  t.after(() => clearInterval(timer));
  const result = await runMacosCommand({ root: f.base, runtime: runtime.directory, command: nodeCommand(source), cwd: "", timeoutMs: 300000 }, {
    signal: controller.signal, onSettled() {
      if (descendant) assert.throws(() => process.kill(descendant, 0), error => error.code === "ESRCH");
    },
  });
  assert.equal(observed, true); assert.equal(result.status, "stopped"); assert.equal(result.quiescent, true);
});

it("macOS helper death cleans its confined descendants and never reports success", native, async t => {
  const f = fixture(t);
  let helper = null, descendant = null;
  const timer = setInterval(() => {
    try {
      descendant = JSON.parse(readFileSync(path.join(f.scratch, "child.json"), "utf8")).pid;
      if (helper) { process.kill(helper, "SIGKILL"); clearInterval(timer); }
    } catch { }
  }, 20);
  t.after(() => clearInterval(timer));
  const source = "const c=require('node:child_process').spawn(process.execPath,['-e',\"setInterval(()=>{},1000)\"],{detached:true,stdio:'ignore'});require('node:fs').writeFileSync('../scratch/child.json',JSON.stringify({pid:c.pid}));setInterval(()=>{},1000)";
  await assert.rejects(runMacosCommand({ root: f.base, runtime: runtime.directory, command: nodeCommand(source), cwd: "", timeoutMs: 10000 }, {
    onSpawn(child) { helper = child.pid; },
    onSettled() { if (descendant) assert.throws(() => process.kill(descendant, 0), error => error.code === "ESRCH"); },
  }), /supervisor failed/);
  assert.ok(descendant);
});

it("macOS command refusal before activation starts no payload and settles the supervisor", native, async t => {
  const f = fixture(t); let started = false, settled = false;
  await assert.rejects(runMacosCommand({ root: f.base, runtime: runtime.directory, command: "printf NEVER", cwd: "", timeoutMs: 1000 }, {
    beforeActivate() { throw new Error("ownership lost"); }, onStarted() { started = true; }, onSettled() { settled = true; },
  }), /ownership lost/);
  assert.equal(started, false); assert.equal(settled, true);
});

it("macOS timeout and output limits end the sandbox without acknowledging command success", native, async t => {
  for (const [command, status, timeoutMs] of [[nodeCommand("setInterval(()=>{},1000)"), "timeout", 300], [nodeCommand("process.stdout.write('x'.repeat(300000))"), "output-limit", 10000]]) {
    const f = fixture(t);
    const result = await runMacosCommand({ root: f.base, runtime: runtime.directory, command, cwd: "", timeoutMs });
    assert.equal(result.status, status); assert.equal(result.quiescent, true);
    assert.equal(result.outputTruncated, status === "output-limit");
  }
});

it("macOS recovery retains ownership after both supervisors die, then ends the recorded sandbox before release", native, async t => {
  const base = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-recovery-test-")), root = path.join(base, "repo");
  const commandRoot = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-command-")), scratch = path.join(commandRoot, "scratch");
  mkdirSync(root); mkdirSync(path.join(commandRoot, "repo")); mkdirSync(scratch);
  execFileSync("git", ["-C", root, "init", "-q"], { stdio: "pipe" });
  const files = stateFiles(gitRoot(root).directory), binding = { root, server: "http://127.0.0.1:1", project: "recovery", configHash: "a".repeat(64), tokenHash: "b".repeat(64) };
  const session = (await startSession(files, binding, { client: "codex", commit: false, propose: false })).session;
  const command = nodeCommand("require('node:fs').writeFileSync('../scratch/payload.json',JSON.stringify({pid:process.pid}));setInterval(()=>{},1000)");
  const driver = `import {runMacosCommand} from ${JSON.stringify(new URL("./macos-commands.mjs", import.meta.url).href)};import {registerChild,settleChild} from ${JSON.stringify(new URL("./local-session.mjs", import.meta.url).href)};const files=${JSON.stringify(files)},binding=${JSON.stringify(binding)},session=${JSON.stringify(session)};await runMacosCommand(${JSON.stringify({ root: commandRoot, runtime: runtime.directory, command, cwd: "", timeoutMs: 30000 })},{onSpawn:value=>registerChild(files,session,binding,value),onSettled:value=>settleChild(files,session,value)});`;
  const host = spawn(process.execPath, ["--input-type=module", "-e", driver], { stdio: "ignore" });
  const ended = new Promise(resolve => host.once("close", resolve));
  let commandIdentity, payload;
  t.after(async () => {
    if (host.exitCode === null && host.signalCode === null) host.kill("SIGKILL");
    await ended;
    if (readState(files)) { await requestStop(files, session); await recoverMacosCommands(files, session); await releaseSession(files, session); }
    if (readState(files) === null) rmSync(base, { recursive: true });
  });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { payload = JSON.parse(readFileSync(path.join(scratch, "payload.json"), "utf8")); commandIdentity = readState(files).lock.children.find(child => child.sandbox); if (commandIdentity) break; } catch { }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(payload?.pid); assert.ok(commandIdentity?.pid);
  process.kill(host.pid, "SIGSTOP"); process.kill(commandIdentity.pid, "SIGKILL"); process.kill(host.pid, "SIGKILL"); await ended;
  assert.equal((await checkSession(files, session, binding)).event, "owned");
  assert.equal(readState(files).lock.schemaVersion, 2);
  await requestStop(files, session);
  assert.equal((await releaseSession(files, session, { abandoned: true })).code, "quiescence-required");
  await recoverMacosCommands(files, session);
  assert.throws(() => process.kill(payload.pid, 0), error => error.code === "ESRCH");
  assert.equal((await releaseSession(files, session)).event, "released");
});
