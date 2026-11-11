import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeEval } from "./agent-eval-summary.mjs";
import { summarize } from "./client-init-smoke-steps.mjs";
import { summarizePipeline } from "./pipeline-smoke-steps.mjs";

const GATES = {
  "client-init-smoke": { level: "init", filter: summarize },
  "agent-eval": { level: "eval", filter: summarizeEval },
  "pipeline-smoke": { level: "pipeline", filter: summary => summarizePipeline({ ...summary, findings: summary }) },
};
const EVENTS = ["workflow_dispatch", "schedule"];
const REFS = { "refs/heads/dev": "dev", "refs/heads/main": "main" };
const CONCLUSIONS = ["success", "failure", "cancelled", "skipped"];
const NO_FINDINGS = ["cancelled", "skipped"];
const BOT = "github-actions[bot]";
const COMMIT = /^[0-9a-f]{40}$/;
const LEG = /^[a-z][a-z0-9_]{0,39}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const COUNT = /^[1-9]\d{0,15}$/;
const FINDINGS = {
  "gate-failed": "the gate job or one of its legs failed",
  "missing-summary": "a leg left no readable summary",
  "harness-errors": "the summary shows refused or failed harness tool calls",
  "step-refusals": "the server refused a pipeline step",
};
const VALUED = ["--workflow", "--result", "--legs", "--event", "--ref", "--commit", "--run-id", "--run-attempt", "--repository", "--record-issue", "--out", "--open-issues"];

export const USAGE = "Usage: GATE_SUMMARIES=<job outputs JSON> node scripts/rehearsals/gate-record.mjs --workflow <gate> --result <gate job result> --legs <leg,leg> --event <event> --ref <full ref> --commit <full commit> --run-id <id> --run-attempt <n> --repository <owner/name> --record-issue <number> --out <new directory> [--open-issues <NDJSON file>]";

function leg(name, text, filter) {
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { leg: name, result: "missing" };
  const summary = filter(parsed);
  return typeof summary.os === "string" ? { leg: name, ...summary } : { leg: name, result: "missing" };
}

function findingsOf(conclusion, legs) {
  if (NO_FINDINGS.includes(conclusion)) return [];
  const found = [];
  if (conclusion === "failure" || legs.some(entry => entry.result === "fail")) found.push("gate-failed");
  if (legs.some(entry => entry.result === "missing")) found.push("missing-summary");
  if (legs.some(entry => entry.harnessErrors && Object.keys(entry.harnessErrors).length > 0)) found.push("harness-errors");
  if (legs.some(entry => Number.isInteger(entry.stepRefusals) && entry.stepRefusals > 0)) found.push("step-refusals");
  return found;
}

export function gateRow(input) {
  const gate = Object.hasOwn(GATES, input.workflow ?? "") ? GATES[input.workflow] : null;
  if (!gate) throw new Error("the workflow is not a recorded gate");
  if (!EVENTS.includes(input.event)) throw new Error("only manual and scheduled runs are recorded");
  if (!Object.hasOwn(REFS, input.ref ?? "")) throw new Error("only dev and main runs are recorded");
  if (!CONCLUSIONS.includes(input.result)) throw new Error("the gate job result is not a job result");
  if (!COMMIT.test(input.commit ?? "")) throw new Error("the commit must be a full commit");
  if (!COUNT.test(String(input.runId ?? "")) || !COUNT.test(String(input.runAttempt ?? ""))) throw new Error("the run id and attempt must be positive integers");
  if (!Array.isArray(input.legs) || input.legs.length === 0 || input.legs.some(name => typeof name !== "string" || !LEG.test(name)) || new Set(input.legs).size !== input.legs.length) throw new Error("the legs must be distinct plain names");
  const summaries = input.summaries && typeof input.summaries === "object" ? input.summaries : {};
  const legs = input.legs.map(name => leg(name, summaries[`summary_${name}`], gate.filter));
  return {
    schema: 1,
    workflow: input.workflow,
    level: gate.level,
    event: input.event,
    ref: REFS[input.ref],
    commit: input.commit,
    runId: Number(input.runId),
    runAttempt: Number(input.runAttempt),
    conclusion: input.result,
    findings: findingsOf(input.result, legs),
    legs,
  };
}

