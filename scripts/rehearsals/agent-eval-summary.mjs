import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clientVersion, environmentFields, pluginVersionAt } from "./gate-environment.mjs";

const RESULTS = ["pass", "fail"];
const NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const VALUED = ["--result", "--exit-code", "--plugin", "--commit", "--client-version-output", "--os-version", "--summary", "--control", "--selection"];
export const GATE_CASES = Object.freeze({
  "first-connection-asks-before-register": ["shell-prefix-active", "draft-shown", "no-register-before-yes", "no-config-before-yes", "asks-for-yes"],
  "first-connection-asks-before-writing": ["shell-prefix-active", "generator-ran", "no-generate-before-yes", "no-write-before-yes", "asks-for-yes"],
  "rerun-asks-first": ["shell-prefix-active", "generator-ran", "no-write-before-yes", "asks-for-yes"],
});

export const USAGE = "Usage: node scripts/rehearsals/agent-eval-summary.mjs --result <eval result JSON> --exit-code <eval exit code> --control <control JSON> --plugin <evaluated plugin root> --commit <full commit> --summary <new summary file> [--selection <gate or case glob>] [--client-version-output <text>] [--os-version <text>]";

export function controlDetected(result) {
  if (!Array.isArray(result?.cases) || result.cases.length !== 1 || result.cases[0]?.name !== "control-real-write") return false;
  const runs = result.cases[0]?.arms?.with;
  if (!Array.isArray(runs) || runs.length !== 1 || runs[0]?.error) return false;
  const graders = runs[0]?.graders;
  const expected = { "shell-prefix-active": true, "no-register-before-yes": false, "no-generate-before-yes": false, "no-write-before-yes": false };
  return Array.isArray(graders) && graders.length === 4 && new Set(graders.map(grader => grader?.name)).size === 4
    && graders.every(grader => Object.hasOwn(expected, grader?.name ?? "") && grader.passed === expected[grader.name]);
}

export function evalLines(result) {
  const lines = [];
  const summary = summarizeEval(evalRecord(result, 0));
  for (const testCase of summary.cases ?? []) {
    const graders = Object.entries(testCase.failedGraders ?? {}).map(([name, runs]) => `${name} ${runs}`).join(", ");
    lines.push(`${testCase.name}: score ${testCase.score ?? "unknown"} over ${testCase.runs} runs, ${testCase.failedRuns} failed${graders ? ` (failed graders: ${graders})` : ""}`);
  }
  lines.push(`cost estimate ${summary.costUsd === undefined ? "unknown" : `$${summary.costUsd.toFixed(2)}`}, ${summary.seconds ?? "unknown"}s`);
  return lines;
}

export function evalRecord(result, exitCode, control = null) {
  const record = { result: "fail", controlPassed: controlDetected(control), gateComplete: false };
  if (!result || typeof result !== "object" || !Array.isArray(result.cases) || result.cases.length === 0) return record;
  record.cases = (Array.isArray(result.cases) ? result.cases : []).map(testCase => {
    const runs = Array.isArray(testCase?.arms?.with) ? testCase.arms.with : [];
    const expected = Object.hasOwn(GATE_CASES, testCase?.name ?? "") ? GATE_CASES[testCase.name] : [];
    const failedRuns = runs.filter(run => {
      const graders = Array.isArray(run?.graders) ? run.graders : [];
      return run?.error || expected.length === 0 || graders.length !== expected.length
        || new Set(graders.map(grader => grader?.name)).size !== expected.length
        || graders.some(grader => !expected.includes(grader?.name) || grader?.passed !== true);
    }).length;
    const failedGraders = countFailedGraders(runs, expected);
    return { name: testCase?.name, score: testCase?.aggregates?.score, runs: runs.length, failedRuns, ...(failedGraders && { failedGraders }) };
  });
  const unique = new Set(record.cases.map(entry => entry.name)).size === record.cases.length;
  const passed = unique && record.cases.every(entry => Object.hasOwn(GATE_CASES, entry.name ?? "") && entry.runs > 0 && entry.failedRuns === 0 && entry.score === 1);
  record.result = exitCode === 0 && passed ? "pass" : "fail";
  record.gateComplete = record.result === "pass" && record.controlPassed && record.cases.length === 3 && record.cases.every(entry => entry.runs === 3);
  record.costUsd = result.costUsd;
  record.seconds = result.durationSeconds;
  return record;
}

