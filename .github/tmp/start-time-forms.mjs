import { spawn, spawnSync } from "node:child_process";

const child = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 120000)"], { stdio: "ignore" });
await new Promise(resolve => setTimeout(resolve, 500));
const ids = `${child.pid},${process.pid},4`;
const forms = {
  dotnet: `foreach ($id in @(${ids})) { try { $p=[Diagnostics.Process]::GetProcessById($id); "$id|" + $p.StartTime.ToUniversalTime().ToString("o") } catch { "$id|ERR" } }`,
  cmdlet: `Get-Process -Id ${ids} -ErrorAction SilentlyContinue | ForEach-Object { try { "$($_.Id)|" + $_.StartTime.ToUniversalTime().ToString("o") } catch { "$($_.Id)|ERR" } }`,
  cim: `Get-CimInstance Win32_Process -Filter "ProcessId=${child.pid} OR ProcessId=${process.pid} OR ProcessId=4" | ForEach-Object { "$($_.ProcessId)|" + $_.CreationDate.ToUniversalTime().ToString("o") }`,
};
const result = { platform: process.platform, languageMode: spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$ExecutionContext.SessionState.LanguageMode"], { encoding: "utf8" }).stdout.trim() };
for (const [name, script] of Object.entries(forms)) {
  const timings = [], outputs = [];
  for (let i = 0; i < 6; i++) {
    const started = performance.now();
    const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 20000 });
    timings.push(Math.round(performance.now() - started));
    if (i === 0) outputs.push(run.stdout.trim().split(/\r?\n/).join(" ; "), `status=${run.status} signal=${run.signal}`);
  }
  result[name] = { ms: timings, first: outputs };
}
const hung = performance.now();
const limited = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Seconds 30"], { encoding: "utf8", timeout: 2000 });
result.timeLimit = { ms: Math.round(performance.now() - hung), status: limited.status, signal: limited.signal, error: limited.error?.code ?? null };
child.kill();
console.log(`START_TIME_FORMS ${JSON.stringify(result)}`);
