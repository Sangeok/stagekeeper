import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { RoleCommandInputError, roleCommandTool, snapshotRepository } from "./role-commands.mjs";
import { installedMacosRuntime, macosDigest } from "./macos-runtime.mjs";
import { endSandbox } from "./macos/sandbox.mjs";

export const macosCommandTool = { ...roleCommandTool,
  description: "Execute a POSIX /bin/sh -c command in fresh disposable snapshots of permitted repository and role scratch files. Node/npm are bundled. Use repository-relative paths; STAGEKEEPER_ROLE_SCRATCH is the copied scratch. All command writes are discarded. Original checkout, Git metadata, owner credentials, .env files, foreign workspaces and network are unavailable. Every result identifies its snapshot. Timeout, stopped, truncated or unconfirmed descendant termination never mean success." };

export async function runMacosCommand(request, { signal, onSpawn = async () => {}, onStarted = async () => {}, beforeActivate = async () => {}, onSettled = async () => {} } = {}) {
  if (process.platform !== "darwin") throw new Error("macOS native backend required");
  signal?.throwIfAborted();
  const nonce = randomUUID(), allowed = path.join(request.root, `allow-${nonce}`), denied = path.join(request.root, `deny-${nonce}`);
  const record = { ...request, nonce, allowed, denied }, requestFile = path.join(request.root, "request.json");
  await writeFile(allowed, nonce, { flag: "wx", mode: 0o600 }); await writeFile(denied, nonce, { flag: "wx", mode: 0o600 });
  await writeFile(requestFile, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  const child = spawn(path.join(request.runtime, "bin/node"), [fileURLToPath(new URL("./macos/role-process.mjs", import.meta.url)), requestFile],
    { cwd: request.root, env: { PATH: "/usr/bin:/bin", HOME: path.join(request.root, "scratch"), TMPDIR: path.dirname(request.root) }, stdio: ["pipe", "pipe", "pipe"] });
  const identity = { pid: child.pid, nonce, sandbox: { kind: "macos-seatbelt-v1", root: request.root } };
  let stdout = "", stderr = "", registered = false, settled = false, activated = false, started = null, terminalError = null;
  let timer, monitor, pending = null;
  const stop = () => { if (!child.stdin.destroyed) child.stdin.end("stop\n"); };
  child.stdout.setEncoding("utf8"); child.stdout.on("data", chunk => {
    stdout += chunk;
    if (!started && stdout.startsWith("__stagekeeper_native_started__\r\n")) { started = Promise.resolve().then(() => onStarted(identity)); void started.catch(stop); }
    if (Buffer.byteLength(stdout) > 512 * 1024) { terminalError = new Error("macOS helper output exceeded its limit"); stop(); }
  });
  child.stderr.on("data", chunk => { if (stderr.length < 8192) stderr += chunk.toString("utf8"); else stop(); });
  child.stdin.on("error", () => {});
  const ended = new Promise(resolve => {
    child.once("error", error => { terminalError = error; resolve(-1); });
    child.once("close", resolve);
  });
  signal?.addEventListener("abort", stop, { once: true });
  try {
    if (!child.pid) throw new Error("macOS command supervisor did not start");
    await onSpawn(identity); registered = true;
    await beforeActivate(); signal?.throwIfAborted();
    child.stdin.write("start\n"); activated = true;
    monitor = setInterval(() => {
      if (pending) return;
      pending = Promise.resolve().then(beforeActivate).catch(error => { terminalError = error; stop(); }).finally(() => { pending = null; });
    }, 200);
    timer = setTimeout(() => { terminalError = new Error("macOS supervisor acknowledgement timed out"); child.kill("SIGKILL"); }, request.timeoutMs + 35000);
    const code = await ended;
    await started;
    if (terminalError) throw terminalError;
    if (code !== 0) throw new Error(`macOS command supervisor failed: ${stderr.slice(0, 500)}`);
    const result = JSON.parse(stdout.replace(/^__stagekeeper_native_started__\r\n/, "").trim());
    if (result.nonce !== nonce || result.quiescent !== true || !["exited", "timeout", "stopped", "output-limit"].includes(result.status)
      || !Number.isInteger(result.exitCode) || typeof result.stdout !== "string" || typeof result.stderr !== "string" || typeof result.outputTruncated !== "boolean") throw new Error("macOS command acknowledgement differs");
    endSandbox(request.root, nonce, path.join(request.runtime, "sandbox-identity"));
    await onSettled(identity); settled = true;
    return result;
  } finally {
    clearTimeout(timer); clearInterval(monitor); await pending;
    signal?.removeEventListener("abort", stop); stop();
    if (!settled) {
      child.kill("SIGKILL"); await ended;
      if (activated) endSandbox(request.root, nonce, path.join(request.runtime, "sandbox-identity"));
      if (registered) await onSettled(identity);
    }
  }
}

export async function verifyMacosRuntime(runtime = installedMacosRuntime(), lifecycle = {}) {
  const directory = await mkdtemp(path.join(realpathSync(tmpdir()), "harness-command-"));
  let connections = 0, listener, complete = false;
  try {
    for (const name of ["repo", "scratch"]) await mkdir(path.join(directory, name));
    await writeFile(path.join(directory, "external.txt"), "EXTERNAL_CANARY");
    await writeFile(path.join(directory, "repo/allowed.txt"), "ALLOWED_CANARY");
    listener = createServer(socket => { connections++; socket.destroy(); });
    await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
    const port = listener.address().port;
    const childProbe = `const fs=require('node:fs'),net=require('node:net'),a=require('node:assert/strict');a.throws(()=>fs.readFileSync('../external.txt'));const s=net.connect({host:'127.0.0.1',port:${port}});s.setTimeout(2000);s.on('connect',()=>process.exit(1));s.on('timeout',()=>process.exit(1));s.on('error',e=>{a.ok(['EPERM','EACCES'].includes(e.code));console.log('CHILD_READY')});`;
    const probe = `const fs=require('node:fs'),cp=require('node:child_process'),net=require('node:net'),a=require('node:assert/strict');
a.equal(fs.readFileSync('allowed.txt','utf8'),'ALLOWED_CANARY');fs.writeFileSync('../scratch/ready','READY');a.throws(()=>fs.readFileSync('../external.txt'));a.throws(()=>fs.writeFileSync('../external.txt','BAD'));a.throws(()=>fs.readdirSync('/Users'));
for(const k of ['HARNESS_TOKEN','HARNESS_ROLE_CAPABILITY','NODE_OPTIONS','CODEX_HOME','OPENAI_API_KEY'])a.equal(process.env[k],undefined);
const child=cp.spawnSync(process.execPath,['-e',${JSON.stringify(childProbe)}],{encoding:'utf8',timeout:3000});a.equal(child.status,0);a.equal(child.stdout.trim(),'CHILD_READY');
const s=net.connect({host:'127.0.0.1',port:${port}});s.setTimeout(2000);s.on('connect',()=>process.exit(1));s.on('timeout',()=>process.exit(1));s.on('error',e=>{a.ok(['EPERM','EACCES'].includes(e.code));console.log('harness-native-command-ready')});`;
    await writeFile(path.join(directory, "repo/probe.cjs"), probe);
    const result = await runMacosCommand({ root: directory, runtime: runtime.directory, command: "node probe.cjs", cwd: "", timeoutMs: 10000 }, lifecycle);
    complete = true;
    if (result.status !== "exited" || result.exitCode !== 0 || result.outputTruncated || result.stdout.trim() !== "harness-native-command-ready" || connections !== 0
      || readFileSync(path.join(directory, "external.txt"), "utf8") !== "EXTERNAL_CANARY") throw new Error("macOS command isolation preflight failed");
    return { event: "native-command-ready", runtimeSha256: runtime.executableSha256 };
  } finally {
    if (listener?.listening) await new Promise(resolve => listener.close(resolve));
    if (complete) await rm(directory, { recursive: true });
  }
}

export async function createMacosCommands({ root, scratch, agent, fileBroker, runtime = installedMacosRuntime() }, lifecycle = {}) {
  if (["pm", "work-assigner", "qa-verifier"].includes(agent)) throw new Error("Role command backend refused");
  let closed = false, pending = null; const controller = new AbortController();
  async function execute(args, signal) {
    if (!args || Array.isArray(args) || Object.keys(args).some(key => !["command", "cwd", "timeoutMs"].includes(key))
      || typeof args.command !== "string" || !args.command.trim() || args.command.length > 4096 || args.command.includes("\0")) throw new RoleCommandInputError("Use only command, optional repository-relative cwd and optional timeoutMs. command must be a nonempty string of at most 4096 characters without null bytes. Save longer scripts in permitted scratch files with role_file_write, then run a short command.");
    const cwd = args.cwd === "." ? "" : args.cwd ?? "", timeoutMs = args.timeoutMs ?? 60000;
    if (typeof cwd !== "string" || path.isAbsolute(cwd) || /[\\\x00-\x1f]/.test(cwd) || cwd.split("/").some(part => [".", ".."].includes(part))
      || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new RoleCommandInputError("cwd must stay inside the repository and timeoutMs must be from 100 through 120000.");
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    combined.throwIfAborted();
    const directory = await mkdtemp(path.join(realpathSync(tmpdir()), "harness-command-"));
    let complete = false;
    try {
      const snapshot = await snapshotRepository(root, path.join(directory, "repo"), fileBroker, combined, { internalSymlinks: true });
      if (cwd && !lstatSync(fileBroker.resolveRead(path.resolve(root, cwd))).isDirectory()) throw new RoleCommandInputError("cwd must name a permitted directory");
      const scratchSnapshot = scratch ? await snapshotRepository(scratch, path.join(directory, "scratch"), fileBroker, combined, { internalSymlinks: true }) : null;
      if (!scratch) await mkdir(path.join(directory, "scratch"));
      const result = await runMacosCommand({ root: directory, runtime: runtime.directory, command: args.command, cwd, timeoutMs }, { ...lifecycle, signal: combined });
      complete = true;
      return { ...result, nonce: undefined, ...snapshot, repositorySnapshotHash: snapshot.snapshotHash, scratchSnapshot,
        snapshotHash: macosDigest(JSON.stringify([snapshot.snapshotHash, scratchSnapshot?.snapshotHash ?? null])), snapshotWrites: "discarded", originalRepositoryWrites: false };
    } finally { if (complete) await rm(directory, { recursive: true }); }
  }
  return { tools: [...fileBroker.tools, macosCommandTool], call(name, args, signal) {
    if (closed) throw new Error("macOS backend closed");
    if (name !== macosCommandTool.name) return fileBroker.call(name, args, signal);
    if (pending) throw new Error("macOS command already pending");
    pending = execute(args, signal).finally(() => { pending = null; }); return pending;
  }, async close() { closed = true; controller.abort(); try { await pending; } finally { await fileBroker.close(); } } };
}