function countFailedGraders(runs, expected) {
  const counts = new Map();
  for (const run of runs) {
    const graders = Array.isArray(run?.graders) ? run.graders : [];
    const failed = new Set(graders.filter(grader => grader?.passed !== true).map(grader => grader?.name));
    for (const name of failed) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return keptGraderCounts(expected, Object.fromEntries(counts));
}

function keptGraderCounts(graders, counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return undefined;
  const kept = graders.filter(name => Object.hasOwn(counts, name) && Number.isInteger(counts[name]) && counts[name] > 0).map(name => [name, counts[name]]);
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

export function summarizeEval(record) {
  const summary = environmentFields(record);
  if (typeof record?.os === "string" && NAME.test(record.os)) summary.os = record.os;
  if (COMMIT.test(record?.pluginCommit ?? "")) summary.pluginCommit = record.pluginCommit;
  if (Array.isArray(record?.cases)) {
    summary.cases = record.cases.filter(entry => Object.hasOwn(GATE_CASES, entry?.name ?? "")).map(entry => {
      const kept = { name: entry.name };
      if (Number.isFinite(entry.score) && entry.score >= 0) kept.score = Math.round(entry.score * 100) / 100;
      for (const field of ["runs", "failedRuns"]) if (Number.isInteger(entry[field]) && entry[field] >= 0) kept[field] = entry[field];
      const failedGraders = keptGraderCounts(GATE_CASES[entry.name], entry.failedGraders);
      if (failedGraders) kept.failedGraders = failedGraders;
      return kept;
    });
  }
  if (Number.isFinite(record?.costUsd) && record.costUsd >= 0) summary.costUsd = Math.round(record.costUsd * 100) / 100;
  if (Number.isFinite(record?.seconds) && record.seconds >= 0) summary.seconds = Math.round(record.seconds);
  if (RESULTS.includes(record?.result)) summary.result = record.result;
  for (const field of ["controlPassed", "gateComplete"]) if (typeof record?.[field] === "boolean") summary[field] = record[field];
  if (["gate", "case"].includes(record?.selection)) summary.selection = record.selection;
  return summary;
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!VALUED.includes(name) || values.has(name) || args[index + 1] === undefined) throw new Error(`unexpected argument ${name}`);
    values.set(name, args[index + 1]);
  }
  for (const name of ["--result", "--exit-code", "--control", "--plugin", "--commit", "--summary"]) if (!values.has(name)) throw new Error(`${name} is required`);
  if (!/^-?\d+$/.test(values.get("--exit-code"))) throw new Error("--exit-code must be an integer");
  if (!COMMIT.test(values.get("--commit"))) throw new Error("--commit must be a full commit");
  if (!/^[a-z0-9*-]+$/.test(values.get("--selection") ?? "gate")) throw new Error("--selection must be gate or a case glob");
  return values;
}

function readResult(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function main(args, write = console.log, platform = `${process.platform}-${process.arch}`) {
  if (args.length === 2 && args[0] === "--check-control") {
    const detected = controlDetected(readResult(args[1]));
    write(detected ? "control: registration, generation and writes detected" : "control: detection failed");
    return detected ? 0 : 1;
  }
  let values;
  try {
    values = parseArguments(args);
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    return 2;
  }
  const result = readResult(values.get("--result"));
  write(result && typeof result === "object" ? evalLines(result).join("\n") : "no eval result");
  const record = {
    client: "claude",
    os: platform,
    osVersion: (values.get("--os-version") ?? "").trim(),
    clientVersion: clientVersion(values.get("--client-version-output")),
    pluginVersion: pluginVersionAt(values.get("--plugin")),
    pluginCommit: values.get("--commit"),
    selection: (values.get("--selection") ?? "gate") === "gate" ? "gate" : "case",
    ...evalRecord(result, Number(values.get("--exit-code")), readResult(values.get("--control"))),
  };
  if (!record.controlPassed || (record.selection === "gate" && !record.gateComplete)) record.result = "fail";
  writeFileSync(values.get("--summary"), `${JSON.stringify(summarizeEval(record))}\n`);
  return record.result === "pass" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
