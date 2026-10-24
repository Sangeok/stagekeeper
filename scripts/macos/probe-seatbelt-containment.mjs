import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("A real macOS kernel is required");
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error("A new evidence JSON path is required");
const parent = fs.realpathSync(os.tmpdir()), root = fs.realpathSync(fs.mkdtempSync(path.join(parent, "stagekeeper-seatbelt-")));
const runtime = path.join(root, "runtime"), scratch = path.join(root, "scratch"), repository = path.join(root, "repository");
for (const name of ["runtime", "scratch", "repository/.git", "foreign", "owner/.codex"]) fs.mkdirSync(path.join(root, name), { recursive: true });
for (const name of ["foreign/secret", "owner/.codex/auth.json", "repository/.git/config", "repository/.env"]) fs.writeFileSync(path.join(root, name), "owned-denial-canary");
fs.writeFileSync(path.join(repository, "allowed.txt"), "allowed");
const node = path.join(runtime, "node"), childScript = path.join(runtime, "probe.mjs");
fs.copyFileSync(process.execPath, node); fs.chmodSync(node, 0o755);
fs.copyFileSync(fileURLToPath(new URL("./probe-seatbelt-child.mjs", import.meta.url)), childScript);
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(digest(node), digest(process.execPath));
const quote = value => JSON.stringify(value);
const policy = `(version 1)
(deny default)
(allow process-exec process-fork)
(allow signal (target same-sandbox))
(allow process-info* (target same-sandbox))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* (literal "/"))
(allow file-map-executable (subpath "/System") (subpath "/usr/lib") (subpath "/Library/Apple") (subpath ${quote(runtime)}))
(allow system-mac-syscall (mac-policy-name "vnguard"))
(allow system-mac-syscall (require-all (mac-policy-name "Sandbox") (mac-syscall-number 67)))
(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))
(allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/Library/Apple/System/Library") (subpath ${quote(runtime)}) (subpath ${quote(repository)}) (subpath ${quote(scratch)}) (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))
(allow file-write* (subpath ${quote(repository)}) (subpath ${quote(scratch)}) (literal "/dev/null"))
(deny file-read* file-write* (subpath ${quote(path.join(repository, ".git"))}) (literal ${quote(path.join(repository, ".env"))}))
`;
const profile = path.join(root, "probe.sb"); fs.writeFileSync(profile, policy);
const env = { PATH: runtime, HOME: scratch, TMPDIR: scratch, LANG: "C", LC_ALL: "C" };
process.env.STAGEKEEPER_PROBE_SECRET = "owned-parent-environment-canary";
const listener = net.createServer(socket => socket.destroy());
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = String(listener.address().port);
let leader, descendantPid, closed, cleanup = false;
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
async function until(predicate, ms = 12000) {
  const deadline = Date.now() + ms;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error("Owned probe did not reach its checkpoint"); await delay(50); }
}
try {
  const boundaries = JSON.parse(execFileSync("/usr/bin/sandbox-exec", ["-f", profile, node, childScript, "parent", root, port], { cwd: repository, env, encoding: "utf8", timeout: 20000 }));
  leader = spawn("/usr/bin/sandbox-exec", ["-f", profile, node, childScript, "leader", root], { cwd: repository, env, detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let stderr = ""; leader.stderr.on("data", data => { stderr += data; });
  closed = new Promise((resolve, reject) => { leader.once("close", resolve); leader.once("error", reject); });
  await until(() => fs.existsSync(path.join(scratch, "detached.json")));
  descendantPid = JSON.parse(fs.readFileSync(path.join(scratch, "detached.json"), "utf8")).pid;
  assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 1 && descendantPid !== leader.pid);
  const descendantGroup = Number(execFileSync("/bin/ps", ["-o", "pgid=", "-p", String(descendantPid)], { encoding: "utf8" }).trim());
  assert.equal(descendantGroup, descendantPid);
  process.kill(-leader.pid, "SIGKILL"); await closed;
  assert.equal(stderr, "");
  const detachedChildSurvivesGroupKill = alive(descendantPid);
  assert.equal(detachedChildSurvivesGroupKill, true, "Reassess containment if the kernel behavior changed");
  process.kill(descendantPid, "SIGKILL"); await until(() => !alive(descendantPid));
  cleanup = true;
  fs.writeFileSync(output, JSON.stringify({ schema: 1, platform: process.platform, arch: process.arch, release: os.release(), node: process.version,
    nodeSha256: digest(node), policySha256: digest(profile), scope: "native feasibility probe; no model or production backend",
    boundaries, detachedChildSurvivesGroupKill, ownedProcessesGone: cleanup, verdict: "BLOCKED_PROCESS_GROUP_NOT_QUIESCENCE", productionBackendEnabled: false }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ verdict: "BLOCKED_PROCESS_GROUP_NOT_QUIESCENCE", permissionsPassed: true, inheritedPermissionsPassed: true, ownedProcessesGone: cleanup, arch: process.arch }));
} catch (error) {
  try { process.stderr.write(`Copied runtime version: ${execFileSync(node, ["--version"], { encoding: "utf8", timeout: 5000 }).trim()}\n`); } catch { process.stderr.write("Copied runtime could not start outside Seatbelt\n"); }
  await delay(3000);
  const reports = path.join(os.homedir(), "Library/Logs/DiagnosticReports");
  if (fs.existsSync(reports)) for (const name of fs.readdirSync(reports).filter(name => name.startsWith("node-") && name.endsWith(".ips"))) {
    try {
      const lines = fs.readFileSync(path.join(reports, name), "utf8").split("\n"), data = JSON.parse(lines.slice(1).join("\n"));
      if (data.pid === error.pid) process.stderr.write(JSON.stringify({ exception: data.exception, termination: data.termination, applicationSpecificInformation: data.asi }) + "\n");
    } catch { process.stderr.write("Native crash report could not be projected\n"); }
  }
  try { process.stderr.write(execFileSync("/usr/bin/log", ["show", "--last", "1m", "--style", "compact", "--predicate", 'eventMessage CONTAINS "Sandbox:" AND eventMessage CONTAINS "node"'], { encoding: "utf8", timeout: 15000, maxBuffer: 256 * 1024 })); } catch { process.stderr.write("Native denial log unavailable\n"); }
  throw error;
} finally {
  if (leader?.pid && alive(leader.pid)) { try { process.kill(-leader.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
  if (descendantPid && alive(descendantPid)) { process.kill(descendantPid, "SIGKILL"); await until(() => !alive(descendantPid)); }
  if (closed) await closed;
  await new Promise(resolve => listener.close(resolve));
  assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith("stagekeeper-seatbelt-"));
  fs.rmSync(root, { recursive: true });
}
