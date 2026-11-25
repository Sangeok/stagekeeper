import { execFileSync, spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const FIX_BRANCH_PREFIX = "harness/auto-fix-";
export const FORBIDDEN_PATHS = Object.freeze([".github/", "AGENTS.md", "CLAUDE.md", "vercel.json", "vercel.ts"]);
export const RUNNERS = Object.freeze(["windows-2022", "macos-15", "macos-15-intel", "ubuntu-latest"]);
export const FULL_CHECKS = Object.freeze(["windows-role-runtime", "macos-runtime-contracts", "none"]);
export const LABELS = Object.freeze({ notReproduced: "auto-fix:not-reproduced", underVerified: "auto-fix:under-verified", failuresRemain: "auto-fix:failures-remain" });
export const REPRODUCTION_KINDS = Object.freeze(["always", "sometimes", "load", "skipped", "prepared", "not-reproduced", "unhandled"]);
export const RUNNABLE_KINDS = Object.freeze(["always", "sometimes", "load", "skipped", "prepared"]);
export const PLAIN_RUNS = 5;
export const PLAIN_FAILURES = 2;
export const LOAD_MIN_RUNS = 10;
export const LOAD_MAX_RUNS = 30;
export const LOAD_STOP_FAILURES = 3;
export const LOAD_PARALLEL = 4;
export const MEASURE_FLOOR = 20;
export const LOAD_MEASURE_RUNNERS = 3;
export const LOAD_DESIGN_EFFECT = 1.5;
export const CLEARLY_FEWER = 0.05;
export const REMAINING_SHARE = 0.25;
export const STEP_ENVIRONMENT = Object.freeze({
  "macos-15": { workflow: "macos-runtime-contracts", env: { STAGEKEEPER_MACOS_RUNTIME_REQUIRED: "1", STAGEKEEPER_RELEASED_READERS: "required" } },
  "macos-15-intel": { workflow: "macos-runtime-contracts", env: { STAGEKEEPER_MACOS_RUNTIME_REQUIRED: "1", STAGEKEEPER_RELEASED_READERS: "required" } },
  "windows-2022": { workflow: "windows-role-runtime", env: { STAGEKEEPER_RELEASED_READERS: "required" } },
  "ubuntu-latest": { workflow: null, env: {} },
});
export const MODELS = Object.freeze(["claude-sonnet-5-5", "claude-opus-5-5"]);
export const SOURCES = Object.freeze(["prepared", "agent", "reproduce-only"]);
export const MAX_RUNS = 200;
export const MAX_NOTES = 6000;
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const MAX_NAMES = 20;
const MAX_NAME_LENGTH = 300;
const RUN_LIMIT_MS = 6 * 60 * 1000;
const SAFE_PATH = /^[A-Za-z0-9_@][A-Za-z0-9_@.\/-]*$/;
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
  if (!SOURCES.includes(source)) throw new Error(`source must be one of ${SOURCES.join(", ")}`);
  const commit = String(raw.commit ?? "").trim();
  if (commit && !/^[0-9a-f]{40}$/.test(commit)) throw new Error("commit must be a full commit id");
  const rehearsal = commit !== "";
  const openPr = raw.openPr === true || raw.openPr === "true";
  if (rehearsal && (openPr || raw.workflow !== "none")) throw new Error("a run on an older commit opens no pull request and calls no full check");
  const reproduction = raw.reproduction || "required";
  if (reproduction !== "required" && reproduction !== "skip") throw new Error("reproduction must be required or skip");
  const request = { issue, runner: raw.runner, workflow: raw.workflow, openPr, source, commit, rehearsal, reproduction };
  if (source === "prepared") {
    if (!NAME.test(String(raw.prepared ?? ""))) throw new Error("prepared must be a lowercase name");
    return { ...request, prepared: raw.prepared };
  }
  if (source === "agent" && !MODELS.includes(raw.model)) throw new Error(`model must be one of ${MODELS.join(", ")}`);
  if (source === "reproduce-only" && (openPr || raw.workflow !== "none" || reproduction === "skip")) throw new Error("a run that only reproduces opens no pull request, calls no full check and cannot skip the reproduction");
  const runs = String(raw.runs ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (runs.length === 0 || runs.length > 10 || runs.some(value => !/^[1-9]\d{0,18}$/.test(value))) throw new Error("runs must list one to ten run numbers");
  const job = String(raw.job ?? "").trim();
  if (!job || job.length > 120 || /[\r\n`]/.test(job)) throw new Error("job must name the failed job");
  return { ...request, ...(source === "agent" ? { model: raw.model } : {}), runs, job };
}

export const isSafeTestPath = file => typeof file === "string" && file.length <= 300 && SAFE_PATH.test(file) && !file.split("/").includes("..") && isTestFile(file);

export function readMeasurePlan(raw) {
  if (!isSafeTestPath(raw?.file)) throw new Error("the measurement needs one test file inside the repository");
  if (!Array.isArray(raw.names) || raw.names.length > MAX_NAMES || raw.names.some(name => typeof name !== "string" || !name || name.length > MAX_NAME_LENGTH || /[\r\n]/.test(name))) throw new Error("the measurement names tests it cannot read");
  if (raw.match !== "named" && raw.match !== "any") throw new Error("match must be named or any");
  if (raw.match === "named" && raw.names.length === 0) throw new Error("a measurement by name needs a test name");
  if (typeof raw.load !== "boolean") throw new Error("load must be true or false");
  if (!Number.isInteger(raw.runs) || raw.runs < 1 || raw.runs > MAX_RUNS) throw new Error(`runs must be between 1 and ${MAX_RUNS}`);
  if (!RUNNABLE_KINDS.includes(raw.kind)) throw new Error(`kind must be one of ${RUNNABLE_KINDS.join(", ")}`);
  return { file: raw.file, names: [...raw.names], match: raw.match, load: raw.load, runs: raw.runs, kind: raw.kind };
}

export const describePlan = plan => `node --test ${plan.file}${plan.load ? `, ${LOAD_PARALLEL} at once with every core busy` : ", one at a time without load"}`;

export const requiredPasses = (runs, failed) => (failed > 0 ? Math.ceil((PASSES_PER_FAILURE * runs) / failed) : runs);
export const branchName = (issue, runId) => `${FIX_BRANCH_PREFIX}${issue}-${runId}`;

const cleanLine = line => line.replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z /, "");

export function failuresInLog(text) {
  const lines = stripAnsi(text).split(/\r?\n/).map(cleanLine);
  const failures = [];
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s*not ok \d+ - (.+)$/.exec(lines[index]);
    if (!match) continue;
    const block = [];
    for (let next = index + 1; next < lines.length && next <= index + 40 && !/^\s*(?:not ok|ok) \d+ |^\s*# Subtest: /.test(lines[next]); next++) block.push(lines[next]);
    if (block.some(line => /failureType: '?subtestsFailed/.test(line))) continue;
    const location = block.map(line => /^\s*location: '(.+):\d+:\d+'\s*$/.exec(line)?.[1]).find(Boolean);
    if (!location) continue;
    const start = block.findIndex(line => /^\s*error: /.test(line));
    const length = start < 0 ? 0 : block.slice(start + 1).findIndex(line => /^\s*(?:code|name|expected|actual|operator|stack): |^\s*\.\.\.\s*$/.test(line));
    const error = start < 0 ? "" : block.slice(start, start + 1 + (length < 0 ? 5 : Math.min(length, 5))).join(" ").replace(/^\s*error: (?:\|-)?/, "");
    failures.push({ name: match[1].replace(/\s+#.*$/, "").trim(), location: location.replaceAll("\\\\", "/").replaceAll("\\", "/"), error: normalizeError(error) });
  }
  return failures;
}

export const normalizeError = text =>
  String(text)
    .replace(/[A-Za-z]+:\/\/\S+/g, "<address>")
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@-]+){2,}/g, "<path>")
    .replace(/\d+(?:\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

export function fingerprint(logs, tracked) {
  const known = tracked.filter(isSafeTestPath);
  const byFile = new Map();
  let unmatched = 0;
  for (const failure of logs.flatMap(failuresInLog)) {
    const file = known.filter(candidate => failure.location === candidate || failure.location.endsWith(`/${candidate}`)).sort((left, right) => right.length - left.length)[0];
    if (!file || failure.name.length > MAX_NAME_LENGTH) {
      unmatched += 1;
      continue;
    }
    const entry = byFile.get(file) ?? { file, count: 0, names: new Set(), errors: new Set() };
    entry.count += 1;
    entry.names.add(failure.name);
    if (failure.error) entry.errors.add(failure.error);
    byFile.set(file, entry);
  }
  const ranked = [...byFile.values()].sort((left, right) => right.count - left.count || left.file.localeCompare(right.file));
  if (ranked.length === 0) return { file: null, names: [], errors: [], otherFiles: [], unmatched };
  const [chosen, ...others] = ranked;
  return { file: chosen.file, names: [...chosen.names].sort().slice(0, MAX_NAMES), errors: [...chosen.errors].sort().slice(0, 10), otherFiles: others.map(entry => entry.file), unmatched };
}

export function outcomeOf(result, plan) {
  if (result.timedOut) return "cut";
  if (plan.match === "any") return result.failed ? "original" : "passed";
  if (result.failed) return plan.names.some(name => result.names.includes(name)) ? "original" : "other";
  return plan.names.some(name => result.executed.includes(name)) ? "passed" : "not-run";
}

const emptyCounts = () => ({ runs: 0, failed: 0, original: 0, notRun: 0, dropped: 0 });

function count(totals, outcome) {
  if (outcome === "cut") return;
  if (outcome === "not-run") {
    totals.notRun += 1;
    return;
  }
  totals.runs += 1;
  if (outcome !== "passed") totals.failed += 1;
  if (outcome === "original") totals.original += 1;
}

export function readTap(output) {
  const names = [];
  const executed = [];
  for (const line of String(output).split(/\r?\n/)) {
    const match = /^\s*(not ok|ok) \d+ - (.+?)(\s+# (?:SKIP|TODO)\b.*)?$/i.exec(line);
    if (!match) continue;
    if (match[3]) continue;
    executed.push(match[2].trim());
    if (match[1] === "not ok") names.push(match[2].trim());
  }
  const ran = /^# tests (\d+)$/m.exec(String(output))?.[1];
  return { names: [...new Set(names)], executed, ran: ran === undefined ? null : Number(ran) };
}

function runTestFile(file, cwd, env, timeoutMs) {
  return new Promise(resolve => {
    const started = Date.now();
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT"));
    const child = spawn(process.execPath, ["--test", "--test-reporter=tap", file], { cwd, env: { ...inherited, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    let timedOut = false;
    child.stdout.on("data", chunk => { text += chunk; });
    child.stderr.on("data", chunk => { text += chunk; });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    const finish = code => {
      clearTimeout(timer);
      resolve({ failed: code !== 0, timedOut, seconds: Math.round((Date.now() - started) / 1000), ...readTap(text) });
    };
    child.on("error", () => finish(1));
    child.on("close", finish);
  });
}

const startBusyLoop = () => spawn(process.execPath, ["-e", "for(;;){}"], { stdio: "ignore" });

export async function runBatch({ file, cwd, env = {}, load, size, timeoutMs, startLoad = startBusyLoop }) {
  const busy = load ? Array.from({ length: os.cpus().length }, startLoad) : [];
  try {
    return await Promise.all(Array.from({ length: size }, () => runTestFile(file, cwd, env, Math.min(RUN_LIMIT_MS, timeoutMs))));
  } finally {
    for (const child of busy) child.kill("SIGKILL");
  }
}

export async function reproduce({ file, names, cwd, env, minutes, batch = runBatch, now = Date.now }) {
  const plan = { file, names, match: "named" };
  const deadline = now() + minutes * 60 * 1000;
  const plain = emptyCounts();
  const loaded = emptyCounts();
  const others = {};
  const log = [];
  let batches = 0;
  const record = (stage, totals, results) => {
    batches += 1;
    for (const result of results) {
      const outcome = outcomeOf(result, plan);
      count(totals, outcome);
      if (outcome === "other") for (const name of result.names) others[name] = (others[name] ?? 0) + 1;
      log.push({ stage, batch: batches, outcome, seconds: result.seconds, ran: result.ran });
    }
  };
  while (plain.runs + plain.notRun < PLAIN_RUNS && now() < deadline) record("plain", plain, await batch({ file, cwd, env, load: false, size: 1, timeoutMs: Math.max(1000, deadline - now()) }));
  const finished = kind => ({ kind, load: kind === "load", plain, loaded, others, cutShort: now() >= deadline, log });
  if (plain.runs === 0) return finished("unhandled");
  if (plain.original === plain.runs && plain.runs === PLAIN_RUNS) return finished("always");
  if (plain.original >= PLAIN_FAILURES) return finished("sometimes");
  while (loaded.runs + loaded.notRun < LOAD_MAX_RUNS && now() < deadline && !(loaded.runs >= LOAD_MIN_RUNS && loaded.original >= LOAD_STOP_FAILURES)) {
    const size = Math.min(LOAD_PARALLEL, LOAD_MAX_RUNS - loaded.runs - loaded.notRun);
    record("load", loaded, await batch({ file, cwd, env, load: true, size, timeoutMs: Math.max(1000, deadline - now()) }));
  }
  return finished(loaded.original > 0 ? "load" : "not-reproduced");
}

const timesEach = names => {
  const times = new Map();
  for (const name of names) times.set(name, (times.get(name) ?? 0) + 1);
  return times;
};

export function testsInEveryRun(runs) {
  const [first, ...rest] = runs.map(timesEach);
  if (!first) return new Map();
  return new Map([...first].map(([name, times]) => [name, Math.min(times, ...rest.map(run => run.get(name) ?? 0))]).filter(([, times]) => times > 0));
}

export function droppedTests(expected, executed) {
  const times = timesEach(executed);
  return [...expected].filter(([name, wanted]) => (times.get(name) ?? 0) < wanted).map(([name]) => name);
}

export const measureRunners = plan => (plan.load ? LOAD_MEASURE_RUNNERS : 1);
export const measureRuns = kind => (kind === "always" ? PLAIN_RUNS : MEASURE_FLOOR);

export function combine(results) {
  const sum = key => results.reduce((total, result) => Object.fromEntries(Object.keys(total).map(name => [name, total[name] + (result[key]?.[name] ?? 0)])), emptyCounts());
  const merged = key => {
    const tests = {};
    for (const result of results) for (const [name, times] of Object.entries(result[key] ?? {})) tests[name] = (tests[name] ?? 0) + times;
    return tests;
  };
  const compared = results.map(result => result.compared).filter(Number.isInteger);
  return { before: sum("before"), after: sum("after"), remaining: merged("remaining"), missing: merged("missing"), compared: compared.length ? Math.min(...compared) : 0 };
}

const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let index = 1; index <= k; index++) value = (value * (n - k + index)) / index;
  return value;
};

export function chanceOfSoFewFailures(before, after, designEffect = 1) {
  const scale = value => Math.round(value / designEffect);
  const [beforeRuns, beforeFailed, afterRuns, afterFailed] = [before.runs, before.failed, after.runs, after.failed].map(scale);
  const runs = beforeRuns + afterRuns;
  const failed = beforeFailed + afterFailed;
  if (afterRuns === 0 || beforeRuns === 0) return 1;
  let chance = 0;
  for (let value = 0; value <= afterFailed; value++) chance += choose(failed, value) * choose(runs - failed, afterRuns - value);
  return chance / choose(runs, afterRuns);
}

export function judge({ before, after }, { testOnly, kind, load }) {
  const none = { open: false, labels: [], required: 0 };
  if (before.runs === 0 || after.runs === 0 || after.notRun > 0) return { verdict: "not-measured", ...none };
  if (after.dropped > 0) return { verdict: "tests-dropped", ...none };
  if (before.original === 0) {
    if (after.failed > 0) return { verdict: "failing-unreproduced", ...none };
    return { verdict: "not-reproduced", open: kind === "skipped" && testOnly, labels: [LABELS.notReproduced], required: 0 };
  }
  const required = requiredPasses(before.runs, before.failed);
  if (after.original > 0) return { verdict: "still-failing", open: false, labels: [], required };
  if (after.failed > 0) {
    const mostlyGone = after.failed * before.runs <= REMAINING_SHARE * before.failed * after.runs;
    const fewer = mostlyGone && chanceOfSoFewFailures(before, after, load ? LOAD_DESIGN_EFFECT : 1) < CLEARLY_FEWER;
    return fewer ? { verdict: "failures-remain", open: true, labels: [LABELS.failuresRemain], required } : { verdict: "still-failing", open: false, labels: [], required };
  }
  return after.runs >= required ? { verdict: "verified", open: true, labels: [], required } : { verdict: "under-verified", open: true, labels: [LABELS.underVerified], required };
}

export function fullCheckResult(workflow, results) {
  if (workflow === "none") return "not-run";
  const result = results[workflow];
  return result === "success" ? "passed" : "failed";
}

export const prTitle = issue => `fix: auto-fix attempt for #${issue}`;

export const comparedLine = compared => (compared > 0 ? `${compared}, each ran in every passing run after the change` : "none: no test ran in every run before the change, so a dropped test would not be seen");

export function prBody({ issue, runUrl, source, measured, decision, stats, fullCheck, fullCheckWorkflow, otherTestFiles = [], compared = 0 }) {
  return [
    `Automatic fix attempt for #${issue}. A person reviews and merges this pull request; the workflow does not merge it.`,
    "",
    "The counts below come from repeating one test file before and after the change. The workflow chose the file and the way to repeat it from the failure logs; the source of the change could not change them.",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| Issue | #${issue} |`,
    `| Workflow run | ${runUrl} |`,
    `| Source of the change | ${source} |`,
    `| Before the change | ${measured.before.failed} failed of ${measured.before.runs} runs |`,
    `| After the change | ${measured.after.failed} failed of ${measured.after.runs} runs |`,
    `| Runs in which a test named in the failure logs failed | ${measured.before.original} before, ${measured.after.original} after |`,
    `| Passes required after the change | ${decision.required} |`,
    `| Tests compared before and after | ${comparedLine(compared)} |`,
    `| Measurement | ${decision.verdict} |`,
    `| Full check | ${fullCheckWorkflow === "none" ? "not run" : `${fullCheckWorkflow}: ${fullCheck}`} |`,
    `| Files changed | ${stats.files} |`,
    `| Lines added / removed | ${stats.addedLines} / ${stats.removedLines} |`,
    `| Product code files | ${stats.productFiles} |`,
    `| Shipped plugin files | ${stats.pluginFiles} |`,
    `| Assertion lines added / removed | ${stats.addedAssertions} / ${stats.removedAssertions} |`,
    `| Adds a skip marker | ${stats.addsSkip ? "yes" : "no"} |`,
    "",
    ...(decision.verdict === "failures-remain" ? ["Runs still failed after the change, in tests the failure logs did not name. They were clearly fewer than before. The names of those tests are in the issue; decide from them whether this change is enough.", ""] : []),
    ...(stats.testOnly ? ["This change touches only test files. The measurement does not show the tests still check the same thing: read the change for emptied test bodies, weaker assertions and longer deadlines.", ""] : []),
    ...(otherTestFiles.length ? [`The measurement repeated one test file. The change also touches ${otherTestFiles.length} other test files, which were not compared: ${[...otherTestFiles.filter(file => SAFE_PATH.test(file)).map(file => `\`${file}\``), ...(otherTestFiles.some(file => !SAFE_PATH.test(file)) ? ["others whose names are not shown"] : [])].join(", ")}.`, ""] : []),
    "The cause and what was repeated are in the issue.",
    "",
  ].join("\n");
}

export const END_STATES = Object.freeze({
  opened: "opened a pull request",
  rehearsed: "finished without a pull request because none was requested",
  reproduced: "recorded only: the failure was reproduced and no change was requested",
  notReproduced: "recorded only: the failure was not reproduced, so no agent was called",
  unhandled: "recorded only: the logs name no test this workflow can repeat, so no agent was called",
  noChange: "recorded only: the agent proposed no change",
  noOutput: "did not finish: the agent job produced no usable output",
  recordOnly: "recorded only: the change was not opened as a pull request",
  stillFailing: "recorded only: the failure remained after the change",
  testsDropped: "recorded only: a test that ran before the change did not run after it",
  failingUnreproduced: "recorded only: the failure was not seen before the change and a run failed after it",
  fullCheckFailed: "recorded only: the full check failed on the fix branch",
  duplicate: "recorded only: an open pull request already carries the same change",
  refused: "refused: the change touches a path that an automatic fix must not change",
  unfinished: "did not finish",
});

export function endState({ request, reproduction, stats, change, decision, pushed, duplicateOf, fullCheck, pr }) {
  if (reproduction === "not-reproduced") return "notReproduced";
  if (reproduction === "unhandled") return "unhandled";
  if (request?.reproduceOnly) return RUNNABLE_KINDS.includes(reproduction) ? "reproduced" : "unfinished";
  if (change === "none") return "noOutput";
  if (change === "empty") return "noChange";
  if (stats?.forbidden?.length) return "refused";
  if (pr) return "opened";
  if (duplicateOf) return "duplicate";
  if (!decision) return "unfinished";
  if (decision.verdict === "still-failing") return "stillFailing";
  if (decision.verdict === "tests-dropped") return "testsDropped";
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

const countsLine = counts => `${counts.original} of ${counts.runs} runs failed in a named test${counts.failed > counts.original ? `, ${counts.failed - counts.original} more in other tests` : ""}${counts.notRun ? `, ${counts.notRun} did not run a named test` : ""}`;

export function reproductionLines(reproduction) {
  if (!reproduction) return ["Reproduction: none"];
  const lines = [`Reproduction: ${reproduction.kind}`];
  if (reproduction.file) lines.push(`Test file: ${inert(reproduction.file)}`);
  for (const name of reproduction.names ?? []) lines.push(`Named in the logs: ${inert(name)}`);
  if (reproduction.plain?.runs || reproduction.plain?.notRun) lines.push(`Without load: ${countsLine(reproduction.plain)}`);
  if (reproduction.loaded?.runs || reproduction.loaded?.notRun) lines.push(`Under load: ${countsLine(reproduction.loaded)}`);
  if (reproduction.cutShort) lines.push("The reproduction stopped at its time limit before it had repeated as often as planned.");
  for (const error of reproduction.errors ?? []) lines.push(`Error in the logs: ${inert(error)}`);
  if (reproduction.otherFiles?.length) lines.push(`Other test files in the logs, not repeated: ${reproduction.otherFiles.map(inert).join(", ")}`);
  if (reproduction.revertFirst) lines.push("The commit of the first failure changed this test file. When that merged change caused the failure, revert it first.");
  return lines;
}

export function attemptRecord({ runId, runUrl, state, source, reproduction, measured, decision, fullCheck, fullCheckWorkflow, pr, measuredHow, remaining, missing, compared, duplicateOf, agent, notes }) {
  const lines = [
    `Attempt: run ${runId}`,
    `Run: ${runUrl}`,
    `End: ${END_STATES[state]}`,
    `Source of the change: ${inert(source)}`,
    ...reproductionLines(reproduction),
    `Before the change: ${measured ? `${measured.before.failed} failed of ${measured.before.runs} runs, ${measured.before.original} in a named test` : "not measured"}`,
    `Verification: ${measured && decision ? `${measured.after.failed} failed of ${measured.after.runs} runs after the change, ${measured.after.original} in a named test, ${decision.required} required, ${decision.verdict}` : "not measured"}`,
    ...Object.entries(remaining ?? {}).map(([name, times]) => `Failed after the change: ${times} runs, ${inert(name)}`),
    ...(measured && decision ? [`Tests compared before and after: ${Number(compared) > 0 ? compared : "none"}`] : []),
    ...Object.entries(missing ?? {}).map(([name, times]) => `Ran before the change and not after it: ${times} passing runs, ${inert(name)}`),
    `Full check: ${fullCheckWorkflow && fullCheckWorkflow !== "none" ? `${fullCheckWorkflow}: ${fullCheck ?? "not run"}` : "not run"}`,
    `Pull request: ${pr ? `#${pr}` : duplicateOf ? `none, same change as #${duplicateOf}` : "none"}`,
    `Usage: ${usageLine(agent)}`,
    `Measured: ${measuredHow ? inert(measuredHow) : "nothing"}`,
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

export function readAgentOutput({ patch, notes }) {
  const text = String(patch ?? "");
  if (Buffer.byteLength(text) > MAX_PATCH_BYTES) throw new Error("the change is larger than an automatic fix may be");
  return { patch: text.trim() ? text : null, notes: String(notes ?? "") };
}

export function promptText(template, values) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`the prompt names an unknown value ${name}`);
    return values[name];
  });
}

export async function measure({ plan, patch, cwd, env, minutes, batch = runBatch, apply = variant => execFileSync("git", ["apply", ...(variant === "before" ? ["-R"] : []), patch], { cwd }), now = Date.now }) {
  const deadline = now() + minutes * 60 * 1000;
  const totals = { before: emptyCounts(), after: emptyCounts() };
  const remaining = {};
  const log = [];
  const size = plan.load ? LOAD_PARALLEL : 1;
  let applied = false;
  let batches = 0;
  const done = variant => totals[variant].runs + totals[variant].notRun;
  const floor = () => (plan.kind === "always" && totals.before.failed < totals.before.runs ? Math.max(plan.runs, MEASURE_FLOOR) : plan.runs);
  const wanted = variant => (variant === "before" || totals.before.failed === 0 ? floor() : Math.max(floor(), requiredPasses(totals.before.runs, totals.before.failed)));
  const due = variant => done(variant) < wanted(variant) && !(variant === "after" && totals.after.failed > 0 && done("after") >= floor());
  const executedBefore = [];
  const executedInPasses = [];
  try {
    for (let round = 1; now() < deadline && (due("before") || due("after")); round++) {
      for (const variant of round % 2 ? ["before", "after"] : ["after", "before"]) {
        if (!due(variant) || now() >= deadline) continue;
        if ((variant === "after") !== applied) {
          apply(variant);
          applied = variant === "after";
        }
        batches += 1;
        for (const result of await batch({ file: plan.file, cwd, env, load: plan.load, size, timeoutMs: Math.max(1000, deadline - now()) })) {
          const outcome = outcomeOf(result, plan);
          count(totals[variant], outcome);
          if (variant === "after" && result.failed && outcome !== "cut") for (const name of result.names) remaining[name] = (remaining[name] ?? 0) + 1;
          if (variant === "before" && outcome !== "cut") executedBefore.push(result.executed);
          if (variant === "after" && outcome === "passed") executedInPasses.push(result.executed);
          log.push({ round, batch: batches, variant, outcome, seconds: result.seconds, ran: result.ran, ...(result.names.length ? { tests: result.names.slice(0, 10) } : {}) });
        }
      }
    }
  } finally {
    if (applied) apply("before");
  }
  const expected = testsInEveryRun(executedBefore);
  const missing = {};
  for (const executed of executedInPasses) {
    const dropped = droppedTests(expected, executed);
    if (dropped.length) totals.after.dropped += 1;
    for (const name of dropped) missing[name] = (missing[name] ?? 0) + 1;
  }
  return { ...totals, remaining, missing, compared: expected.size, log };
}

export const digestOf = text => createHash("sha256").update(text).digest("hex");

export function verifyChange({ patch, plan }, expected) {
  if (!/^[0-9a-f]{64}$/.test(String(expected.patchSha)) || !/^[0-9a-f]{64}$/.test(String(expected.planSha))) throw new Error("the expected digests are missing");
  if (digestOf(patch) !== expected.patchSha) throw new Error("the change is not the one that was checked");
  if (digestOf(plan) !== expected.planSha) throw new Error("the measurement plan is not the one that was checked");
}

export function readCounts(text) {
  const match = /^(\d+),(\d+),(\d+)$/.exec(String(text ?? ""));
  return match ? { runs: Number(match[1]), failed: Number(match[2]), original: Number(match[3]) } : null;
}

export function shortNames(remaining, limit = 5) {
  return Object.fromEntries(Object.entries(remaining).sort((left, right) => right[1] - left[1]).slice(0, limit).map(([name, times]) => [name.replace(/[\r\n]/g, " ").slice(0, 120), times]));
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
  output({ change: "ready", refused: stats.forbidden.length > 0, source, patch_sha: digestOf(patch), plan_sha: digestOf(planText), runners: measureRunners(plan) });
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
      reproduction: process.env.INPUT_REPRODUCTION,
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
      reproduction: request.reproduction,
      base: request.commit || args.dev,
    });
  },
  async logs(args) {
    const token = process.env.GH_TOKEN;
    const api = `https://api.github.com/repos/${args.repository}`;
    const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
    mkdirSync(args.out, { recursive: true });
    const written = [];
    const commits = [];
    for (const run of args.runs.split(",")) {
      const described = await fetch(`${api}/actions/runs/${run}`, { headers });
      if (described.ok) commits.push((await described.json()).head_sha);
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
    writeFileSync(path.join(args.out, "commits.txt"), `${commits.filter(commit => /^[0-9a-f]{40}$/.test(String(commit))).join("\n")}\n`);
    console.log(`${written.length} failure logs`);
  },
  async reproduce(args) {
    const logs = readFileSync(path.join(args.logs, "logs.txt"), "utf8").trim().split("\n").filter(Boolean);
    const tracked = execFileSync("git", ["ls-files"], { cwd: args.cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean);
    const print = fingerprint(logs.map(file => readFileSync(file, "utf8")), tracked);
    mkdirSync(args.out, { recursive: true });
    const publish = (reproduction, plan) => {
      writeFileSync(path.join(args.out, "reproduction.json"), `${JSON.stringify(reproduction)}\n`);
      if (plan) writeFileSync(path.join(args.out, "measure.json"), `${JSON.stringify(plan)}\n`);
      console.log(JSON.stringify({ kind: reproduction.kind, file: reproduction.file, names: reproduction.names, plain: reproduction.plain, loaded: reproduction.loaded }));
    };
    const described = { file: print.file, names: print.names, errors: print.errors, otherFiles: print.otherFiles };
    if (!print.file) {
      publish({ kind: "unhandled", ...described });
      return;
    }
    if (args.skip === "true") {
      publish({ kind: "skipped", ...described }, { file: print.file, names: print.names, match: "named", load: false, runs: MEASURE_FLOOR, kind: "skipped" });
      return;
    }
    const result = await reproduce({ file: print.file, names: print.names, cwd: args.cwd, env: STEP_ENVIRONMENT[args.runner]?.env ?? {}, minutes: Number(args.minutes) });
    for (const entry of result.log) console.log(JSON.stringify(entry));
    let revertFirst = false;
    if (result.kind === "always") {
      const first = readText(path.join(args.logs, "commits.txt")).split("\n").filter(Boolean)[0];
      try {
        revertFirst = Boolean(first) && execFileSync("git", ["diff", "--name-only", `${first}^1`, first], { cwd: args.cwd, encoding: "utf8" }).split("\n").includes(print.file);
      } catch {
        revertFirst = false;
      }
    }
    const reproduction = { kind: result.kind, ...described, plain: result.plain, loaded: result.loaded, others: shortNames(result.others), cutShort: result.cutShort, revertFirst };
    publish(reproduction, RUNNABLE_KINDS.includes(result.kind) ? { file: print.file, names: print.names, match: "named", load: result.load, runs: measureRuns(result.kind), kind: result.kind } : null);
  },
  reproduction(args) {
    let kind = "none";
    try {
      const read = readJson(path.join(args.dir, "reproduction.json"));
      if (REPRODUCTION_KINDS.includes(read.kind)) kind = read.kind;
      if (RUNNABLE_KINDS.includes(kind)) readMeasurePlan(readJson(path.join(args.dir, "measure.json")));
    } catch {
      kind = "none";
    }
    output({ kind, proceed: RUNNABLE_KINDS.includes(kind) });
  },
  prompt(args) {
    const logs = readFileSync(path.join(args.logs, "logs.txt"), "utf8").trim().split("\n").map(file => `  - ${file}`).join("\n");
    const workflow = args.workflow === "none" ? "the workflow named in the logs" : `.github/workflows/${args.workflow}.yml`;
    const plan = readMeasurePlan(readJson(path.join(args.reproduction, "measure.json")));
    const reproduction = readJson(path.join(args.reproduction, "reproduction.json"));
    const seen = reproductionLines({ ...reproduction, errors: [], otherFiles: [] }).map(line => `  - ${line}`).join("\n");
    writeFileSync(args.out, promptText(readFileSync(path.join(here, "prompt.md"), "utf8"), { workflow, job: args.job, logs, notes: args.notes, file: plan.file, repeated: describePlan(plan), seen }));
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
    const produced = readAgentOutput({ patch: readText(path.join(args.agent, "change.patch")), notes: readText(path.join(args.agent, "notes.md")) });
    if (!produced.patch) {
      output({ change: "empty", refused: false, source: label });
      return;
    }
    publishChange(args.out, produced.patch, readMeasurePlan(readJson(path.join(args.reproduction, "measure.json"))), label);
  },
  async measure(args) {
    const { plan } = readVerified(args);
    const patch = path.join(args.change, "change.patch");
    execFileSync("git", ["apply", "--check", patch], { cwd: args.cwd });
    const result = await measure({ plan, patch, cwd: args.cwd, env: STEP_ENVIRONMENT[args.runner]?.env ?? {}, minutes: Number(args.minutes) });
    writeFileSync(args.out, `${JSON.stringify(result)}\n`);
    console.log(JSON.stringify({ before: result.before, after: result.after, compared: result.compared, missing: result.missing }));
    for (const entry of result.log) console.log(JSON.stringify(entry));
  },
  decide(args) {
    const { patch, plan } = readVerified(args);
    const files = existsSync(args.results) ? readdirSync(args.results, { recursive: true }).filter(name => String(name).endsWith(".json")) : [];
    const measured = combine(files.map(name => readJson(path.join(args.results, String(name)))));
    const decision = judge(measured, { testOnly: changeStats(patch).testOnly, kind: plan.kind, load: plan.load });
    const counts = totals => `${totals.runs},${totals.failed},${totals.original}`;
    output({
      open: decision.open,
      verdict: decision.verdict,
      labels: decision.labels.join(","),
      required: decision.required,
      before: counts(measured.before),
      after: counts(measured.after),
      remaining: JSON.stringify(shortNames(measured.remaining)),
      missing: JSON.stringify(shortNames(measured.missing)),
      compared: measured.compared,
    });
  },
  body(args) {
    const { patch, plan } = readVerified(args);
    const judged = readJudged(args);
    if (!judged) throw new Error("the measured counts are missing");
    const otherTestFiles = changedFiles(patch).filter(file => isTestFile(file) && file !== plan.file);
    writeFileSync(args.out, prBody({ issue: Number(args.issue), runUrl: args["run-url"], source: args.source, ...judged, stats: changeStats(patch), fullCheck: args["full-check"], fullCheckWorkflow: args.workflow, otherTestFiles, compared: Number(args.compared) || 0 }));
    output({ title: prTitle(Number(args.issue)) });
  },
  record(args) {
    let measuredHow = null;
    try {
      measuredHow = describePlan(readVerified(args).plan);
    } catch {
      measuredHow = null;
    }
    let reproduction = null;
    try {
      reproduction = readJson(path.join(args.reproduction, "reproduction.json"));
      if (!REPRODUCTION_KINDS.includes(reproduction.kind)) reproduction = null;
    } catch {
      reproduction = null;
    }
    let remaining = {};
    try {
      remaining = shortNames(JSON.parse(args.remaining || "{}"));
    } catch {
      remaining = {};
    }
    let missing = {};
    try {
      missing = shortNames(JSON.parse(args.missing || "{}"));
    } catch {
      missing = {};
    }
    let agent = null;
    let notes = "";
    if (args.model && existsSync(path.join(args.agent, "summary.json"))) {
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
      request: { openPr: args["open-pr"] === "true", rehearsal: args.rehearsal === "true", reproduceOnly: args.requested === "reproduce-only" },
      reproduction: reproduction?.kind,
      stats: { forbidden: args.refused === "true" ? ["refused"] : [] },
      change: args.changed,
      decision: judged?.decision,
      pushed: args.pushed === "true",
      duplicateOf,
      fullCheck,
      pr,
    });
    writeFileSync(args.out, attemptRecord({ runId: args.run, runUrl: args["run-url"], state, source: args.source || "unknown", reproduction, measured: judged?.measured, decision: judged?.decision, fullCheck, fullCheckWorkflow: args.workflow, pr, measuredHow, remaining, missing, compared: Number(args.compared) || 0, duplicateOf, agent, notes }));
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
