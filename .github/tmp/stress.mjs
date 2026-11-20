import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";

const options = Object.fromEntries(process.argv.slice(2).map(argument => argument.replace(/^--/, "").split("=")));
const file = options.file;
const rounds = Number(options.rounds ?? 5);
const parallel = Number(options.parallel ?? 4);
const label = options.label ?? file;

function runOnce() {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", file], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.on("close", code => {
      clearTimeout(timer);
      const failed = [...output.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(match => match[1].trim());
      const details = [...output.matchAll(/^\s*(?:error|code|expected|actual): .+$/gm)].map(match => match[0].trim()).slice(0, 12);
      resolve({ code, seconds: Math.round((Date.now() - started) / 1000), failed, details });
    });
  });
}

const results = [];
for (let round = 0; round < rounds; round++) results.push(...await Promise.all(Array.from({ length: parallel }, runOnce)));

const failures = results.filter(result => result.code !== 0);
const names = {};
for (const failure of failures) for (const name of failure.failed) names[name] = (names[name] ?? 0) + 1;
const seconds = results.map(result => result.seconds).sort((a, b) => a - b);
const summary = { label, runs: results.length, failedRuns: failures.length, medianSeconds: seconds[Math.floor(seconds.length / 2)], maxSeconds: seconds.at(-1), failedTests: names, sample: failures[0]?.details ?? [] };
console.log(`STRESS_RESULT ${JSON.stringify(summary)}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
