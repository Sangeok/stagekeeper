import { execFileSync, spawnSync } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const FIX_BRANCH_PREFIX = "harness/auto-fix-";
export const FORBIDDEN_PATHS = Object.freeze([".github/", "AGENTS.md", "CLAUDE.md", "vercel.json", "vercel.ts"]);
export const RUNNERS = Object.freeze(["windows-2022", "macos-15", "macos-15-intel", "ubuntu-latest"]);
export const FULL_CHECKS = Object.freeze(["windows-role-runtime", "macos-runtime-contracts", "none"]);
export const LABELS = Object.freeze({ notReproduced: "auto-fix:not-reproduced", underVerified: "auto-fix:under-verified" });
export const MODELS = Object.freeze(["claude-sonnet-5-5", "claude-opus-5-5"]);
export const MAX_RUNS = 200;
export const MAX_NOTES = 6000;
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const PASSES_PER_FAILURE = 3;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const ASSERTION = /\bassert\s*[.(]|\bexpect\s*\(/;
const SKIP_MARKER = /\b(?:it|test|describe)\.(?:skip|todo)\s*\(|\bskip\s*:\s*(?:true|["'`])/;
const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function changedFiles(patch) {
  const files = new Set();
  for (const line of String(patch).split("\n")) {
    if (!line.startsWith("diff --git ")) continue;
    const match = /^diff --git a\/(\S+) b\/(\S+)$/.exec(line);
    if (!match) throw new Error("the change names a path this check cannot read");
    files.add(match[1]);
    files.add(match[2]);
  }
  if (files.size === 0) throw new Error("the change has no files");
  return [...files].sort();
}

export const forbiddenFiles = files => files.filter(file => FORBIDDEN_PATHS.some(entry => (entry.endsWith("/") ? file.startsWith(entry) : file === entry)));
export const isTestFile = file => TEST_FILE.test(file);

export function changeStats(patch) {
  const files = changedFiles(patch);
  const body = String(patch).split("\n").filter(line => !line.startsWith("+++") && !line.startsWith("---"));
  const added = body.filter(line => line.startsWith("+"));
  const removed = body.filter(line => line.startsWith("-"));
  const productFiles = files.filter(file => !isTestFile(file));
  return {
    files: files.length,
    addedLines: added.length,
    removedLines: removed.length,
    productFiles: productFiles.length,
    pluginFiles: files.filter(file => file.startsWith("plugin/")).length,
    addedAssertions: added.filter(line => ASSERTION.test(line)).length,
    removedAssertions: removed.filter(line => ASSERTION.test(line)).length,
    addsSkip: added.some(line => SKIP_MARKER.test(line)),
    testOnly: productFiles.length === 0,
    forbidden: forbiddenFiles(files),
  };
}

export function readRequest(raw) {
  const issue = Number(raw.issue);
  if (!Number.isInteger(issue) || issue <= 0) throw new Error("issue must be a positive number");
  if (!RUNNERS.includes(raw.runner)) throw new Error(`runner must be one of ${RUNNERS.join(", ")}`);
  if (!FULL_CHECKS.includes(raw.workflow)) throw new Error(`workflow must be one of ${FULL_CHECKS.join(", ")}`);
  const source = raw.source || "prepared";
  if (source !== "prepared" && source !== "agent") throw new Error("source must be prepared or agent");
  const commit = String(raw.commit ?? "").trim();
  if (commit && !/^[0-9a-f]{40}$/.test(commit)) throw new Error("commit must be a full commit id");
  const rehearsal = commit !== "";
  const openPr = raw.openPr === true || raw.openPr === "true";
  if (rehearsal && (openPr || raw.workflow !== "none")) throw new Error("a run on an older commit opens no pull request and calls no full check");
  const request = { issue, runner: raw.runner, workflow: raw.workflow, openPr, source, commit, rehearsal };
  if (source === "prepared") {
    if (!NAME.test(String(raw.prepared ?? ""))) throw new Error("prepared must be a lowercase name");
    return { ...request, prepared: raw.prepared };
  }
  if (!MODELS.includes(raw.model)) throw new Error(`model must be one of ${MODELS.join(", ")}`);
  const runs = String(raw.runs ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (runs.length === 0 || runs.length > 10 || runs.some(value => !/^[1-9]\d{0,18}$/.test(value))) throw new Error("runs must list one to ten run numbers");
  const job = String(raw.job ?? "").trim();
  if (!job || job.length > 120 || /[\r\n`]/.test(job)) throw new Error("job must name the failed job");
  return { ...request, model: raw.model, runs, job };
}

export function readMeasurePlan(raw) {
  const command = typeof raw?.command === "string" ? raw.command.trim() : "";
  if (!command || command.length > 2000 || command.includes("\n")) throw new Error("the measurement needs one command line");
  if (!Number.isInteger(raw.runs) || raw.runs < 1 || raw.runs > MAX_RUNS) throw new Error(`runs must be between 1 and ${MAX_RUNS}`);
  return { command, runs: raw.runs };
}

export const requiredPasses = (runs, failed) => (failed > 0 ? Math.ceil((PASSES_PER_FAILURE * runs) / failed) : runs);
export const branchName = (issue, runId) => `${FIX_BRANCH_PREFIX}${issue}-${runId}`;

export function combine(results) {
  const sum = key => results.reduce((total, result) => ({ runs: total.runs + result[key].runs, failed: total.failed + result[key].failed }), { runs: 0, failed: 0 });
  return { before: sum("before"), after: sum("after") };
}

export function judge({ before, after }, { testOnly }) {
  if (before.runs === 0 || after.runs === 0) return { verdict: "not-measured", open: false, labels: [], required: 0 };
  if (after.failed > 0 && before.failed === 0) return { verdict: "failing-unreproduced", open: false, labels: [], required: 0 };
  if (after.failed > 0) return { verdict: "still-failing", open: false, labels: [], required: requiredPasses(before.runs, before.failed) };
  if (before.failed === 0) return { verdict: "not-reproduced", open: testOnly, labels: [LABELS.notReproduced], required: 0 };
  const required = requiredPasses(before.runs, before.failed);
  return after.runs >= required ? { verdict: "verified", open: true, labels: [], required } : { verdict: "under-verified", open: true, labels: [LABELS.underVerified], required };
}

export function fullCheckResult(workflow, results) {
  if (workflow === "none") return "not-run";
  const result = results[workflow];
  return result === "success" ? "passed" : "failed";
}

export const prTitle = issue => `fix: auto-fix attempt for #${issue}`;

export function prBody({ issue, runUrl, source, measured, decision, stats, fullCheck, fullCheckWorkflow }) {
  return [
    `Automatic fix attempt for #${issue}. A person reviews and merges this pull request; the workflow does not merge it.`,
    "",
    "The counts below come from repeating one command before and after the change. The source of the change chose that command, so check in the issue that it measures the failure.",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| Issue | #${issue} |`,
    `| Workflow run | ${runUrl} |`,
    `| Source of the change | ${source} |`,
    `| Before the change | ${measured.before.failed} failed of ${measured.before.runs} runs |`,
    `| After the change | ${measured.after.failed} failed of ${measured.after.runs} runs |`,
    `| Passes required after the change | ${decision.required} |`,
    `| Measurement | ${decision.verdict} |`,
    `| Full check | ${fullCheckWorkflow === "none" ? "not run" : `${fullCheckWorkflow}: ${fullCheck}`} |`,
    `| Files changed | ${stats.files} |`,
    `| Lines added / removed | ${stats.addedLines} / ${stats.removedLines} |`,
    `| Product code files | ${stats.productFiles} |`,
    `| Shipped plugin files | ${stats.pluginFiles} |`,
    `| Assertion lines added / removed | ${stats.addedAssertions} / ${stats.removedAssertions} |`,
    `| Adds a skip marker | ${stats.addsSkip ? "yes" : "no"} |`,
    "",
    "The cause and the measurement command are in the issue.",
    "",
  ].join("\n");
}

export const END_STATES = Object.freeze({
  opened: "opened a pull request",
  rehearsed: "finished without a pull request because none was requested",
  noChange: "recorded only: the agent proposed no change",
  noOutput: "did not finish: the agent job produced no usable output",
  recordOnly: "recorded only: the change was not opened as a pull request",
  stillFailing: "recorded only: the failure remained after the change",
  failingUnreproduced: "recorded only: the failure was not seen before the change and a run failed after it",
  fullCheckFailed: "recorded only: the full check failed on the fix branch",
  duplicate: "recorded only: an open pull request already carries the same change",
  refused: "refused: the change touches a path that an automatic fix must not change",
  unfinished: "did not finish",
});

export function endState({ request, stats, change, decision, pushed, duplicateOf, fullCheck, pr }) {
  if (change === "none") return "noOutput";
  if (change === "empty") return "noChange";
  if (stats?.forbidden?.length) return "refused";
  if (pr) return "opened";
  if (duplicateOf) return "duplicate";
  if (!decision) return "unfinished";
  if (decision.verdict === "still-failing") return "stillFailing";
  if (decision.verdict === "failing-unreproduced") return "failingUnreproduced";
  if (!decision.open) return decision.verdict === "not-measured" ? "unfinished" : "recordOnly";
  if (request?.rehearsal) return "rehearsed";
  if (!pushed) return "unfinished";
  if (fullCheck === "failed") return "fullCheckFailed";
  return request?.openPr ? "unfinished" : "rehearsed";
}

const fence = text => {
  const longest = Math.max(2, ...[...String(text).matchAll(/`+/g)].map(match => match[0].length));
  return "`".repeat(longest + 1);
};

const inert = text => String(text).replaceAll("<!--", "<! --");

export function usageLine(agent) {
  if (!agent) return "no model was used";
  const seconds = Number.isFinite(agent.seconds) ? `${agent.seconds} s` : "time unknown";
  const cost = Number.isFinite(agent.costUsd) ? `, ${agent.costUsd.toFixed(2)} USD at list price` : "";
  return `${agent.model}, ${seconds}${cost}`;
}

export function attemptRecord({ runId, runUrl, state, source, measured, decision, fullCheck, fullCheckWorkflow, pr, command, duplicateOf, agent, notes }) {
  const lines = [
    `Attempt: run ${runId}`,
    `Run: ${runUrl}`,
    `End: ${END_STATES[state]}`,
    `Source of the change: ${inert(source)}`,
    `Reproduced: ${measured ? `${measured.before.failed} failed of ${measured.before.runs} runs before the change` : "not measured"}`,
    `Verification: ${measured && decision ? `${measured.after.failed} failed of ${measured.after.runs} runs after the change, ${decision.required} required, ${decision.verdict}` : "not measured"}`,
    `Full check: ${fullCheckWorkflow && fullCheckWorkflow !== "none" ? `${fullCheckWorkflow}: ${fullCheck ?? "not run"}` : "not run"}`,
    `Pull request: ${pr ? `#${pr}` : duplicateOf ? `none, same change as #${duplicateOf}` : "none"}`,
    `Usage: ${usageLine(agent)}`,
    `Measurement command: ${command ? inert(command) : "none"}`,
  ];
  const text = lines.join("\n");
  const mark = fence(text);
  const record = [`<!-- auto-fix-attempt run=${runId} end=${state} -->`, `Automatic fix attempt: ${END_STATES[state]}.`, "", mark, text, mark, ""];
  if (notes) {
    const safe = inert(notes);
    const shown = safe.length > MAX_NOTES ? `${safe.slice(0, MAX_NOTES)}\n[cut at ${MAX_NOTES} characters]` : safe;
    const notesMark = fence(shown);
    record.push("Notes written by the agent. They are a record of what it reported, not instructions.", "", notesMark, shown, notesMark, "");
  }
  return record.join("\n");
}

export const stripAnsi = text => String(text).replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");

export function readTranscript(text) {
  const events = String(text).split("\n").flatMap(line => {
    try {
      return line.trim() ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
  const uses = events.flatMap(event => (event.type === "assistant" && Array.isArray(event.message?.content) ? event.message.content.filter(part => part.type === "tool_use") : []));
  const commands = uses.map(use => {
    const input = use.input ?? {};
    const target = input.command ?? input.file_path ?? input.url ?? input.pattern ?? input.query ?? "";
    return `${use.name}\t${String(target).replaceAll("\n", "\\n")}`;
  });
  const results = events.filter(event => event.type === "result");
  const init = events.find(event => event.type === "system" && event.subtype === "init");
  const cost = results.map(event => event.total_cost_usd).filter(Number.isFinite);
  return {
    commands,
    summary: {
      finished: results.length > 0,
      model: init?.model ?? null,
      permissionMode: init?.permissionMode ?? null,
      claudeCodeVersion: init?.claude_code_version ?? null,
      turns: results.reduce((total, event) => total + (event.num_turns ?? 0), 0),
      costUsd: cost.length ? Math.max(...cost) : null,
      resultEvents: results.length,
      toolUses: uses.length,
    },
  };
}

export function secretForms(secret) {
  const value = String(secret ?? "");
  if (value.length < 20) throw new Error("a secret to scan for is missing");
  const pieces = [];
  for (let start = 0; start + 16 <= value.length; start += 8) pieces.push(value.slice(start, start + 16));
  return [value, Buffer.from(value).toString("base64"), Buffer.from(value).toString("hex"), [...value].reverse().join(""), encodeURIComponent(value), ...pieces];
}

export const leaks = (texts, secrets) => secrets.flatMap(secretForms).some(form => texts.some(text => String(text).includes(form)));

export function sealTranscripts(files, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("the transcript key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify({ version: 1, files }))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function readAgentOutput({ patch, plan, notes }) {
  const text = String(patch ?? "");
  if (Buffer.byteLength(text) > MAX_PATCH_BYTES) throw new Error("the change is larger than an automatic fix may be");
  let measure = null;
  try {
    measure = readMeasurePlan(JSON.parse(String(plan ?? "")));
  } catch {
    measure = null;
  }
  return { patch: text.trim() ? text : null, plan: measure, notes: String(notes ?? "") };
}

export function promptText(template, values) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`the prompt names an unknown value ${name}`);
    return values[name];
  });
}

export function failedTests(output) {
  const names = [...String(output).matchAll(/^\s*(?:not ok \d+ - |✖ )(.+)$/gm)].map(match => match[1].replace(/\s+\(\d+(?:\.\d+)?ms\)$/, "").trim());
  return [...new Set(names)].slice(0, 10);
}

function runCommand(command, cwd, timeoutMs) {
  const started = Date.now();
  const run = spawnSync("bash", ["-c", command], { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, killSignal: "SIGKILL" });
  const failed = run.status !== 0;
  return { failed, timedOut: run.error?.code === "ETIMEDOUT", seconds: Math.round((Date.now() - started) / 1000), tests: failed ? failedTests(`${run.stdout ?? ""}\n${run.stderr ?? ""}`) : [] };
}

export function measure({ plan, patch, cwd, minutes, run = runCommand, apply = variant => execFileSync("git", ["apply", ...(variant === "before" ? ["-R"] : []), patch], { cwd }), now = Date.now }) {
  const deadline = now() + minutes * 60 * 1000;
  const totals = { before: { runs: 0, failed: 0 }, after: { runs: 0, failed: 0 } };
  const log = [];
  let applied = false;
  const wanted = variant => (variant === "before" ? plan.runs : requiredPasses(totals.before.runs || plan.runs, totals.before.failed));
  const due = variant => totals[variant].runs < wanted(variant) && !(variant === "after" && totals.after.failed > 0 && totals.after.runs >= plan.runs);
  try {
    for (let round = 1; now() < deadline && (due("before") || due("after")); round++) {
      for (const variant of round % 2 ? ["before", "after"] : ["after", "before"]) {
        if (!due(variant) || now() >= deadline) continue;
        if ((variant === "after") !== applied) {
          apply(variant);
          applied = variant === "after";
        }
        const result = run(plan.command, cwd, Math.max(1000, deadline - now()));
        if (result.timedOut) continue;
        totals[variant].runs += 1;
        totals[variant].failed += result.failed ? 1 : 0;
        log.push({ round, variant, failed: result.failed, seconds: result.seconds, ...(result.tests?.length ? { tests: result.tests } : {}) });
      }
    }
  } finally {
    if (applied) apply("before");
  }
  return { ...totals, log };
}

export const digestOf = text => createHash("sha256").update(text).digest("hex");

export function verifyChange({ patch, plan }, expected) {
  if (!/^[0-9a-f]{64}$/.test(String(expected.patchSha)) || !/^[0-9a-f]{64}$/.test(String(expected.planSha))) throw new Error("the expected digests are missing");
  if (digestOf(patch) !== expected.patchSha) throw new Error("the change is not the one that was checked");
  if (digestOf(plan) !== expected.planSha) throw new Error("the measurement plan is not the one that was checked");
}

export function readCounts(text) {
  const match = /^(\d+),(\d+)$/.exec(String(text ?? ""));
  return match ? { runs: Number(match[1]), failed: Number(match[2]) } : null;
}

const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const readText = file => (existsSync(file) ? readFileSync(file, "utf8") : "");
const output = pairs => {
  const text = Object.entries(pairs).map(([name, value]) => `${name}=${value}`).join("\n");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${text}\n`);
  console.log(text);
};

function options(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || argv[index + 1] === undefined) throw new Error(`unexpected argument ${argv[index]}`);
    values[argv[index].slice(2)] = argv[index + 1];
  }
  return values;
}

const here = path.dirname(fileURLToPath(import.meta.url));

function readVerified(args) {
  const patch = readFileSync(path.join(args.change, "change.patch"), "utf8");
  const plan = readFileSync(path.join(args.change, "measure.json"), "utf8");
  verifyChange({ patch, plan }, { patchSha: args["patch-sha"], planSha: args["plan-sha"] });
  return { patch, plan: readMeasurePlan(JSON.parse(plan)) };
}

function readJudged(args) {
  const before = readCounts(args.before);
  const after = readCounts(args.after);
  if (!args.verdict || !before || !after) return null;
  return { measured: { before, after }, decision: { verdict: args.verdict, open: args.open === "true", required: Number(args.required) || 0 } };
}

function publishChange(out, patch, plan, source) {
  const stats = changeStats(patch);
  const planText = `${JSON.stringify(plan)}\n`;
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "change.patch"), patch);
  writeFileSync(path.join(out, "measure.json"), planText);
  output({ change: "ready", refused: stats.forbidden.length > 0, source, patch_sha: digestOf(patch), plan_sha: digestOf(planText) });
}

const commands = {
  plan(args) {
    const request = readRequest({
      issue: process.env.INPUT_ISSUE,
      runner: process.env.INPUT_RUNNER,
      workflow: process.env.INPUT_WORKFLOW,
      prepared: process.env.INPUT_PREPARED,
      openPr: process.env.INPUT_OPEN_PR,
      source: process.env.INPUT_SOURCE,
      model: process.env.INPUT_MODEL,
      commit: process.env.INPUT_COMMIT,
      runs: process.env.INPUT_RUNS,
      job: process.env.INPUT_JOB,
    });
    output({
      issue: request.issue,
      runner: request.runner,
      workflow: request.workflow,
      open_pr: request.openPr,
      branch: branchName(request.issue, args.run),
      source: request.source,
      prepared: request.prepared ?? "",
      model: request.model ?? "",
      runs: (request.runs ?? []).join(","),
      job: request.job ?? "",
      rehearsal: request.rehearsal,
      base: request.commit || args.dev,
    });
  },
  async logs(args) {
    const token = process.env.GH_TOKEN;
    const api = `https://api.github.com/repos/${args.repository}`;
    const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
    mkdirSync(args.out, { recursive: true });
    const written = [];
    for (const run of args.runs.split(",")) {
      const listed = await fetch(`${api}/actions/runs/${run}/jobs?filter=all&per_page=100`, { headers });
      if (!listed.ok) throw new Error(`run ${run}: the jobs could not be listed (${listed.status})`);
      const failed = (await listed.json()).jobs.filter(job => job.name === args.job && job.conclusion === "failure");
      for (const job of failed) {
        const log = await fetch(`${api}/actions/jobs/${job.id}/logs`, { headers });
        if (!log.ok) throw new Error(`job ${job.id}: the log could not be read (${log.status})`);
        const file = path.join(args.out, `failure-run-${run}-attempt-${job.run_attempt}.log`);
        writeFileSync(file, stripAnsi(await log.text()));
        written.push(file);
      }
    }
    if (written.length === 0) throw new Error("no failed job of that name was found in the given runs");
    writeFileSync(path.join(args.out, "logs.txt"), `${written.join("\n")}\n`);
    console.log(`${written.length} failure logs`);
  },
  prompt(args) {
    const logs = readFileSync(path.join(args.logs, "logs.txt"), "utf8").trim().split("\n").map(file => `  - ${file}`).join("\n");
    const workflow = args.workflow === "none" ? "the workflow named in the logs" : `.github/workflows/${args.workflow}.yml`;
    writeFileSync(args.out, promptText(readFileSync(path.join(here, "prompt.md"), "utf8"), { workflow, job: args.job, logs, notes: args.notes, plan: args.plan }));
  },
  collect(args) {
    const key = Buffer.from(String(process.env.TRANSCRIPT_KEY ?? "").trim(), "base64");
    const transcript = readText(args.transcript);
    const { commands: used, summary } = readTranscript(transcript);
    execFileSync("git", ["add", "-A"], { cwd: args.cwd });
    const patch = execFileSync("git", ["diff", "--cached", "--binary", args.base], { cwd: args.cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    execFileSync("git", ["reset", "--quiet"], { cwd: args.cwd });
    const files = {
      "change.patch": patch,
      "measure.json": readText(args.plan),
      "notes.md": readText(args.notes),
      "commands.txt": `${used.join("\n")}\n`,
      "summary.json": `${JSON.stringify({ ...summary, seconds: Number(args.seconds) || null, requestedModel: args.model })}\n`,
    };
    if (leaks([...Object.values(files), transcript], [process.env.CLAUDE_CODE_OAUTH_TOKEN, process.env.TRANSCRIPT_KEY])) throw new Error("a secret appears in the agent's output; nothing is published");
    mkdirSync(args.out, { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(args.out, name), text);
    writeFileSync(path.join(args.out, "transcript.sealed"), sealTranscripts({ "transcript.jsonl": transcript }, key));
    console.log(JSON.stringify({ ...summary, patchBytes: patch.length, commands: used.length }));
  },
  change(args) {
    if (args.source === "prepared") {
      const source = path.join(here, "prepared", args.prepared);
      publishChange(args.out, readFileSync(path.join(source, "change.patch"), "utf8"), readMeasurePlan(readJson(path.join(source, "measure.json"))), `prepared change ${args.prepared}`);
      return;
    }
    const label = `agent ${args.model}`;
    if (!existsSync(path.join(args.agent, "summary.json"))) {
      output({ change: "none", refused: false, source: label });
      return;
    }
    const produced = readAgentOutput({ patch: readText(path.join(args.agent, "change.patch")), plan: readText(path.join(args.agent, "measure.json")), notes: readText(path.join(args.agent, "notes.md")) });
    if (!produced.patch) {
      output({ change: "empty", refused: false, source: label });
      return;
    }
    publishChange(args.out, produced.patch, produced.plan ?? { command: "true", runs: 1 }, label);
    if (!produced.plan) output({ plan: "missing" });
  },
  measure(args) {
    const { plan } = readVerified(args);
    const patch = path.join(args.change, "change.patch");
    execFileSync("git", ["apply", "--check", patch], { cwd: args.cwd });
    const result = measure({ plan, patch, cwd: args.cwd, minutes: Number(args.minutes) });
    writeFileSync(args.out, `${JSON.stringify(result)}\n`);
    console.log(JSON.stringify({ before: result.before, after: result.after }));
    for (const entry of result.log.filter(item => item.failed)) console.log(JSON.stringify({ round: entry.round, variant: entry.variant, tests: entry.tests ?? [] }));
  },
  decide(args) {
    const { patch } = readVerified(args);
    const files = existsSync(args.results) ? readdirSync(args.results, { recursive: true }).filter(name => String(name).endsWith(".json")) : [];
    const measured = combine(files.map(name => readJson(path.join(args.results, String(name)))));
    const decision = judge(measured, changeStats(patch));
    output({
      open: decision.open,
      verdict: decision.verdict,
      labels: decision.labels.join(","),
      required: decision.required,
      before: `${measured.before.runs},${measured.before.failed}`,
      after: `${measured.after.runs},${measured.after.failed}`,
    });
  },
  body(args) {
    const { patch } = readVerified(args);
    const judged = readJudged(args);
    if (!judged) throw new Error("the measured counts are missing");
    writeFileSync(args.out, prBody({ issue: Number(args.issue), runUrl: args["run-url"], source: args.source, ...judged, stats: changeStats(patch), fullCheck: args["full-check"], fullCheckWorkflow: args.workflow }));
    output({ title: prTitle(Number(args.issue)) });
  },
  record(args) {
    let command = null;
    try {
      command = readVerified(args).plan.command;
    } catch {
      command = null;
    }
    let agent = null;
    let notes = "";
    if (args.model) {
      let summary = {};
      try {
        summary = readJson(path.join(args.agent, "summary.json"));
      } catch {
        summary = {};
      }
      agent = { model: args.model, seconds: Number(summary.seconds), costUsd: Number(summary.costUsd ?? NaN) };
      notes = readText(path.join(args.agent, "notes.md"));
    }
    const judged = readJudged(args);
    const fullCheck = args["full-check"] || null;
    const pr = Number(args.pr) || null;
    const duplicateOf = Number(args.duplicate) || null;
    const state = endState({
      request: { openPr: args["open-pr"] === "true", rehearsal: args.rehearsal === "true" },
      stats: { forbidden: args.refused === "true" ? ["refused"] : [] },
      change: args.changed,
      decision: judged?.decision,
      pushed: args.pushed === "true",
      duplicateOf,
      fullCheck,
      pr,
    });
    writeFileSync(args.out, attemptRecord({ runId: args.run, runUrl: args["run-url"], state, source: args.source || "unknown", measured: judged?.measured, decision: judged?.decision, fullCheck, fullCheckWorkflow: args.workflow, pr, command, duplicateOf, agent, notes }));
    output({ state });
  },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, ...rest] = process.argv.slice(2);
  Promise.resolve()
    .then(() => {
      if (!commands[name]) throw new Error(`unknown command ${name ?? ""}`);
      return commands[name](options(rest));
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : "auto-fix step failed");
      process.exitCode = 1;
    });
}
