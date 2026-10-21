import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const LAUNCHER = fileURLToPath(new URL("../runtime/windows/job-launch.ps1", import.meta.url));
const BACKGROUND = new URL("../runtime/background.mjs", import.meta.url).href;
const skip = process.platform !== "win32" && "Windows only";
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } };

const FAKE = `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore", windowsHide: true });
grandchild.unref();
writeFileSync(process.argv[2], JSON.stringify({ claude: process.pid, grandchild: grandchild.pid }));
setInterval(() => {}, 1000);
`;
const RESIDENT = `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const { quoteWindowsArgument } = await import(${JSON.stringify(BACKGROUND)});
const [launcher, request, out, fake, pids] = process.argv.slice(2);
writeFileSync(request, JSON.stringify({ resident: process.pid, cwd: process.cwd(), executable: process.execPath,
  arguments: [fake, pids].map(quoteWindowsArgument).join(" ") }));
const powershell = process.env.SystemRoot + "\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe";
const child = spawn(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", launcher, "-RequestPath", request],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
child.stdout.on("data", () => {});
writeFileSync(out, JSON.stringify({ resident: process.pid, launcher: child.pid }));
setInterval(() => {}, 1000);
`;

async function waitFor(predicate, limit, what) {
  const expires = performance.now() + limit;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (performance.now() > expires) assert.fail(`Timed out waiting for ${what}.`);
    await delay(100);
  }
}

async function tree(t) {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), "harness-job-test-"));
  const fake = path.join(dir, "fake.mjs"), resident = path.join(dir, "resident.mjs");
  const pidsFile = path.join(dir, "pids.json"), launched = path.join(dir, "launched.json");
  writeFileSync(fake, FAKE);
  writeFileSync(resident, RESIDENT);
  const child = spawn(process.execPath, [resident, LAUNCHER, path.join(dir, "request.json"), launched, fake, pidsFile],
    { cwd: dir, stdio: "ignore", windowsHide: true });
  const ids = await waitFor(() => (existsSync(pidsFile) ? JSON.parse(readFileSync(pidsFile, "utf8")) : null), 30000, "the fake claude");
  const { launcher } = JSON.parse(readFileSync(launched, "utf8"));
  t.after(async () => {
    for (const pid of [child.pid, launcher, ids.claude, ids.grandchild]) { try { process.kill(pid); } catch {   } }
    await delay(300);
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });
  return { resident: child.pid, launcher, ...ids };
}

it("ends claude and the grandchild it detached when the resident dies", { skip }, async t => {
  const pids = await tree(t);
  assert.ok(alive(pids.claude) && alive(pids.grandchild));
  process.kill(pids.resident);
  await waitFor(() => !alive(pids.claude) && !alive(pids.grandchild), 15000, "the job to end");
});

it("ends the work tree but not the resident when only the launcher dies", { skip }, async t => {
  const pids = await tree(t);
  assert.ok(alive(pids.claude) && alive(pids.grandchild));
  process.kill(pids.launcher);
  await waitFor(() => !alive(pids.claude) && !alive(pids.grandchild), 15000, "the job to end");
  assert.ok(alive(pids.resident));
});
