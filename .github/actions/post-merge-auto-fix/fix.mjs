import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIX_BRANCH_PREFIX = "harness/auto-fix-";
export const FORBIDDEN_PATHS = Object.freeze([".github/", "AGENTS.md", "CLAUDE.md", "vercel.json", "vercel.ts"]);
export const RUNNERS = Object.freeze(["windows-2022", "macos-15", "macos-15-intel", "ubuntu-latest"]);
export const FULL_CHECKS = Object.freeze(["windows-role-runtime", "macos-runtime-contracts", "none"]);
export const LABELS = Object.freeze({ notReproduced: "auto-fix:not-reproduced", underVerified: "auto-fix:under-verified" });
export const MAX_RUNS = 200;
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
  if (!NAME.test(String(raw.prepared ?? ""))) throw new Error("prepared must be a lowercase name");
  return { issue, runner: raw.runner, workflow: raw.workflow, prepared: raw.prepared, openPr: raw.openPr === true || raw.openPr === "true" };
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
  recordOnly: "recorded only: the change was not opened as a pull request",
  stillFailing: "recorded only: the failure remained after the change",
  fullCheckFailed: "recorded only: the full check failed on the fix branch",
  duplicate: "recorded only: an open pull request already carries the same change",
  refused: "refused: the change touches a path that an automatic fix must not change",
  unfinished: "did not finish",
});

export function endState({ request, stats, decision, pushed, duplicateOf, fullCheck, pr }) {
  if (stats?.forbidden?.length) return "refused";
  if (pr) return "opened";
  if (duplicateOf) return "duplicate";
  if (!decision) return "unfinished";
  if (decision.verdict === "still-failing") return "stillFailing";
  if (!decision.open) return decision.verdict === "not-measured" ? "unfinished" : "recordOnly";
  if (!pushed) return "unfinished";
  if (fullCheck === "failed") return "fullCheckFailed";
  return request?.openPr ? "unfinished" : "rehearsed";
}

const fence = text => {
  const longest = Math.max(2, ...[...String(text).matchAll(/`+/g)].map(match => match[0].length));
  return "`".repeat(longest + 1);
};

export function attemptRecord({ runId, runUrl, state, source, measured, decision, fullCheck, fullCheckWorkflow, pr, command, duplicateOf }) {
  const lines = [
    `Attempt: run ${runId}`,
    `Run: ${runUrl}`,
    `End: ${END_STATES[state]}`,
    `Source of the change: ${source}`,
    `Reproduced: ${measured ? `${measured.before.failed} failed of ${measured.before.runs} runs before the change` : "not measured"}`,
    `Verification: ${measured && decision ? `${measured.after.failed} failed of ${measured.after.runs} runs after the change, ${decision.required} required, ${decision.verdict}` : "not measured"}`,
    `Full check: ${fullCheckWorkflow && fullCheckWorkflow !== "none" ? `${fullCheckWorkflow}: ${fullCheck ?? "not run"}` : "not run"}`,
    `Pull request: ${pr ? `#${pr}` : duplicateOf ? `none, same change as #${duplicateOf}` : "none"}`,
    `Usage: no model was used`,
    `Measurement command: ${command ?? "none"}`,
  ];
  const text = lines.join("\n");
  const mark = fence(text);
  return [`<!-- auto-fix-attempt run=${runId} end=${state} -->`, `Automatic fix attempt: ${END_STATES[state]}.`, "", mark, text, mark, ""].join("\n");
}

function runCommand(command, cwd, timeoutMs) {
  const started = Date.now();
  const run = spawnSync("bash", ["-c", command], { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, killSignal: "SIGKILL" });
  return { failed: run.status !== 0, timedOut: run.error?.code === "ETIMEDOUT", seconds: Math.round((Date.now() - started) / 1000) };
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
        log.push({ round, variant, failed: result.failed, seconds: result.seconds });
      }
    }
  } finally {
    if (applied) apply("before");
  }
  return { ...totals, log };
}