function runUrl(row, repository) {
  if (!REPOSITORY.test(repository ?? "")) throw new Error("the repository must be owner/name");
  return `https://github.com/${repository}/actions/runs/${row.runId}/attempts/${row.runAttempt}`;
}

function legLine(entry) {
  const parts = [entry.result ?? "no verdict"];
  if (entry.client) parts.push([entry.client, entry.clientVersion].filter(Boolean).join(" "));
  if (entry.os) parts.push([entry.os, entry.osVersion].filter(Boolean).join(" "));
  if (entry.pluginVersion) parts.push(`plugin ${entry.pluginVersion}`);
  return `- \`${entry.leg}\`: ${parts.join(" · ")}`;
}

function rowBlock(row) {
  return ["```json", JSON.stringify(row), "```"].join("\n");
}

export function recordComment(row, repository) {
  const head = [row.workflow, `${row.ref} ${row.commit.slice(0, 7)}`, row.conclusion, `run [${row.runId}](${runUrl(row, repository)})`, ...(row.findings.length ? [row.findings.join(", ")] : [])].join(" · ");
  return [head, "", ...row.legs.map(legLine), "", rowBlock(row), ""].join("\n");
}

export function findingIssue(row, repository, recordIssue) {
  if (row.findings.length === 0) return null;
  if (!COUNT.test(String(recordIssue ?? ""))) throw new Error("the record issue must be an issue number");
  const body = [
    `Gate run [${row.runId}](${runUrl(row, repository)}) on \`${row.ref}\` commit \`${row.commit}\` needs a review.`,
    "",
    ...row.findings.map(name => `- \`${name}\`: ${FINDINGS[name]}`),
    "",
    `The row is in #${recordIssue}.`,
    "",
    rowBlock(row),
    "",
    "Close this issue with the cause and the decision. Do not paste sealed transcript text, private template text or model output here.",
    "",
  ].join("\n");
  return { title: `[gate] ${row.workflow} ${row.commit.slice(0, 7)}`, body };
}

export function openFinding(openIssues, title) {
  const match = openIssues.find(issue => issue?.login === BOT && issue.pull !== true && issue.title === title && Number.isInteger(issue.number));
  return match ? match.number : null;
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!VALUED.includes(name) || values.has(name) || args[index + 1] === undefined) throw new Error(`unexpected argument ${name}`);
    values.set(name, args[index + 1]);
  }
  for (const name of VALUED) if (name !== "--open-issues" && !values.has(name)) throw new Error(`${name} is required`);
  return values;
}

function readOpenIssues(file) {
  if (file === undefined) return [];
  const issues = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    issues.push(JSON.parse(line));
  }
  return issues;
}

export function main(args, env = process.env) {
  try {
    const values = parseArguments(args);
    let summaries = null;
    try {
      summaries = JSON.parse(env.GATE_SUMMARIES ?? "");
    } catch {
      summaries = null;
    }
    const row = gateRow({
      workflow: values.get("--workflow"), result: values.get("--result"), legs: values.get("--legs").split(",").map(name => name.trim()).filter(Boolean),
      event: values.get("--event"), ref: values.get("--ref"), commit: values.get("--commit"), runId: values.get("--run-id"), runAttempt: values.get("--run-attempt"), summaries,
    });
    const repository = values.get("--repository");
    const comment = recordComment(row, repository);
    const finding = findingIssue(row, repository, values.get("--record-issue"));
    const existing = finding ? openFinding(readOpenIssues(values.get("--open-issues")), finding.title) : null;
    const out = values.get("--out");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "comment.md"), comment);
    if (finding) {
      writeFileSync(join(out, "finding-title.txt"), finding.title);
      writeFileSync(join(out, "finding-body.md"), finding.body);
      if (existing !== null) writeFileSync(join(out, "finding-number.txt"), String(existing));
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "the gate record could not be built");
    console.error(USAGE);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
