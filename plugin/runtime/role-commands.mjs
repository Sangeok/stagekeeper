import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const helperSources = Object.fromEntries(["role-process.ps1", "RoleProcess.cs"].map(name => [name, readFileSync(new URL(`./windows/${name}`, import.meta.url))]));
const bundlePath = fileURLToPath(new URL("./windows/node/", import.meta.url));
const omittedName = name => [".git", ".codex", ".claude", ".next"].includes(name.toLowerCase()) || /^\.env(?:$|\.)/i.test(name) && name.toLowerCase() !== ".env.example";
const identity = stat => process.platform === "win32" ? String(stat.ino) : `${stat.dev}:${stat.ino}`;

export const roleCommandTool = {
  name: "role_command_exec",
  description: "Execute a Windows command in fresh disposable snapshots of permitted repository and role scratch files. Use relative paths; cwd is relative to the repository. STAGEKEEPER_ROLE_SCRATCH points to the copied scratch. Build outputs and edits stay in the snapshots and are discarded. Owner authentication, Git metadata, .env files, foreign workspaces and network access are unavailable. Every result identifies its snapshot; timeout/stopped/truncated results are never success. No original writes occur.",
  inputSchema: { type: "object", properties: { command: { type: "string", minLength: 1, maxLength: 4096 }, cwd: { type: "string" }, timeoutMs: { type: "integer", minimum: 100, maximum: 120000 } }, required: ["command"], additionalProperties: false },
};

// Package provenance is captured before starting a model. A project cannot replace
// a manifest, helper source or executable to acquire a privileged process launcher.
export function installedWindowsRuntime(directory = bundlePath) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "provenance.json"), "utf8"));
  if (manifest.format !== "stagekeeper-windows-node-v1" || manifest.version !== "22.23.3" || manifest.architecture !== "x64"
    || manifest.sourceSha256 !== "9436c81b284889303d39f5b8bd629bf19e790c665ccb94b4994aa87220d9799a"
    || manifest.pipeBackport !== "https://github.com/libuv/libuv/pull/5181" || !/^[a-f0-9]{64}$/.test(manifest.executableSha256)
    || !/^[a-f0-9]{64}$/.test(manifest.packageSha256 ?? "")) throw new Error("Native runtime provenance differs");
  return Object.freeze({ ...manifest, directory: path.resolve(directory) });
}

export async function snapshotRepository(root, destination, fileBroker, signal) {
  const hashes = [], omitted = []; let bytes = 0, count = 0, omittedCount = 0;
  const started = Date.now();
  async function visit(directory, relative = "") {
    signal?.throwIfAborted();
    if (Date.now() - started > 120000) throw new Error("Snapshot preparation deadline exceeded");
    fileBroker.resolveRead(directory);
    const entries = (await readdir(directory)).sort();
    for (const name of entries) {
      signal?.throwIfAborted();
      const source = path.join(directory, name), rel = path.join(relative, name), target = path.join(destination, rel);
      if (omittedName(name) || fileBroker.permission(source) === "deny") { omittedCount++; if (omitted.length < 200) omitted.push(rel); continue; }
      fileBroker.resolveRead(source);
      const before = lstatSync(source, { bigint: true });
      if (before.isDirectory()) { await mkdir(target, { recursive: true }); await visit(source, rel); continue; }
      if (!before.isFile() || before.size > 64n * 1024n * 1024n || ++count > 100000 || (bytes += Number(before.size)) > 2 * 1024 * 1024 * 1024) throw new Error("Snapshot size or file type unsupported");
      const input = await open(source, "r"), digest = createHash("sha256"); let output;
      try {
        output = await open(target, "wx", 0o600);
        if (identity(await input.stat({ bigint: true })) !== identity(before)) throw new Error("Snapshot file changed while opening");
        const buffer = Buffer.alloc(1024 * 1024); let length = 0;
        while (true) {
          signal?.throwIfAborted();
          const { bytesRead } = await input.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
          if ((length += bytesRead) > Number(before.size)) throw new Error("Snapshot file grew while reading");
          digest.update(buffer.subarray(0, bytesRead));
          let offset = 0; while (offset < bytesRead) offset += (await output.write(buffer, offset, bytesRead - offset, null)).bytesWritten;
        }
        fileBroker.resolveRead(source); const after = lstatSync(source, { bigint: true });
        if (length !== Number(before.size) || identity(after) !== identity(before) || after.mtimeNs !== before.mtimeNs || after.size !== before.size) throw new Error("Snapshot source changed during copy");
        hashes.push([rel.split(path.sep).join("/"), digest.digest("hex")]);
      } finally { await input.close(); await output?.close(); }
    }
  }
  await mkdir(destination, { recursive: true }); await visit(root);
  return { snapshotHash: hash(JSON.stringify(hashes)), files: count, bytes, omitted, omittedCount, omissionsTruncated: omittedCount > omitted.length };
}

