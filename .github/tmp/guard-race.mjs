import { fork } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { withGuard } from "../../plugin/runtime/local-session.mjs";

const seconds = Number(process.env.GUARD_RACE_SECONDS ?? 30);
const workers = Number(process.env.GUARD_RACE_WORKERS ?? 4);

if (process.env.GUARD_RACE_DIRECTORY) {
  const directory = process.env.GUARD_RACE_DIRECTORY;
  const files = { policy: path.join(directory, "watch.json"), lock: path.join(directory, "watch.lock.json"), guard: path.join(directory, "watch.guard") };
  const counts = {};
  let taken = 0;
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try { await withGuard(files, async () => { taken++; }); }
    catch (error) {
      const key = [error?.name, error?.code, error?.diagnostic?.phase, error?.diagnostic?.target, error?.diagnostic?.systemCode, error?.syscall, error?.code ? null : String(error?.message).slice(0, 60)].map(value => value ?? "-").join("|");
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  process.send({ taken, counts });
} else {
  const common = mkdtempSync(path.join(realpathSync(tmpdir()), "guard-race-"));
  const directory = path.join(common, "harness");
  mkdirSync(directory);
  const reports = await Promise.all(Array.from({ length: workers }, () => new Promise(resolve => {
    const child = fork(new URL(import.meta.url), { env: { ...process.env, GUARD_RACE_DIRECTORY: directory } });
    child.on("message", resolve);
  })));
  const total = { platform: process.platform, workers, seconds, taken: 0, errors: {} };
  for (const report of reports) {
    total.taken += report.taken;
    for (const [key, count] of Object.entries(report.counts)) total.errors[key] = (total.errors[key] ?? 0) + count;
  }
  console.log(`GUARD_RACE_RESULT ${JSON.stringify(total)}`);
  process.exit(0);
}
