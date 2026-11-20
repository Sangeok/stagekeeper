import { spawn } from "node:child_process";
import { isAlive } from "../../plugin/runtime/local-session.mjs";

const seconds = Number(process.env.PID_REUSE_SECONDS ?? 60);
const lanes = Number(process.env.PID_REUSE_LANES ?? 4);
const end = Date.now() + seconds * 1000;
const dead = new Map();
const result = { platform: process.platform, lanes, seconds, spawned: 0, aliveAtExitEvent: 0, aliveAfterClose: 0, deadSeenAliveLater: 0, reusedByOwnChild: 0, checks: 0, delaysMs: [] };

function once() {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    const pid = child.pid;
    result.spawned++;
    if (dead.has(pid)) { result.reusedByOwnChild++; dead.delete(pid); }
    child.on("exit", () => { if (isAlive(pid)) result.aliveAtExitEvent++; });
    child.on("close", () => {
      if (isAlive(pid)) result.aliveAfterClose++; else dead.set(pid, Date.now());
      resolve();
    });
  });
}

function sweep() {
  for (const [pid, at] of dead) {
    result.checks++;
    if (isAlive(pid)) { result.deadSeenAliveLater++; if (result.delaysMs.length < 40) result.delaysMs.push(Date.now() - at); dead.delete(pid); }
    else if (Date.now() - at > 20000) dead.delete(pid);
  }
}

async function lane() { while (Date.now() < end) { await once(); sweep(); } }
await Promise.all(Array.from({ length: lanes }, lane));
console.log(`PID_REUSE_RESULT ${JSON.stringify(result)}`);