async function copyRuntime(runtime, destination, signal) {
  const files = [];
  async function visit(directory, relative = "") {
    signal?.throwIfAborted();
    for (const name of (await readdir(directory)).sort()) {
      const source = path.join(directory, name), rel = path.join(relative, name), target = path.join(destination, rel), stat = lstatSync(source);
      if (stat.isSymbolicLink() || realpathSync(source).toLowerCase() !== path.resolve(source).toLowerCase() || stat.isFile() && stat.nlink !== 1) throw new Error("Runtime alias refused");
      if (name === "provenance.json" && !relative) continue;
      if (stat.isDirectory()) { await mkdir(target); await visit(source, rel); }
      else {
        if (!stat.isFile() || stat.size > 128 * 1024 * 1024 || files.length > 20000) throw new Error("Runtime package unsupported");
        const data = readFileSync(source), digest = hash(data); files.push([rel.split(path.sep).join("/"), digest]);
        if (rel === "node.exe" && digest !== runtime.executableSha256) throw new Error("Runtime executable changed");
        await writeFile(target, data, { flag: "wx" });
      }
    }
  }
  await mkdir(destination); await visit(runtime.directory);
  if (hash(JSON.stringify(files)) !== runtime.packageSha256) throw new Error("Runtime package changed");
  await writeFile(path.join(destination, "npm.cmd"), '@echo off\r\n"%~dp0node.exe" "%~dp0npm\\bin\\npm-cli.js" %*\r\n', { flag: "wx" });
}

export async function runNativeCommand(request, { signal, onSpawn = async () => {}, beforeActivate = async () => {}, onSettled = async () => {} } = {}) {
  if (process.platform !== "win32") throw new Error("Windows native backend required");
  signal?.throwIfAborted();
  for (const [name, source] of Object.entries(helperSources)) await writeFile(path.join(request.root, name), source, { flag: "wx" });
  const nonce = randomUUID(), requestFile = path.join(request.root, "request.json");
  await writeFile(requestFile, JSON.stringify({ ...request, nonce }), { flag: "wx" });
  const executable = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  const child = spawn(executable, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(request.root, "role-process.ps1"), "-RequestPath", requestFile],
    { cwd: request.root, windowsHide: true, env: { SystemRoot: process.env.SystemRoot ?? "C:\\Windows", TEMP: request.root, TMP: request.root }, stdio: ["pipe", "pipe", "pipe"] });
  const identity = { pid: child.pid, nonce }; let stdout = "", stderrBytes = 0, activated = false, registered = false;
  const stop = () => { if (!child.stdin.destroyed) child.stdin.end("stop\n"); };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; if (Buffer.byteLength(stdout) > 512 * 1024) { stop(); child.kill(); } });
  child.stderr.on("data", chunk => { stderrBytes += chunk.length; if (stderrBytes > 8192) { stop(); child.kill(); } });
  child.stdin.on("error", () => {});
  const ended = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, terminalSignal) => resolve({ code, terminalSignal })); });
  void ended.catch(() => {}); signal?.addEventListener("abort", stop, { once: true });
  let timer, ownershipTimer, ownershipPending, monitorStopped = false;
  async function monitorOwnership() {
    try { await beforeActivate(); } catch { stop(); }
    if (!monitorStopped) ownershipTimer = setTimeout(() => { ownershipPending = monitorOwnership(); }, 200);
  }
  try {
    if (!child.pid) throw new Error("Native helper did not start");
    await onSpawn(identity); registered = true;
    await beforeActivate();
    signal?.throwIfAborted(); child.stdin.write("start\n"); activated = true;
    ownershipTimer = setTimeout(() => { ownershipPending = monitorOwnership(); }, 200);
    const terminal = await Promise.race([ended, new Promise((_, reject) => { timer = setTimeout(() => { stop(); child.kill(); reject(new Error("Native helper did not acknowledge termination; ownership retained")); }, request.timeoutMs + 45000); })]);
    if (terminal.code !== 0 || terminal.terminalSignal) throw new Error("Native helper ended without acknowledgement; ownership retained");
    const result = JSON.parse(stdout.trim());
    if (result.nonce !== nonce || result.quiescent !== true || !["exited", "timeout", "stopped", "output-limit"].includes(result.status)
      || !Number.isInteger(result.exitCode) || typeof result.stdout !== "string" || typeof result.stderr !== "string" || typeof result.outputTruncated !== "boolean") throw new Error("Native helper acknowledgement differs; ownership retained");
    await onSettled(identity); registered = false; return result;
  } finally {
    monitorStopped = true; clearTimeout(ownershipTimer); await ownershipPending;
    clearTimeout(timer); signal?.removeEventListener("abort", stop); stop();
    if (!activated) { child.kill(); await ended; if (registered) await onSettled(identity); }
  }
}

