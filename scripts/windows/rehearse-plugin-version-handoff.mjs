import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

if (process.platform !== "win32") throw new Error("A real Windows host is required");
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--previous", "--current", "--output"].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error("Expected previous/current installed roots and a new output directory");
  options[args[i]] = path.resolve(args[i + 1]);
}
if (Object.keys(options).length !== 3 || fs.existsSync(options["--output"])) throw new Error("Three directories including a new output directory are required");
const digest = value => createHash("sha256").update(value).digest("hex");
function verify(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "windows-package.json"), "utf8"));
  assert.equal(manifest.format, "stagekeeper-windows-plugin-v1");
  assert.equal(manifest.files, manifest.inventory.length);
  assert.equal(digest(JSON.stringify(manifest.inventory)), manifest.packageSha256);
  for (const [name, checksum] of manifest.inventory) {
    const file = path.resolve(root, name), relative = path.relative(root, file);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    assert.equal(digest(fs.readFileSync(file)), checksum, name);
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin/plugin.json"), "utf8")).version;
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin/plugin.json"), "utf8")).version, version);
  return { version, files: manifest.files, packageSha256: manifest.packageSha256, sourceRevision: manifest.sourceRevision };
}
const previous = options["--previous"], current = options["--current"], output = options["--output"];
const identities = { previous: verify(previous), current: verify(current) };
assert.notEqual(identities.previous.version, identities.current.version);
fs.mkdirSync(output);
const root = path.join(output, "handoff's repository"); fs.mkdirSync(root);
execFileSync("git", ["init", "--quiet", "--initial-branch=main", root], { windowsHide: true });
const token = `hu_${"a".repeat(43)}`, config = { version: 1, project: { owner: "owner", repo: "repo", branch: "main", slug: "owner-repo" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] };
fs.writeFileSync(path.join(root, "harness.json"), JSON.stringify(config));
fs.writeFileSync(path.join(root, "CLAUDE.md"), '<!-- harness:runbook:start -->\nThis document is runbook version `012345abcdef`.\n<!-- harness:runbook:end -->\n');
for (const args of [["config", "user.name", "Runtime contract fixture"], ["config", "user.email", "fixture@example.invalid"], ["add", "harness.json", "CLAUDE.md"], ["commit", "--quiet", "-m", "Create owned runtime fixture"]]) execFileSync("git", ["-C", root, ...args], { windowsHide: true });
const calls = [];
const server = http.createServer(async (request, response) => {
  try {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    let text = ""; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text);
    if (request.url === "/api/runner") { calls.push(`runner:${body.op}`); response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ ok: true, paused: false })); return; }
    assert.equal(body.method, "tools/call"); assert.ok(["project_get", "pipeline_next"].includes(body.params.name));
    calls.push(body.params.name);
    response.setHeader("content-type", "application/json");
    const value = body.params.name === "project_get" ? { available: true, owner: "owner", repo: "repo", slug: "owner-repo" } : { head: { action: "none", reason: "No work." }, items: [] };
    response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(value) }] } }));
  } catch { response.statusCode = 500; response.end("{}"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(HARNESS_|STAGEKEEPER_TEST_|GIT_CONFIG|NODE_OPTIONS$|PATH$)/i.test(key)));
