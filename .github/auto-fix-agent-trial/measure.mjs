import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const [patch, command, roundsText, outFile] = process.argv.slice(2);
const rounds = Number(roundsText);
const totals = { before: { runs: 0, failed: 0, seconds: [] }, after: { runs: 0, failed: 0, seconds: [] } };
const log = [];

function measure(variant, round) {
  const started = Date.now();
  const run = spawnSync("bash", ["-c", command], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const seconds = Math.round((Date.now() - started) / 1000);
  const failed = run.status !== 0;
  totals[variant].runs += 1;
  totals[variant].failed += failed ? 1 : 0;
  totals[variant].seconds.push(seconds);
  const tail = failed ? `${run.stdout}${run.stderr}`.split("\n").filter(line => /actual|expected|Error/.test(line)).slice(0, 4) : [];
  log.push({ round, variant, failed, seconds, tail });
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

writeFileSync(outFile, `${JSON.stringify({ totals, log }, null, 2)}\n`);
console.log(`MEASURE_RESULT ${JSON.stringify(totals)}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`json\n${JSON.stringify(totals, null, 2)}\n\`\`\`\n`);
