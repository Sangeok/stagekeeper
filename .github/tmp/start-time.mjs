import { spawn, spawnSync } from "node:child_process";
import { isAlive } from "../../plugin/runtime/local-session.mjs";

const result = { platform: process.platform };
const startTimes = pids => {
  const started = performance.now();
  const script = `$ErrorActionPreference='SilentlyContinue'; foreach ($id in @(${pids.join(",")})) { try { $p=[Diagnostics.Process]::GetProcessById($id); "$id|" + $p.StartTime.ToUniversalTime().ToString("o") } catch { "$id|ERR|" + $_.Exception.GetType().Name } }`;
  const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  return { ms: Math.round(performance.now() - started), status: run.status, lines: run.stdout.trim().split(/\r?\n/) };
};

result.neverValidPid = (() => { try { process.kill(2147483644, 0); return "alive"; } catch (error) { return error.code; } })();

const child = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], { stdio: "ignore" });
const registeredAt = new Date();
await new Promise(resolve => setTimeout(resolve, 500));
const own = startTimes([child.pid, process.pid]);
result.queryOwnChild = { ms: own.ms, status: own.status, lines: own.lines, registeredAt: registeredAt.toISOString() };
const childLine = own.lines.find(line => line.startsWith(`${child.pid}|`));
if (childLine && !childLine.includes("ERR")) result.creationMinusRegistrationMs = Date.parse(childLine.split("|")[1]) - registeredAt.getTime();

const timings = [];
for (let i = 0; i < 10; i++) timings.push(startTimes([child.pid]).ms);
result.querySingleMs = timings;
const many = Array.from({ length: 20 }, () => child.pid);
result.queryTwentyMs = startTimes(many).ms;

const system = startTimes([4, 0]);
result.systemPids = system.lines;
const listing = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'services.exe','lsass.exe','csrss.exe','svchost.exe','MsMpEng.exe' } | Select-Object -First 6 | ForEach-Object { \"$($_.ProcessId)|$($_.Name)\" }"], { encoding: "utf8" });
const others = listing.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => line.split("|"));
result.protectedProcesses = others.map(([pid, name]) => ({ name, kill0: (() => { try { process.kill(Number(pid), 0); return "alive"; } catch (error) { return error.code; } })(), startTime: startTimes([Number(pid)]).lines[0]?.split("|").slice(1).join("|") }));

child.kill();
await new Promise(resolve => child.on("close", resolve));
result.afterCloseHeldHandle = isAlive(child.pid) ? "alive" : "dead";

const held = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
const heldPid = held.pid;
await new Promise(resolve => held.on("exit", resolve));
result.atExitBeforeClose = isAlive(heldPid) ? "alive" : "dead";
console.log(`START_TIME_RESULT ${JSON.stringify(result)}`);