export async function verifyNativeRuntime(runtime, lifecycle = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "harness-command-preflight-"));
  let connections = 0, listener, acknowledged = false, helperStarted = false; const sockets = new Set();
  try {
    await mkdir(path.join(directory, "repo")); await mkdir(path.join(directory, "scratch"));
    await writeFile(path.join(directory, "repo/allowed.txt"), "ALLOWED_CANARY");
    await writeFile(path.join(directory, "external.txt"), "EXTERNAL_CANARY");
    await copyRuntime(runtime, path.join(directory, "runtime"));
    listener = createServer(socket => { connections++; sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.end(); });
    await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
    const probe = `const fs=require('node:fs'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
assert.equal(fs.readFileSync('allowed.txt','utf8'),'ALLOWED_CANARY');fs.writeFileSync('../scratch/ready.txt','READY');
for(const target of ['../external.txt','../boundary/aap-only.txt']) assert.throws(()=>fs.readFileSync(target));
assert.throws(()=>fs.readdirSync(require('node:path').parse(${JSON.stringify(directory)}).root));
assert.equal(fs.realpathSync('allowed.txt').endsWith('allowed.txt'),true);
for(const name of ['HARNESS_TOKEN','HARNESS_ROLE_CAPABILITY','NODE_OPTIONS','CODEX_HOME','OPENAI_API_KEY'])assert.equal(process.env[name],undefined);
const childCode="const fs=require('node:fs'),a=require('node:assert/strict'),net=require('node:net');for(const p of ['../external.txt','../boundary/aap-only.txt'])a.throws(()=>fs.readFileSync(p));const s=net.connect({host:'127.0.0.1',port:${listener.address().port}});s.setTimeout(2000);s.on('connect',()=>process.exit(1));s.on('timeout',()=>process.exit(1));s.on('error',e=>{a.equal(e.code,'EACCES');console.log('CHILD_READY')});";
const r=cp.spawnSync(process.execPath,['-e',childCode],{encoding:'utf8',timeout:3000});assert.equal(r.status,0);assert.equal(r.stdout.trim(),'CHILD_READY');
const socket=net.connect({host:'127.0.0.1',port:${listener.address().port}});socket.setTimeout(2000);socket.on('connect',()=>{console.error('NETWORK_ALLOWED');process.exit(1)});socket.on('timeout',()=>{console.error('NETWORK_NOT_PROVEN');process.exit(1)});socket.on('error',error=>{assert.equal(error.code,'EACCES');console.log('harness-native-command-ready')});`;
    await writeFile(path.join(directory, "repo/probe.cjs"), probe);
    helperStarted = true;
    const result = await runNativeCommand({ root: directory, command: "node probe.cjs", cwd: "", timeoutMs: 10000 }, lifecycle);
    acknowledged = true;
    if (result.status !== "exited" || result.exitCode !== 0 || result.outputTruncated || result.stdout.trim() !== "harness-native-command-ready" || connections !== 0
      || readFileSync(path.join(directory, "external.txt"), "utf8") !== "EXTERNAL_CANARY") throw new Error("Native command isolation preflight failed");
    return { event: "native-command-ready", runtimeSha256: runtime.executableSha256 };
  } finally {
    for (const socket of sockets) socket.destroy(); if (listener?.listening) await new Promise(resolve => listener.close(resolve));
    if ((!helperStarted || acknowledged) && realpathSync(directory) === directory) await rm(directory, { recursive: true });
  }
}

