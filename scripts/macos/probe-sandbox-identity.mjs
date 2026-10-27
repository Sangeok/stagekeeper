import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("A real macOS kernel is required");
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error("A new evidence JSON path is required");
const parent = fs.realpathSync(os.tmpdir()), root = fs.realpathSync(fs.mkdtempSync(path.join(parent, "stagekeeper-identity-")));
const at = (...parts) => path.join(root, ...parts);
for (const name of ["runtime", "snapshot", "scratch", "checkout", "foreign", "outside", "nonce"]) fs.mkdirSync(at(name));
fs.writeFileSync(at("foreign", "secret"), "owned-denial-canary");
const nonce = () => { const file = at("nonce", randomUUID()); fs.writeFileSync(file, "nonce"); return file; };
const [allowed, denied, controlAllowed, controlDenied] = [nonce(), nonce(), nonce(), nonce()];
const node = at("runtime", "node"), child = at("runtime", "child.mjs"), scanner = at("scanner");
const source = fileURLToPath(new URL("./probe-sandbox-identity.c", import.meta.url));
fs.copyFileSync(process.execPath, node); fs.chmodSync(node, 0o755);
fs.copyFileSync(fileURLToPath(new URL("./probe-sandbox-identity-child.mjs", import.meta.url)), child);
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const options = { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 };
const hopperSource = fileURLToPath(new URL("./probe-sandbox-identity-hopper.c", import.meta.url)), hopper = at("runtime", "hopper");
for (const [input, binary] of [[source, scanner], [hopperSource, hopper]]) execFileSync("/usr/bin/xcrun", ["clang", "-std=c11", "-Wall", "-Wextra", "-Werror", input, "-o", binary], options);
const quote = value => JSON.stringify(value);
const readable = ["/System", "/usr/lib", "/usr/share", "/Library/Apple/System/Library", "/bin", "/usr/bin", "/usr/sbin", "/private/var/select", "/private/etc"];
const profile = (allow, deny) => `(version 1)
(deny default)
(allow process-exec process-fork)
(allow signal (target same-sandbox))
(allow process-info* (target same-sandbox))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* (literal "/"))
(allow file-map-executable (subpath "/System") (subpath "/usr/lib") (subpath "/Library/Apple") (subpath "/bin") (subpath "/usr/bin") (subpath "/usr/sbin") (subpath ${quote(at("runtime"))}))
(allow system-mac-syscall (mac-policy-name "vnguard"))
(allow system-mac-syscall (require-all (mac-policy-name "Sandbox") (mac-syscall-number 67)))
(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))
(allow file-read* ${readable.map(entry => `(subpath ${quote(entry)})`).join(" ")} (subpath ${quote(at("runtime"))}) (subpath ${quote(at("snapshot"))}) (subpath ${quote(at("scratch"))}) (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random") (literal ${quote(allow)}))
(allow file-write* (subpath ${quote(at("snapshot"))}) (subpath ${quote(at("scratch"))}) (literal "/dev/null"))
(deny file-read* (literal ${quote(deny)}))
`;
fs.writeFileSync(at("runtime", "run.sb"), profile(allowed, denied));
fs.writeFileSync(at("runtime", "control.sb"), profile(controlAllowed, controlDenied));
const env = { PATH: at("runtime"), HOME: at("scratch"), TMPDIR: at("scratch"), LANG: "C", LC_ALL: "C" };
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
async function until(predicate, ms, stage) {
  const deadline = Date.now() + ms;
  for (;;) {
    try { if (predicate()) return; } catch { }
    if (Date.now() >= deadline) throw new Error(`Probe did not reach ${stage}`);
    await delay(100);
  }
}
const readJson = name => JSON.parse(fs.readFileSync(at("scratch", name), "utf8"));
const lines = name => fs.existsSync(at("scratch", name)) ? fs.readFileSync(at("scratch", name), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
const pgrep = name => spawnSync("/usr/bin/pgrep", ["-x", name]).status === 0;
const beating = async name => {
  const read = () => { try { return fs.readFileSync(at("scratch", name), "utf8"); } catch { return null; } };
  const first = read();
  await delay(800);
  const second = read();
  return first !== null && second !== null && first !== second;
};
const describe = pids => pids.length ? spawnSync("/bin/ps", ["-o", "pid=,ppid=,pgid=,stat=,comm=", "-p", pids.slice(0, 20).join(",")], { encoding: "utf8" }).stdout.trim().split("\n") : [];
const label = `dev.stagekeeper.escape.${randomUUID()}`, agent = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const cronBefore = spawnSync("/usr/bin/crontab", ["-l"], { encoding: "utf8" });
const calculatorBefore = pgrep("Calculator");
const listener = net.createServer(socket => socket.destroy());
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const scan = (mode, nonces = [allowed, denied]) => JSON.parse(execFileSync(scanner, [...nonces, mode === "scan" ? "1" : "100", mode], options));
const SURVIVORS = ["detached", "attacker", "spawner", "orphan", "exec"];
const oracle = () => Object.fromEntries(["leader", ...SURVIVORS].map(kind => [kind, readJson(kind === "leader" ? "leader.json" : `oracle-${kind}.json`).pid]));
const known = () => new Set([...Object.values(oracle()), ...lines("spawned.jsonl").map(entry => entry.pid)].filter(Number.isSafeInteger));
const summary = result => ({ quiescent: result.quiescent, selfSandboxed: result.selfSandboxed, noReport: result.noReport,
  rounds: result.rounds.map(({ matches, ...round }) => ({ ...round, matched: matches.length })) });
let leader, closed, plain, controlPid, stderr = "";
const progress = { stage: "setup" };
async function observe(stage) {
  progress.stage = stage;
  const before = known(), result = scan("scan");
  await delay(300);
  const after = known(), matches = result.rounds.flatMap(round => round.matches), controls = [plain.pid, controlPid];
  const missing = [...before].filter(pid => alive(pid) && !matches.includes(pid)), unknown = matches.filter(pid => !after.has(pid));
  return { ...summary(result), matched: matches.length, missing, unknown, controlsMatched: controls.filter(pid => matches.includes(pid)),
    missingProcesses: describe(missing), unknownProcesses: describe(unknown) };
}
try {
  plain = spawn("/bin/sleep", ["300"], { detached: true, stdio: "ignore" }); plain.unref();
  const other = spawn("/usr/bin/sandbox-exec", ["-f", at("runtime", "control.sb"), node, child, "survivor", root, "control"], { cwd: at("snapshot"), env, detached: true, stdio: "ignore" });
  other.unref();
  fs.writeFileSync(at("runtime", "attack.json"), JSON.stringify({ port: listener.address().port, control: plain.pid, label, home: os.homedir() }));
  leader = spawn("/usr/bin/sandbox-exec", ["-f", at("runtime", "run.sb"), node, child, "leader", root], { cwd: at("snapshot"), env, detached: true, stdio: ["ignore", "ignore", "pipe"] });
  leader.stderr.on("data", data => { stderr += data; });
  closed = new Promise(resolve => leader.once("close", resolve));
  progress.stage = "survivor start";
  await until(() => known().size >= SURVIVORS.length + 6 && Number.isSafeInteger(readJson("oracle-control.json").pid), 30000, "survivor start");
  controlPid = readJson("oracle-control.json").pid;
  progress.baseline = await observe("baseline scan");
  progress.stage = "group kill";
  process.kill(-leader.pid, "SIGKILL"); await closed;
  progress.survivorsAfterGroupKill = Object.fromEntries(SURVIVORS.map(kind => [kind, alive(oracle()[kind])]));
  progress.afterLeader = await observe("scan after group kill");
  progress.stage = "survivor attacks";
  fs.writeFileSync(at("scratch", "released"), "released");
  await until(() => fs.existsSync(at("scratch", "attacks.json")) && readJson("attacks.json"), 120000, "survivor attacks");
  await delay(5000);
  progress.attacks = readJson("attacks.json");
  progress.escapes = {
    checkout: fs.existsSync(at("checkout", "escaped.txt")), launchAgent: fs.existsSync(agent), markers: fs.readdirSync(at("outside")),
    launchdJob: spawnSync("/bin/launchctl", ["list", label]).status === 0,
    crontab: (spawnSync("/usr/bin/crontab", ["-l"], { encoding: "utf8" }).stdout ?? "").includes(child),
    calculator: !calculatorBefore && pgrep("Calculator"), controlAlive: alive(plain.pid),
  };
  progress.stage = "hopper A start";
  await until(() => Number.isSafeInteger(readJson("hopper.json").pid), 30000, "hopper A start");
  await delay(1500);
  progress.hopper = { a: { before: await beating("hopper-a.beat") } };
  progress.stage = "kill until first empty scan";
  const killLoop = scan("kill");
  progress.killLoop = summary(killLoop);
  await until(() => [...known()].every(pid => !alive(pid)), 15000, "survivor exit").catch(() => {});
  progress.remaining = describe([...known()].filter(alive));
  progress.hopper.a.after = await beating("hopper-a.beat");
  progress.finalScan = summary(scan("scan"));
  progress.controlsAlive = [plain.pid, controlPid].map(alive);
  const quiesced = killLoop.quiescent && progress.remaining.length === 0 && !progress.hopper.a.after && progress.finalScan.quiescent && progress.controlsAlive.every(Boolean);
  if (progress.hopper.a.after) {
    progress.cleanupA = summary(scan("freeze"));
    progress.hopper.a.afterCleanup = await beating("hopper-a.beat");
  }
  progress.stage = "hopper B start";
  const second = spawn("/usr/bin/sandbox-exec", ["-f", at("runtime", "run.sb"), hopper, at("scratch", "hopper-b.beat")], { cwd: at("snapshot"), env, detached: true, stdio: "ignore" });
  second.unref();
  await delay(1500);
  progress.hopper.b = { before: await beating("hopper-b.beat") };
  progress.stage = "freeze until three empty scans";
  const freezeLoop = scan("freeze");
  progress.freezeLoop = summary(freezeLoop);
  progress.hopper.b.after = await beating("hopper-b.beat");
  progress.finalAfterFreeze = summary(scan("scan"));
  progress.controlsAliveAfterFreeze = [plain.pid, controlPid].map(alive);
  const freezeQuiesced = progress.hopper.b.before && freezeLoop.quiescent && !progress.hopper.b.after && progress.finalAfterFreeze.quiescent
    && progress.controlsAliveAfterFreeze.every(Boolean);
  progress.spawned = lines("spawned.jsonl").length;
  progress.spawnErrors = lines("errors.jsonl");
  const attacks = progress.attacks, escapes = progress.escapes;
  progress.verdict = {
    confined: ["writeCheckout", "readSecret", "writeLaunchAgent", "signalControl"].every(name => attacks[name]?.allowed === false) && attacks.network?.allowed === false
      && !escapes.checkout && !escapes.launchAgent && escapes.markers.length === 0 && !escapes.launchdJob && !escapes.crontab && !escapes.calculator && escapes.controlAlive,
    identified: [progress.baseline, progress.afterLeader].every(check => check.matched > 0 && check.missing.length === 0 && check.unknown.length === 0 && check.controlsMatched.length === 0),
    hopperExercised: progress.hopper.a.before && progress.hopper.b.before, quiesced, freezeQuiesced,
  };
  progress.stage = "complete";
} catch (error) {
  progress.error = String(error?.message ?? error).slice(0, 600);
  throw error;
} finally {
  const sw = spawnSync("/usr/bin/sw_vers", [], { encoding: "utf8" }).stdout ?? "";
  const evidence = { schema: 1, platform: process.platform, arch: process.arch, release: os.release(),
    macos: Object.fromEntries(sw.trim().split("\n").filter(Boolean).map(line => line.split(":").map(part => part.trim()))), node: process.version,
    hashes: { driver: digest(fileURLToPath(import.meta.url)), child: digest(child), source: digest(source), scanner: digest(scanner), hopperSource: digest(hopperSource), profile: digest(at("runtime", "run.sb")) },
    scope: "per-run Seatbelt profile identity scan, detached survivor confinement and kill-until-quiescent on a hosted runner; no model, client credentials or production backend",
    ...progress, leaderStderr: stderr.slice(0, 600), productionBackendEnabled: false };
  if (leader?.pid && alive(leader.pid)) { try { process.kill(-leader.pid, "SIGKILL"); } catch { } }
  for (const nonces of [[allowed, denied], [controlAllowed, controlDenied]]) { try { scan("freeze", nonces); } catch { } }
  spawnSync("/usr/bin/pkill", ["-9", "-x", "hopper"]);
  try { for (const pid of known()) if (alive(pid)) process.kill(pid, "SIGKILL"); } catch { }
  if (plain?.pid && alive(plain.pid)) process.kill(plain.pid, "SIGKILL");
  spawnSync("/bin/launchctl", ["remove", label]);
  if (fs.existsSync(agent)) fs.rmSync(agent);
  if ((spawnSync("/usr/bin/crontab", ["-l"], { encoding: "utf8" }).stdout ?? "") !== (cronBefore.stdout ?? "")) {
    if (cronBefore.status === 0) { fs.writeFileSync(at("cron-restore.txt"), cronBefore.stdout); spawnSync("/usr/bin/crontab", [at("cron-restore.txt")]); }
    else spawnSync("/usr/bin/crontab", ["-r"]);
  }
  if (!calculatorBefore && pgrep("Calculator")) spawnSync("/usr/bin/pkill", ["-x", "Calculator"]);
  if (closed) await closed;
  await new Promise(resolve => listener.close(resolve));
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("stagekeeper-identity-"));
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(JSON.stringify({ verdict: progress.verdict, arch: process.arch }));
assert.equal(progress.verdict.confined, true);
assert.equal(progress.verdict.identified, true);
assert.equal(progress.verdict.hopperExercised, true);
assert.equal(progress.verdict.freezeQuiesced, true);
