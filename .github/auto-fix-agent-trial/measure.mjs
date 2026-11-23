import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const [patch, stress, roundsText, outFile] = process.argv.slice(2);
const rounds = Number(roundsText);
const AGENT_RUNS = 10;
const AGENT_COMMAND = `(for j in 1 2 3 4 5 6 7 8; do (while :; do :; done) & done; for i in $(seq 1 ${AGENT_RUNS}); do node --test --test-name-pattern="honors a longer" plugin/bin/harness-watch.test.mjs >/dev/null 2>&1 || echo FAIL; done; kill $(jobs -p))`;
const FILE_ENV = { ...process.env, STAGEKEEPER_MACOS_RUNTIME_REQUIRED: "1", STAGEKEEPER_RELEASED_READERS: "required", GITHUB_STEP_SUMMARY: "" };

const totals = { before: { agent: { runs: 0, failed: 0 }, file: { runs: 0, failed: 0, tests: {} } }, after: { agent: { runs: 0, failed: 0 }, file: { runs: 0, failed: 0, tests: {} } } };
const log = [];

function measure(variant, round) {
  const agent = spawnSync("bash", ["-c", AGENT_COMMAND], { encoding: "utf8" });
  const agentFailed = (agent.stdout.match(/^FAIL$/gm) ?? []).length;
  totals[variant].agent.runs += AGENT_RUNS;
  totals[variant].agent.failed += agentFailed;

  const file = spawnSync(process.execPath, [stress, "--file=plugin/bin/harness-watch.test.mjs", "--rounds=1", "--parallel=3", `--label=${variant}-${round}`], { encoding: "utf8", env: FILE_ENV, maxBuffer: 64 * 1024 * 1024 });
  const summary = JSON.parse(/^STRESS_RESULT (.+)$/m.exec(file.stdout)[1]);
  totals[variant].file.runs += summary.runs;
  totals[variant].file.failed += summary.failedRuns;
  for (const [name, count] of Object.entries(summary.failedTests)) totals[variant].file.tests[name] = (totals[variant].file.tests[name] ?? 0) + count;
  log.push({ round, variant, agentFailed, fileRuns: summary.runs, fileFailed: summary.failedRuns, medianSeconds: summary.medianSeconds, failedTests: summary.failedTests });
  console.log(JSON.stringify(log.at(-1)));
}

for (let round = 1; round <= rounds; round++) {
  const order = round % 2 ? ["before", "after"] : ["after", "before"];
  for (const variant of order) {
    if (variant === "after") execFileSync("git", ["apply", patch]);
    try {
      measure(variant, round);
    } finally {
      if (variant === "after") execFileSync("git", ["apply", "-R", patch]);
    }
  }
}

const text = `${JSON.stringify({ totals, log }, null, 2)}\n`;
writeFileSync(outFile, text);
console.log(`MEASURE_RESULT ${JSON.stringify(totals)}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`json\n${JSON.stringify(totals, null, 2)}\n\`\`\`\n`);