env.PATH = `${process.env.SystemRoot}/System32;${process.env.SystemRoot};${process.env.SystemRoot}/System32/WindowsPowerShell/v1.0;${process.env.ProgramFiles}/Git/cmd`;
env.HARNESS_TOKEN = token; env.HARNESS_SERVER = `http://127.0.0.1:${server.address().port}`;
env.STAGEKEEPER_TEST_CLAUDE = path.join(output, "permission-probe.mjs");
fs.writeFileSync(env.STAGEKEEPER_TEST_CLAUDE, 'if(process.argv[3]!=="Reply with OK.")throw new Error("Unexpected model task");process.stdout.write(JSON.stringify({type:"system",subtype:"init",permissionMode:"auto"})+"\\n");setTimeout(()=>{},30000);');
let globalNode = true;
try { execFileSync(path.join(process.env.SystemRoot, "System32/where.exe"), ["node"], { env, windowsHide: true, stdio: "ignore" }); } catch { globalNode = false; }
assert.equal(globalNode, false);
const powershell = path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
async function command(bundle, args, task = "session") {
  const child = spawn(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(bundle, "bin/harness.ps1"), task, "--root", root, ...args], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", data => { stdout += data; }); child.stderr.on("data", data => { stderr += data; });
  const timer = setTimeout(() => child.kill(), 30000);
  try {
    const code = await new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
    assert.equal(stderr, "");
    const event = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)); assert.equal(code, event.event === "error" ? 1 : 0);
    return event;
  } finally { clearTimeout(timer); }
}
const modules = new Map();
for (const bundle of [previous, current]) modules.set(bundle, await import(pathToFileURL(path.join(bundle, "runtime/local-session.mjs")).href));
const files = modules.get(current).stateFiles(path.join(root, ".git/harness"));
const snapshot = () => [files.lock, files.policy].map(file => fs.readFileSync(file, "utf8"));
const start = bundle => command(bundle, ["--start", "--client", "claude", "--commit", "no", "--propose", "no"]);
const operate = (bundle, mode, session) => command(bundle, [`--${mode}`, "--session", session]);
const rows = [], residentRows = []; let ownedChild, ownedResident;
async function until(predicate) {
  const deadline = Date.now() + 30000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("Owned process checkpoint timed out"); await delay(50); }
}
try {
  for (const [owner, controller] of [[previous, current], [current, previous]]) {
    const ownerModule = modules.get(owner), event = await start(owner); assert.equal(event.event, "started");
    const session = event.session;
    assert.equal((await operate(controller, "check", session)).event, "owned");
    const beforeConflict = snapshot(); assert.equal((await start(controller)).event, "locked"); assert.deepEqual(snapshot(), beforeConflict);
    ownedChild = spawn(path.join(owner, "runtime/windows/node/node.exe"), ["-e", "process.stdout.write('ready');setTimeout(()=>{},30000)"], { env, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const closed = new Promise((resolve, reject) => { ownedChild.once("close", resolve); ownedChild.once("error", reject); });
    await new Promise(resolve => ownedChild.stdout.once("data", resolve));
    const child = { pid: ownedChild.pid, nonce: randomUUID() }, binding = ownerModule.readState(files).lock.binding;
    await ownerModule.registerChild(files, session, binding, child);
    assert.equal((await operate(controller, "stop", session)).event, "stopping");
    for (const bundle of [owner, controller]) assert.equal((await operate(bundle, "release", session)).code, "quiescence-required");
    ownedChild.kill(); await closed; ownedChild = null;
    for (const bundle of [owner, controller]) assert.equal((await operate(bundle, "release", session)).code, "quiescence-required");
    assert.equal((await ownerModule.settleChild(files, session, child)).event, "settled");
    assert.equal((await operate(controller, "release", session)).event, "released");
    const successor = await start(controller); assert.equal(successor.event, "started");
    const beforeStale = snapshot();
    for (const mode of ["stop", "release"]) assert.equal((await operate(owner, mode, session)).event, "replaced");
    assert.equal((await ownerModule.settleChild(files, session, child)).event, "replaced"); assert.deepEqual(snapshot(), beforeStale);
    assert.equal((await operate(controller, "stop", successor.session)).event, "stopping");
    assert.equal((await operate(controller, "release", successor.session)).event, "released");
    rows.push({ owner: verify(owner).version, controller: verify(controller).version, check: true, duplicateStartRefused: true, liveChildReleaseRefused: true,
      deadUnsettledChildReleaseRefused: true, acknowledgedRelease: true, lateStopReleaseSettlementPreservedSuccessor: true });
  }
  for (const [owner, controller] of [[previous, current], [current, previous]]) {
    const started = await command(owner, ["--start", "--propose", "no", "--interval", "0.2"], "background"); assert.equal(started.event, "started");
    const state = modules.get(owner).readState(files); ownedResident = state.lock.poller.pid;
    assert.equal((await command(controller, ["--start", "--propose", "no"], "background")).code, "locked");
    assert.equal((await command(controller, ["--status"], "background")).running, true);
    assert.ok(["stopping", "stopped"].includes((await command(controller, ["--stop"], "background")).event));
    await until(() => !modules.get(owner).isAlive(ownedResident) && !fs.existsSync(files.lock) && !fs.existsSync(files.policy));
    ownedResident = null;
    residentRows.push({ owner: verify(owner).version, controller: verify(controller).version, duplicateStartRefused: true, statusRecognized: true, crossVersionStop: true, pollerAndStateGone: true });
  }
  fs.writeFileSync(files.lock, "injected-invalid-json"); fs.writeFileSync(files.policy, "injected-invalid-json");
  const corrupt = snapshot();
  for (const bundle of [previous, current]) { assert.equal((await start(bundle)).event, "error"); assert.deepEqual(snapshot(), corrupt); }
  fs.unlinkSync(files.lock); fs.unlinkSync(files.policy);
  assert.equal(fs.existsSync(files.guard), false); assert.equal(fs.existsSync(files.lock), false); assert.equal(fs.existsSync(files.policy), false);
  const result = { schema: 1, result: "PASS", scope: "same-PC installed-version session and Claude idle resident contracts; model-free loopback server", identities, globalNodeOnPath: false,
    rows, residentRows, corruptStatePreserved: true, serverCalls: calls.length, modelStarts: 0, remainingOwnedProcesses: 0, remainingLocks: 0, mixedHostAcceptance: false };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result));
} finally {
  if (ownedChild && ownedChild.exitCode === null) ownedChild.kill();
  if (ownedResident && modules.get(current).isAlive(ownedResident)) {
    await command(current, ["--stop"], "background");
    await until(() => !modules.get(current).isAlive(ownedResident));
  }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
