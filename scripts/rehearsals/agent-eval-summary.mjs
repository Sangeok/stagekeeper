import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clientVersion, environmentFields, pluginVersionAt } from "./gate-environment.mjs";

const RESULTS = ["pass", "fail"];
const NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const VALUED = ["--result", "--exit-code", "--plugin", "--commit", "--client-version-output", "--os-version", "--summary"];

export const USAGE = "Usage: node scripts/rehearsals/agent-eval-summary.mjs --result <eval result JSON> --exit-code <eval exit code> --plugin <evaluated plugin root> --commit <full commit> --summary <new summary file> [--client-version-output <text>] [--os-version <text>]";

export function evalLines(result) {
  const lines = [];
  for (const testCase of result.cases ?? []) {
    lines.push(`${testCase.name}: score ${testCase.aggregates?.score} over ${testCase.arms?.with?.length ?? 0} runs`);
    for (const [index, run] of (testCase.arms?.with ?? []).entries()) {
      const graders = (run.graders ?? []).map(grader => `${grader.name}=${grader.passed ? "pass" : "fail"}`).join(" ");
      lines.push(`  run ${index + 1}: ${graders}${run.error ? " error" : ""}`);
    }
  }
  lines.push(`cost estimate $${Number(result.costUsd ?? 0).toFixed(2)}, ${result.durationSeconds}s`);
  return lines;
}

export function evalRecord(result, exitCode) {
  const record = { result: exitCode === 0 ? "pass" : "fail" };
  if (!result || typeof result !== "object") return record;
  record.cases = (Array.isArray(result.cases) ? result.cases : []).map(testCase => {
    const runs = Array.isArray(testCase?.arms?.with) ? testCase.arms.with : [];
    const failedRuns = runs.filter(run => run?.error || (Array.isArray(run?.graders) ? run.graders : []).some(grader => grader?.passed !== true)).length;
    return { name: testCase?.name, score: testCase?.aggregates?.score, runs: runs.length, failedRuns };
  });
  record.costUsd = result.costUsd;
  record.seconds = result.durationSeconds;
  return record;
}

export function summarizeEval(record) {
  const summary = environmentFields(record);
  if (typeof record?.os === "string" && NAME.test(record.os)) summary.os = record.os;
  if (COMMIT.test(record?.pluginCommit ?? "")) summary.pluginCommit = record.pluginCommit;
  if (Array.isArray(record?.cases)) {
    summary.cases = record.cases.filter(entry => typeof entry?.name === "string" && NAME.test(entry.name)).map(entry => {
      const kept = { name: entry.name };
      if (Number.isFinite(entry.score) && entry.score >= 0) kept.score = Math.round(entry.score * 100) / 100;
      for (const field of ["runs", "failedRuns"]) if (Number.isInteger(entry[field]) && entry[field] >= 0) kept[field] = entry[field];
      return kept;
    });
  }
  if (Number.isFinite(record?.costUsd) && record.costUsd >= 0) summary.costUsd = Math.round(record.costUsd * 100) / 100;
  if (Number.isFinite(record?.seconds) && record.seconds >= 0) summary.seconds = Math.round(record.seconds);
  if (RESULTS.includes(record?.result)) summary.result = record.result;
  return summary;
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!VALUED.includes(name) || values.has(name) || args[index + 1] === undefined) throw new Error(`unexpected argument ${name}`);
    values.set(name, args[index + 1]);
  }
  for (const name of ["--result", "--exit-code", "--plugin", "--commit", "--summary"]) if (!values.has(name)) throw new Error(`${name} is required`);
  if (!/^-?\d+$/.test(values.get("--exit-code"))) throw new Error("--exit-code must be an integer");
  return values;
}

export function main(args, write = console.log, platform = `${process.platform}-${process.arch}`) {
  let values;
  try {
    values = parseArguments(args);
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 2;
  }
  let result = null;
  try {
    result = JSON.parse(readFileSync(values.get("--result"), "utf8"));
  } catch {
    result = null;
  }
  write(result && typeof result === "object" ? evalLines(result).join("\n") : "no eval result");
  const record = {
    client: "claude",
    os: platform,
    osVersion: (values.get("--os-version") ?? "").trim(),
    clientVersion: clientVersion(values.get("--client-version-output")),
    pluginVersion: pluginVersionAt(values.get("--plugin")),
    pluginCommit: values.get("--commit"),
    ...evalRecord(result, Number(values.get("--exit-code"))),
  };
  writeFileSync(values.get("--summary"), `${JSON.stringify(summarizeEval(record))}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