export async function createRoleCommands({ root, scratch, agent, fileBroker, runtime = installedWindowsRuntime() }, lifecycle = {}) {
  if (agent === "pm") throw new Error("PM command backend refused");
  let closed = false, pending = null; const controller = new AbortController();
  async function execute(args, signal) {
    if (closed || !args || Array.isArray(args) || Object.keys(args).some(key => !["command", "cwd", "timeoutMs"].includes(key))
      || typeof args.command !== "string" || !args.command.trim() || args.command.length > 4096 || args.command.includes("\0")) throw new Error("Invalid native command");
    const cwd = args.cwd ?? "", timeoutMs = args.timeoutMs ?? 60000;
    if (typeof cwd !== "string" || path.isAbsolute(cwd) || /[<>:"|?*\x00-\x1f]/.test(cwd) || cwd.split(/[\\/]/).some(part => [".", ".."].includes(part) || /[. ]$/.test(part))
      || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error("Invalid native command bounds");
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    combined.throwIfAborted();
    const directory = await mkdtemp(path.join(tmpdir(), "harness-command-"));
    const own = randomUUID(); await writeFile(path.join(directory, "owner.json"), JSON.stringify({ own }), { flag: "wx" });
    let acknowledged = false, helperStarted = false;
    try {
      const snapshot = await snapshotRepository(root, path.join(directory, "repo"), fileBroker, combined);
      if (cwd && !lstatSync(fileBroker.resolveRead(path.resolve(root, cwd))).isDirectory()) throw new Error("Command workspace directory required");
      const scratchSnapshot = scratch ? await snapshotRepository(scratch, path.join(directory, "scratch"), fileBroker, combined) : null;
      if (!scratchSnapshot) await mkdir(path.join(directory, "scratch"));
      await copyRuntime(runtime, path.join(directory, "runtime"), combined);
      helperStarted = true;
      const result = await runNativeCommand({ root: directory, command: args.command, cwd: cwd.replaceAll("/", "\\"), timeoutMs }, { ...lifecycle, signal: combined });
      acknowledged = true;
      return { ...result, nonce: undefined, ...snapshot, repositorySnapshotHash: snapshot.snapshotHash, scratchSnapshot,
        snapshotHash: hash(JSON.stringify([snapshot.snapshotHash, scratchSnapshot?.snapshotHash ?? null])), snapshotWrites: "discarded", originalRepositoryWrites: false };
    } finally {
      // Failed acknowledgements preserve the owned directory for explicit recovery.
      if ((!helperStarted || acknowledged) && realpathSync(directory) === directory && JSON.parse(readFileSync(path.join(directory, "owner.json"), "utf8")).own === own) await rm(directory, { recursive: true });
    }
  }
  return { tools: [...fileBroker.tools, roleCommandTool],
    call(name, args, signal) {
      if (closed) throw new Error("Native backend closed");
      if (name !== roleCommandTool.name) return fileBroker.call(name, args);
      if (pending) throw new Error("Native command already pending");
      pending = execute(args, signal).finally(() => { pending = null; }); return pending;
    },
    async close() { closed = true; controller.abort(); try { await pending; } finally { fileBroker.close(); } },
  };
}