const readJson = file => JSON.parse(readFileSync(file, "utf8"));
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

const commands = {
  plan(args) {
    const request = readRequest({ issue: process.env.INPUT_ISSUE, runner: process.env.INPUT_RUNNER, workflow: process.env.INPUT_WORKFLOW, prepared: process.env.INPUT_PREPARED, openPr: process.env.INPUT_OPEN_PR });
    const source = path.join(here, "prepared", request.prepared);
    const patch = readFileSync(path.join(source, "change.patch"), "utf8");
    const plan = readMeasurePlan(readJson(path.join(source, "measure.json")));
    const stats = changeStats(patch);
    mkdirSync(args.out, { recursive: true });
    writeFileSync(path.join(args.out, "change.patch"), patch);
    writeFileSync(path.join(args.out, "measure.json"), `${JSON.stringify(plan)}\n`);
    writeFileSync(path.join(args.out, "change.json"), `${JSON.stringify({ request, stats, source: `prepared change ${request.prepared}` })}\n`);
    writeFileSync(path.join(args.out, "fix.mjs"), readFileSync(fileURLToPath(import.meta.url)));
    output({ issue: request.issue, runner: request.runner, workflow: request.workflow, open_pr: request.openPr, branch: branchName(request.issue, args.run), refused: stats.forbidden.length > 0 });
  },
  measure(args) {
    const plan = readMeasurePlan(readJson(args.plan));
    execFileSync("git", ["apply", "--check", args.patch], { cwd: args.cwd });
    const result = measure({ plan, patch: args.patch, cwd: args.cwd, minutes: Number(args.minutes) });
    writeFileSync(args.out, `${JSON.stringify(result)}\n`);
    console.log(JSON.stringify({ before: result.before, after: result.after }));
  },
  decide(args) {
    const change = readJson(path.join(args.change, "change.json"));
    const files = existsSync(args.results) ? readdirSync(args.results, { recursive: true }).filter(name => String(name).endsWith(".json")) : [];
    const measured = combine(files.map(name => readJson(path.join(args.results, String(name)))));
    const decision = change.stats.forbidden.length ? { verdict: "refused", open: false, labels: [], required: 0 } : judge(measured, change.stats);
    writeFileSync(args.out, `${JSON.stringify({ measured, decision })}\n`);
    output({ open: decision.open, verdict: decision.verdict, labels: decision.labels.join(",") });
  },
  body(args) {
    const change = readJson(path.join(args.change, "change.json"));
    const { measured, decision } = readJson(args.decision);
    writeFileSync(args.out, prBody({ issue: change.request.issue, runUrl: args["run-url"], source: change.source, measured, decision, stats: change.stats, fullCheck: args["full-check"], fullCheckWorkflow: change.request.workflow }));
    output({ title: prTitle(change.request.issue) });
  },
  record(args) {
    const change = existsSync(path.join(args.change, "change.json")) ? readJson(path.join(args.change, "change.json")) : null;
    const judged = existsSync(args.decision) ? readJson(args.decision) : null;
    const plan = existsSync(path.join(args.change, "measure.json")) ? readJson(path.join(args.change, "measure.json")) : null;
    const fullCheck = args["full-check"] || null;
    const pr = Number(args.pr) || null;
    const duplicateOf = Number(args.duplicate) || null;
    const state = endState({ request: change?.request, stats: change?.stats, decision: judged?.decision, pushed: args.pushed === "true", duplicateOf, fullCheck, pr });
    writeFileSync(args.out, attemptRecord({ runId: args.run, runUrl: args["run-url"], state, source: change?.source ?? "unknown", measured: judged?.measured, decision: judged?.decision, fullCheck, fullCheckWorkflow: change?.request.workflow, pr, command: plan?.command, duplicateOf }));
    output({ state });
  },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [name, ...rest] = process.argv.slice(2);
    if (!commands[name]) throw new Error(`unknown command ${name ?? ""}`);
    commands[name](options(rest));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "auto-fix step failed");
    process.exitCode = 1;
  }
}
