import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TARGETS = Object.freeze([
  { workflow: "check.yml", branch: "dev" },
  { workflow: "windows-role-runtime.yml", branch: "dev" },
  { workflow: "macos-runtime-contracts.yml", branch: "dev" },
  { workflow: "check.yml", branch: "main" },
]);
export const PREFIX = "[post-merge] ";
export const NOT_STARTED = "did not start";
export const RUNNER_SETUP_STEP = "Set up job";
export const SETUP_STEPS = Object.freeze([
  RUNNER_SETUP_STEP,
  "Run actions/checkout@v5",
  "Run actions/setup-node@v5",
  "Run npm ci",
  "Run npm ci --no-audit --no-fund",
  "Run npm run db:generate",
  "Prepare project dependencies with normal lifecycle scripts",
  "Generate policy contract types",
  "Prepare the Windows role runtime",
  "Prepare the macOS runtime",
]);
export const LABELS = Object.freeze({ failed: "post-merge:rerun-failed", passed: "post-merge:rerun-passed" });
const LABEL_DETAILS = Object.freeze({
  [LABELS.failed]: { color: "b60205", description: "The latest recorded post-merge failure failed again when it was rerun" },
  [LABELS.passed]: { color: "fbca04", description: "The latest recorded post-merge failure passed when it was rerun" },
});
const STATUS_OPEN = "<!-- post-merge-status -->";
const STATUS_CLOSE = "<!-- /post-merge-status -->";
const MARKER = /<!-- post-merge-record run=(\d+) attempt=(\d+) job=\S+((?: [a-z]+=\S+)*) -->/g;
const BOT = "github-actions[bot]";
const FAILED = new Set(["failure", "timed_out", "startup_failure"]);
const PASSED = new Set(["success", "skipped", "neutral"]);
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const LOOKBACK_HOURS = 72;
const LISTED_FILES = 20;

export const FIX_MODES = Object.freeze(["off", "report", "on"]);
export const FIX_LIMITS = Object.freeze({ tries: 3, collecting: 3, perPlan: 2, unreproduced: 3, startedHours: 12, notHeld: 2 });
export const FIX_MODEL = "claude-opus-5-5";
export const FIX_WORKFLOW = "post-merge-auto-fix.yml";
export const FIX_LABEL = "auto-fix:needs-person";
export const FIX_STOP_TITLE = "[auto-fix] stopped: fixes that merged did not hold";
export const FIX_BRANCH_PREFIX = "harness/auto-fix-";
const GATES = Object.freeze(["agent-eval.yml", "pipeline-smoke.yml"]);
const ATTEMPT = /<!-- auto-fix-attempt run=(\d+)(?: attempt=\d+)? end=(\w+)(?: try=(\d+))? -->/g;
const START = /<!-- auto-fix-start try=(\d+) at=(\S+) -->/g;
const FIRST_FAILURE = /<!-- post-merge-record run=(\d+) attempt=1 job=\S+((?: [a-z]+=\S+)*) -->/g;
const MAX_RUN_TIMES = 20;
const PRACTICE_ENDS = new Set(["rehearsed", "reproduced"]);
const UNREPRODUCED_ENDS = new Set(["notReproduced", "unhandled"]);
const FIX_RUNNER = /\((windows-2022|macos-15-intel|macos-15)[,)]/;
const FULL_CHECKS = Object.freeze(["windows-role-runtime", "macos-runtime-contracts"]);

export const USAGE = "Usage: GH_TOKEN=<token> node .github/actions/post-merge-failure-record/record.mjs --repository <owner/name> [--since <ISO time>] [--until <ISO time>] [--auto-fix-mode <off|report|on>] [--dry-run]";

export const failed = conclusion => FAILED.has(conclusion);
export const titleOf = (workflowName, job, step) => `${PREFIX}${workflowName}/${job}: ${step}`;
const markerKey = (runId, attempt, job) => `<!-- post-merge-record run=${runId} attempt=${attempt} job=${encodeURIComponent(job)} `;
export const markerOf = (runId, attempt, job, fields = {}) => `${markerKey(runId, attempt, job)}${Object.entries(fields).map(([name, value]) => `${name}=${value} `).join("")}-->`;

export function failedJobs(jobs) {
  const describe = job => ({ name: job.name, url: job.url ?? null, step: (job.steps ?? []).find(step => failed(step.conclusion))?.name ?? NOT_STARTED });
  const broken = jobs.filter(job => failed(job.conclusion));
  return (broken.length ? broken : jobs.filter(job => job.conclusion && !PASSED.has(job.conclusion))).map(describe);
}

const plain = text => String(text).replaceAll("<!--", "<! --");

function failureEntry(run, job, attempt) {
  const short = run.sha.slice(0, 7);
  const lines = [`### ${short} on ${run.branch}: attempt ${attempt} failed`,
    `- Commit: [${short}](https://github.com/${run.repository}/commit/${run.sha})`,
    run.pull ? `- Pull request: #${run.pull.number} ${plain(run.pull.title)}` : "- Pull request: none found for this commit"];
  if (run.pull) {
    const shown = run.pull.files.slice(0, LISTED_FILES).map(file => `\`${plain(file)}\``).join(", ");
    const rest = run.pull.files.length - LISTED_FILES;
    lines.push(`- Changed files (${run.pull.files.length}): ${shown}${rest > 0 ? ` and ${rest} more` : ""}`);
  }
  lines.push(`- Failed job: ${job.url ? `[${job.name}](${job.url})` : job.name}, step \`${job.step}\``,
    run.previous ? `- Same workflow on the previous push: ${run.previous.conclusion} ([run](${run.previous.url}))` : "- Same workflow on the previous push: not in the scanned window",
    `- Other post-merge workflows on this commit: ${run.siblings.length ? run.siblings.map(sibling => `${sibling.workflowName} ${sibling.conclusion ?? sibling.status}`).join(", ") : "none"}`,
    `- Run: ${run.url}`);
  return lines.join("\n");
}

const rerunResult = latest => !latest ? "not-run" : PASSED.has(latest.conclusion) ? "passed" : "failed";

function rerunEntry(run, job, latest) {
  const short = run.sha.slice(0, 7);
  const outcome = !latest ? "did not run this job" : PASSED.has(latest.conclusion) ? "passed"
    : `failed again at step \`${(latest.steps ?? []).find(step => failed(step.conclusion))?.name ?? NOT_STARTED}\``;
  return [`### ${short} on ${run.branch}: rerun (attempt ${run.attempt}) ${outcome}`,
    `- Job: ${latest?.url ? `[${job.name}](${latest.url})` : job.name}`, `- Run: ${run.url}`].join("\n");
}

function issueBody(title, entries, previous) {
  const [workflowJob, step] = [title.slice(PREFIX.length, title.lastIndexOf(": ")), title.slice(title.lastIndexOf(": ") + 2)];
  return [`A post-merge check failed: \`${workflowJob}\` at step \`${step}\`.`, "",
    "Close this issue after writing the cause and what was done. While it is open, another failure of the same job and step is added here.",
    ...(previous ? ["", `Previous issue for the same failure: #${previous}`] : []), "", entries.join("\n\n")].join("\n");
}

const partsOf = title => {
  const [location, step] = [title.slice(PREFIX.length, title.lastIndexOf(": ")), title.slice(title.lastIndexOf(": ") + 2)];
  return { workflowName: location.slice(0, location.indexOf("/")), job: location.slice(location.indexOf("/") + 1), step };
};

function failuresOf(texts) {
  const failures = new Map();
  for (const text of texts) for (const [, run, attempt, rest] of text.matchAll(MARKER)) {
    const fields = Object.fromEntries(rest.trim().split(" ").filter(Boolean).map(field => field.split("=")));
    const failure = failures.get(run) ?? { run: Number(run), branch: null, result: null };
    if (attempt === "1") failure.branch = fields.branch ?? failure.branch;
    else failure.result = fields.result ?? "unknown";
    failures.set(run, failure);
  }
  return [...failures.values()].sort((a, b) => a.run - b.run);
}

export const STATES = Object.freeze({
  "rerun-pending": () => ["The rerun has not finished.", "Nothing."],
  "not-started": ({ latestJob }) => [`The job did not start. Latest run of this job: ${latestJob}.`, "Wait. This issue closes when the job passes. If it keeps failing, look at why the runner does not start."],
  "setup-failed": ({ latestJob }) => [`Failed in a setup step. Latest run of this job: ${latestJob}.`, "Wait. This issue closes when the job passes. If it keeps failing, look at the setup step."],
  resolved: () => ["The rerun failed too, but the latest run of this job passed.", "If it is fixed, write the cause and what was done, then close this issue."],
  broken: ({ latestJob }) => [`The rerun failed too. Latest run of this job: ${latestJob}.`, "Find the cause. Revert the merged change if it caused this, otherwise fix it. Write the cause and what was done, then close this issue."],
  collecting: ({ passedCount }) => [`Failures whose rerun passed: ${passedCount}.`, "Nothing. Close it if it stops happening."],
  "rerun-unclear": () => ["The rerun gave no result for this job.", "Read the run, then decide."],
});

export function stateOf(title, texts, latestRuns = []) {
  const failures = failuresOf(texts);
  const last = failures.at(-1);
  if (!last) return null;
  const { workflowName, job, step } = partsOf(title);
  const latestRun = latestRuns.find(found => found.workflowName === workflowName && found.branch === last.branch && found.runId >= last.run);
  const conclusion = latestRun?.jobs.find(found => found.name === job)?.conclusion;
  const latestJob = !conclusion ? "unknown" : PASSED.has(conclusion) ? "passed" : failed(conclusion) ? "failed" : "unknown";
  const name = last.result === null ? "rerun-pending" : step === NOT_STARTED ? "not-started" : SETUP_STEPS.includes(step) ? "setup-failed"
    : last.result === "failed" ? (latestJob === "passed" ? "resolved" : "broken") : last.result === "passed" ? "collecting" : "rerun-unclear";
  return { name, latestJob, passedCount: failures.filter(failure => failure.result === "passed").length,
    label: last.result === "failed" ? LABELS.failed : last.result === "passed" ? LABELS.passed : null,
    closable: (step === NOT_STARTED || SETUP_STEPS.includes(step)) && (last.result === "passed" || latestJob === "passed") };
}

function statusBlock(state) {
  const [status, todo] = STATES[state.name](state);
  return `${STATUS_OPEN}\n**Status:** ${status}\n**To do:** ${todo}${state.fix?.line ? `\n**Automatic fix:** ${state.fix.line}` : ""}\n${STATUS_CLOSE}`;
}

export const fixMode = value => (FIX_MODES.includes(value) ? value : "off");
export const startMarkerOf = (sequence, at) => `<!-- auto-fix-start try=${sequence} at=${at} -->`;

export function fixHistory(texts, times = [], runTimes) {
  const failures = new Map(), starts = new Map(), latest = new Map();
  texts.forEach((text, index) => {
    const at = times[index] ?? null;
    for (const [, run, rest] of text.matchAll(FIRST_FAILURE)) {
      const branch = /(?:^| )branch=(\S+)/.exec(rest)?.[1] ?? null;
      if (!failures.has(run)) failures.set(run, { run: Number(run), branch, at: runTimes === undefined ? at : runTimes[run] ?? null });
    }
    for (const [, sequence, started] of text.matchAll(START)) starts.set(sequence, { sequence: Number(sequence), at: started });
    for (const [, run, end, sequence] of text.matchAll(ATTEMPT)) {
      latest.delete(run);
      latest.set(run, { run, end, at, sequence: sequence === undefined ? null : Number(sequence) });
    }
  });
  return { failures: [...failures.values()].filter(failure => failure.branch !== "main"), starts: [...starts.values()], records: [...latest.values()].filter(record => !PRACTICE_ENDS.has(record.end)) };
}

export function fixInputs(issue, failures, previous = null, sequence = null) {
  const { workflowName, job } = partsOf(issue.title);
  const runner = FIX_RUNNER.exec(job)?.[1] ?? (workflowName === "windows-role-runtime" ? "windows-2022" : "ubuntu-latest");
  return {
    issue: String(issue.number),
    runner,
    workflow: FULL_CHECKS.includes(workflowName) ? workflowName : "none",
    source: "agent",
    model: FIX_MODEL,
    runs: [...new Set(failures.map(failure => failure.run))].sort((a, b) => b - a).slice(0, 10).join(","),
    job,
    open_pr: "true",
    ...(previous ? { previous: String(previous) } : {}),
    ...(sequence ? { try: String(sequence) } : {}),
  };
}

const after = (time, reference) => Boolean(time && reference) && Date.parse(time) > Date.parse(reference);

export function fixDecision({ issue, state, branch, history, pulls = [], related = [issue.number], collected = state.passedCount, now, limits = FIX_LIMITS }) {
  if (branch !== "dev") return { kind: "none", foreign: true };
  const none = { kind: "none" };
  if (["not-started", "setup-failed", "rerun-pending", "rerun-unclear"].includes(state.name)) return none;
  const { failures, starts, records } = history;
  const open = pulls.find(pull => related.includes(pull.issue) && pull.state === "open");
  if (open) return { kind: "open", pr: open.number, line: `pull request #${open.number} is open. Read it and merge or close it.` };
  const pending = starts.filter(start => !records.some(record => record.sequence === start.sequence));
  const lost = pending.filter(start => now.getTime() - Date.parse(start.at) >= limits.startedHours * 3600 * 1000);
  const used = records.filter(record => !UNREPRODUCED_ENDS.has(record.end)).length + pending.length;
  if (pending.length > lost.length) return { kind: "running", attempt: used, line: `try ${used} is running.` };
  const stopped = end => ({ kind: "stopped", attempt: used, end, line: `stopped${used > 0 ? ` after try ${used}` : ""} (${end}). A person has to look.` });
  if (lost.length > 0) return stopped("unfinished");
  let last = records.at(-1) ?? null;
  if (last?.end === "duplicate") {
    const before = records.filter(record => record.end !== "duplicate").at(-1) ?? null;
    if (before?.end !== "opened") return stopped("duplicate");
    last = before;
  }
  const eligible = (state.name === "broken" && state.latestJob === "failed") || (state.name === "collecting" && collected >= limits.collecting);
  const sequence = Math.max(0, ...starts.map(found => found.sequence), ...records.map(found => found.sequence ?? 0)) + 1;
  const start = previous => (used >= limits.tries ? stopped(last?.end ?? "tries") : { kind: "start", attempt: used + 1, sequence, previous, inputs: fixInputs(issue, failures, previous, sequence) });
  if (!last) return eligible ? start(null) : none;
  const newFailureSince = time => failures.some(failure => after(failure.at, time));
  if (last.end === "stillFailing") return start(last.run);
  if (UNREPRODUCED_ENDS.has(last.end)) {
    if (records.filter(record => UNREPRODUCED_ENDS.has(record.end)).length >= limits.unreproduced) return stopped(last.end);
    return eligible && newFailureSince(last.at) ? start(null) : none;
  }
  if (last.end === "opened") {
    const pull = pulls.find(found => found.issue === issue.number && found.run === last.run);
    if (!pull) return none;
    if (pull.mergedAt) return eligible && newFailureSince(pull.mergedAt) ? start(null) : none;
    return eligible && newFailureSince(pull.closedAt) ? start(last.run) : none;
  }
  return stopped(last.end);
}

export function notHeld(issues, pulls, since = null, runTimes) {
  let count = 0;
  for (const title of new Set(issues.map(issue => issue.title))) {
    const group = issues.filter(issue => issue.title === title);
    const merged = pulls.filter(found => found.mergedAt && group.some(issue => issue.number === found.issue)).map(found => found.mergedAt).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
    if (!merged) continue;
    const runs = new Map();
    for (const issue of group) for (const failure of fixHistory([issue.body, ...issue.comments], [issue.createdAt, ...(issue.commentTimes ?? [])], runTimes).failures) runs.set(failure.run, failure);
    count += [...runs.values()].filter(failure => after(failure.at, merged) && (!since || after(failure.at, since))).length;
  }
  return count;
}

export function withStatus(body, state) {
  const [start, end] = [body.indexOf(STATUS_OPEN), body.indexOf(STATUS_CLOSE)];
  const block = statusBlock(state);
  return start >= 0 && end > start ? `${body.slice(0, start)}${block}${body.slice(end + STATUS_CLOSE.length)}` : `${block}\n\n${body}`;
}

export function plan(snapshot, { mode = "off", now = new Date() } = {}) {
  const issues = snapshot.issues.filter(issue => issue.title.startsWith(PREFIX));
  const recorded = key => issues.some(issue => issue.body.includes(key) || issue.comments.some(comment => comment.includes(key)));
  const reruns = [], pending = new Map();
  const emit = (title, key, marker, text) => {
    if (recorded(key)) return;
    if (!pending.has(title)) pending.set(title, []);
    if (!pending.get(title).some(entry => entry.includes(key))) pending.get(title).push(`${text}\n${marker}`);
  };
  const emitFailure = (run, job) => emit(titleOf(run.workflowName, job.name, job.step), markerKey(run.id, 1, job.name), markerOf(run.id, 1, job.name, { branch: run.branch }), failureEntry(run, job, 1));
  for (const run of [...snapshot.runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (run.attempt === 1) {
      if (run.status !== "completed" || !failed(run.conclusion)) continue;
      for (const job of failedJobs(run.jobs)) emitFailure(run, job);
      reruns.push(run.id);
      continue;
    }
    if (!run.firstAttempt || !failed(run.firstAttempt.conclusion)) continue;
    for (const job of failedJobs(run.firstAttempt.jobs)) {
      emitFailure(run, job);
      if (run.status !== "completed") continue;
      const latest = run.jobs.find(found => found.name === job.name);
      emit(titleOf(run.workflowName, job.name, job.step), markerKey(run.id, run.attempt, job.name), markerOf(run.id, run.attempt, job.name, { result: rerunResult(latest) }), rerunEntry(run, job, latest));
    }
  }
  const actions = reruns.map(runId => ({ type: "rerun", runId }));
  const openOf = title => issues.filter(issue => issue.state === "open" && issue.title === title).sort((a, b) => a.number - b.number)[0];
  const added = new Map();
  for (const [title, entries] of pending) {
    const open = openOf(title);
    if (open) {
      actions.push({ type: "comment", number: open.number, title, body: entries.join("\n\n") });
      added.set(open.number, entries);
    } else {
      const previous = issues.filter(issue => issue.state === "closed" && issue.title === title).sort((a, b) => b.number - a.number)[0];
      const body = issueBody(title, entries, previous?.number ?? null);
      const state = stateOf(title, [body], snapshot.latest);
      actions.push({ type: "create", title, body: withStatus(body, state), labels: state.label ? [state.label] : [] });
    }
  }
  const upkeep = [];
  const fixes = [];
  const pulls = snapshot.pulls ?? [];
  const stops = snapshot.issues.filter(issue => issue.title === FIX_STOP_TITLE);
  const acknowledged = stops.filter(stop => stop.state === "closed" && stop.closedAt).map(stop => stop.closedAt).sort().at(-1) ?? null;
  const openStop = stops.find(stop => stop.state === "open");
  const runTimes = { ...(snapshot.runTimes ?? {}), ...Object.fromEntries((snapshot.runs ?? []).filter(run => run.createdAt).map(run => [run.id, run.createdAt])) };
  const paused = mode !== "off" && (Boolean(openStop) || notHeld(issues, pulls, acknowledged, runTimes) >= FIX_LIMITS.notHeld);
  if (paused && !openStop && mode === "on") {
    upkeep.push({ type: "create", title: FIX_STOP_TITLE, labels: [FIX_LABEL], body: `Fixes that the automatic fix opened were merged, and the same failure was recorded again afterwards, ${FIX_LIMITS.notHeld} times or more. No new automatic fix starts while this issue is open.\n\nRead those issues and their pull requests. Close this issue to let automatic fixes start again.` });
  }
  let started = 0;
  for (const issue of issues.filter(found => found.state === "open")) {
    const texts = [issue.body, ...issue.comments, ...(added.get(issue.number) ?? [])];
    const state = stateOf(issue.title, texts, snapshot.latest);
    if (!state) continue;
    if (mode !== "off") {
      const times = [issue.createdAt ?? null, ...(issue.commentTimes ?? []), ...(added.get(issue.number) ?? []).map(() => now.toISOString())];
      const history = fixHistory(texts, times, runTimes);
      const recorded = failuresOf(texts);
      const collected = recorded.filter(failure => failure.result === "passed" && failure.branch !== "main").length;
      const related = issues.filter(found => found.title === issue.title).map(found => found.number);
      let decision = fixDecision({ issue, state, branch: recorded.at(-1)?.branch ?? null, history, pulls, related, collected, now });
      if (decision.kind === "start") {
        const tried = `try ${decision.attempt}`;
        if (paused) decision = { ...decision, kind: "paused", line: `paused${openStop ? `. See #${openStop.number}` : ""}.` };
        else if ((snapshot.gates ?? 0) > 0) decision = { ...decision, kind: "waiting", line: `${tried} waits for a model gate to finish.` };
        else if (started >= FIX_LIMITS.perPlan) decision = { ...decision, kind: "waiting", line: `${tried} waits for the next check.` };
        else {
          started += 1;
          decision = { ...decision, line: mode === "on" ? `${tried} is running.` : `would start ${tried} now (report only).` };
          if (mode === "on") fixes.push({ type: "fix", number: issue.number, title: issue.title, attempt: decision.attempt, sequence: decision.sequence, inputs: decision.inputs });
        }
      }
      state.fix = decision;
      fixes.push({ type: "note", number: issue.number, title: issue.title, text: `${decision.kind}${decision.line ? `: ${decision.line}` : "."} State ${state.name}${state.name === "collecting" ? `, ${collected} of ${FIX_LIMITS.collecting}` : ""}. Inputs: ${Object.entries(decision.inputs ?? fixInputs(issue, history.failures)).map(([name, value]) => `${name}=${value}`).join(" ")}` });
      if (mode === "on" && !decision.foreign) {
        const labelled = (issue.labels ?? []).includes(FIX_LABEL);
        if (decision.kind === "stopped" && !labelled) upkeep.push({ type: "labels", number: issue.number, title: issue.title, add: [FIX_LABEL], remove: [] });
        if (decision.kind !== "stopped" && labelled) upkeep.push({ type: "labels", number: issue.number, title: issue.title, add: [], remove: [FIX_LABEL] });
      }
    }
    const body = withStatus(issue.body, state);
    if (body !== issue.body) upkeep.push({ type: "status", number: issue.number, title: issue.title, body });
    const current = (issue.labels ?? []).filter(label => Object.values(LABELS).includes(label));
    const add = state.label && !current.includes(state.label) ? [state.label] : [];
    const remove = current.filter(label => label !== state.label);
    if (add.length || remove.length) upkeep.push({ type: "labels", number: issue.number, title: issue.title, add, remove });
    if (state.closable) upkeep.push({ type: "close", number: issue.number, title: issue.title, body: "The job passed in the rerun or in a later run. Closing. A new failure of this job and step opens a new issue." });
  }
  return [...actions, ...upkeep, ...fixes];
}

export function client(token, fetcher = fetch) {
  return async (method, path, body) => {
    const response = await fetcher(`https://api.github.com${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "post-merge-failure-record" } });
    if (!response.ok) throw new Error(`${method} ${path.split("?")[0]} returned ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}

async function pages(api, path, pick = value => value) {
  const all = [];
  for (let page = 1; ; page++) {
    const items = pick(await api("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`));
    all.push(...items);
    if (items.length < 100) return all;
  }
}

const jobOf = job => ({ name: job.name, conclusion: job.conclusion, url: job.html_url, steps: (job.steps ?? []).map(step => ({ name: step.name, conclusion: step.conclusion })) });

export async function gather(api, { repository, since, until, fix = false }) {
  const base = `/repos/${repository}`;
  const created = until ? `${since}..${until}` : `>=${since}`;
  const listed = [];
  for (const target of TARGETS) {
    const runs = await pages(api, `${base}/actions/workflows/${target.workflow}/runs?branch=${target.branch}&event=push&created=${encodeURIComponent(created)}`, value => value.workflow_runs);
    listed.push(...runs.map(run => ({ repository, id: run.id, workflow: target.workflow, workflowName: run.name, branch: target.branch, sha: run.head_sha, attempt: run.run_attempt,
      status: run.status, conclusion: run.conclusion, url: run.html_url, createdAt: run.created_at })));
  }
  const pulls = new Map();
  const pullOf = async sha => {
    if (!pulls.has(sha)) {
      const [pull] = await api("GET", `${base}/commits/${sha}/pulls`);
      pulls.set(sha, pull ? { number: pull.number, title: pull.title, files: (await pages(api, `${base}/pulls/${pull.number}/files`)).map(file => file.filename) } : null);
    }
    return pulls.get(sha);
  };
  const runs = [];
  for (const run of listed) {
    const first = run.attempt > 1 ? await api("GET", `${base}/actions/runs/${run.id}/attempts/1`) : null;
    if (!(run.attempt === 1 ? run.status === "completed" && failed(run.conclusion) : failed(first.conclusion))) continue;
    const older = listed.filter(other => other.workflow === run.workflow && other.branch === run.branch && other.createdAt < run.createdAt && other.status === "completed")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    runs.push({ ...run,
      jobs: (await pages(api, `${base}/actions/runs/${run.id}/jobs?filter=latest`, value => value.jobs)).map(jobOf),
      firstAttempt: first ? { conclusion: first.conclusion, jobs: (await pages(api, `${base}/actions/runs/${run.id}/attempts/1/jobs`, value => value.jobs)).map(jobOf) } : null,
      pull: await pullOf(run.sha),
      previous: older ? { conclusion: older.conclusion, url: older.url } : null,
      siblings: listed.filter(other => other.sha === run.sha && other.branch === run.branch && other.workflow !== run.workflow)
        .map(other => ({ workflowName: other.workflowName, status: other.status, conclusion: other.conclusion })) });
  }
  const issues = [];
  for (const issue of await pages(api, `${base}/issues?state=all&creator=${encodeURIComponent(BOT)}`)) {
    if (issue.pull_request || issue.user?.login !== BOT || !issue.title.startsWith(PREFIX)) continue;
    const comments = await pages(api, `${base}/issues/${issue.number}/comments`);
    const own = comments.filter(comment => comment.user?.login === BOT);
    issues.push({ number: issue.number, title: issue.title, state: issue.state, body: issue.body ?? "",
      labels: (issue.labels ?? []).map(label => typeof label === "string" ? label : label.name),
      comments: own.map(comment => comment.body ?? ""),
      ...(fix ? { createdAt: issue.created_at ?? null, commentTimes: own.map(comment => comment.created_at ?? null) } : {}) });
  }
  let fixPulls = [], gates = 0, fixUnavailable = null;
  const runTimes = {};
  if (fix) {
    try {
      for (const issue of await pages(api, `${base}/issues?state=all&creator=${encodeURIComponent(BOT)}`)) {
        if (issue.pull_request || issue.user?.login !== BOT || issue.title !== FIX_STOP_TITLE) continue;
        issues.push({ number: issue.number, title: issue.title, state: issue.state, closedAt: issue.closed_at ?? null, body: "", labels: [], comments: [] });
      }
      fixPulls = (await pages(api, `${base}/pulls?state=all&base=dev`)).filter(pull => pull.head?.repo?.full_name === repository && String(pull.head?.ref ?? "").startsWith(FIX_BRANCH_PREFIX)).flatMap(pull => {
        const match = /^(\d+)-(\d+)$/.exec(pull.head.ref.slice(FIX_BRANCH_PREFIX.length));
        return match ? [{ number: pull.number, issue: Number(match[1]), run: match[2], state: pull.state, mergedAt: pull.merged_at ?? null, closedAt: pull.closed_at ?? null }] : [];
      });
      for (const gate of GATES) for (const status of ["queued", "in_progress"]) gates += (await api("GET", `${base}/actions/workflows/${gate}/runs?status=${status}&per_page=1`)).total_count ?? 0;
      for (const issue of issues.filter(found => found.state === "open" && found.title.startsWith(PREFIX))) {
        const wanted = fixHistory([issue.body, ...issue.comments]).failures.map(failure => String(failure.run)).slice(-MAX_RUN_TIMES);
        for (const run of wanted.filter(found => !(found in runTimes))) {
          const known = listed.find(found => String(found.id) === run)?.createdAt;
          try {
            runTimes[run] = known ?? (await api("GET", `${base}/actions/runs/${run}`)).created_at ?? null;
          } catch {
            runTimes[run] = null;
          }
        }
      }
    } catch (error) {
      fixUnavailable = error instanceof Error ? error.message : "the automatic fix could not be judged";
    }
  }
  const latest = [];
  for (const target of TARGETS) {
    const newest = listed.filter(run => run.workflow === target.workflow && run.branch === target.branch && run.status === "completed").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!newest) continue;
    const jobs = await pages(api, `${base}/actions/runs/${newest.id}/jobs?filter=latest`, value => value.jobs);
    latest.push({ workflowName: newest.workflowName, branch: newest.branch, runId: newest.id, jobs: jobs.map(job => ({ name: job.name, conclusion: job.conclusion })) });
  }
  return { runs, issues, latest, ...(fix ? { pulls: fixPulls, gates, runTimes: Object.fromEntries(Object.entries(runTimes).filter(([, time]) => time)), ...(fixUnavailable ? { fixUnavailable } : {}) } : {}) };
}

async function ensureLabels(api, base, names, known) {
  for (const name of names.filter(found => !known.has(found))) {
    try {
      await api("POST", `${base}/labels`, { name, ...LABEL_DETAILS[name] });
    } catch (error) {
      if (!error.message.endsWith("returned 422")) throw error;
    }
    known.add(name);
  }
}

export async function apply(api, repository, actions, now = new Date()) {
  const base = `/repos/${repository}`, results = [], known = new Set();
  for (const action of actions) {
    try {
      if (action.type === "note") {
        results.push({ ...action, ok: true });
        continue;
      }
      if (action.type === "fix") {
        const mark = await api("POST", `${base}/issues/${action.number}/comments`, { body: `Automatic fix: try ${action.attempt} started${action.inputs.previous ? `, continuing run ${action.inputs.previous}` : ""}.\n${startMarkerOf(action.sequence, now.toISOString())}` });
        try {
          await api("POST", `${base}/actions/workflows/${FIX_WORKFLOW}/dispatches`, { ref: "dev", inputs: action.inputs });
        } catch (error) {
          if (mark?.id && / returned 4\d\d$/.test(String(error?.message))) await api("DELETE", `${base}/issues/comments/${mark.id}`).catch(() => null);
          throw error;
        }
      } else if (action.type === "rerun") await api("POST", `${base}/actions/runs/${action.runId}/rerun-failed-jobs`);
      else if (action.type === "comment") await api("POST", `${base}/issues/${action.number}/comments`, { body: action.body });
      else if (action.type === "status") await api("PATCH", `${base}/issues/${action.number}`, { body: action.body });
      else if (action.type === "labels") {
        await ensureLabels(api, base, action.add, known);
        if (action.add.length) await api("POST", `${base}/issues/${action.number}/labels`, { labels: action.add });
        for (const label of action.remove) await api("DELETE", `${base}/issues/${action.number}/labels/${encodeURIComponent(label)}`);
      } else if (action.type === "close") {
        await api("POST", `${base}/issues/${action.number}/comments`, { body: action.body });
        await api("PATCH", `${base}/issues/${action.number}`, { state: "closed" });
      } else {
        await ensureLabels(api, base, action.labels ?? [], known);
        await api("POST", `${base}/issues`, { title: action.title, body: action.body, labels: action.labels ?? [] });
      }
      results.push({ ...action, ok: true });
    } catch (error) {
      results.push({ ...action, ok: false, error: error.message });
    }
  }
  return results;
}

export function summarize(actions, dryRun, mode = null) {
  const describe = action => action.type === "note" ? `automatic fix of #${action.number}: ${action.text}`
    : action.type === "fix" ? `start try ${action.attempt} of the automatic fix of #${action.number} ${action.title}`
    : action.type === "rerun" ? `rerun the failed jobs of run ${action.runId}`
    : action.type === "comment" ? `add to #${action.number} ${action.title}`
      : action.type === "status" ? `rewrite the status of #${action.number} ${action.title}`
        : action.type === "labels" ? `set the labels of #${action.number} ${action.title}`
          : action.type === "close" ? `close #${action.number} ${action.title}` : `open ${action.title}`;
  const counted = actions.filter(action => action.type !== "note").length;
  return [`${dryRun ? "Dry run: " : ""}${counted} action${counted === 1 ? "" : "s"}`,
    ...(mode ? [`Automatic fix mode: ${mode}`] : []),
    ...actions.map(action => `- ${describe(action)}${action.ok === false ? ` (failed: ${action.error})` : ""}`)].join("\n");
}

export function parse(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (name === "--dry-run") options.dryRun = true;
    else if (name === "--auto-fix-mode" && argv[index + 1] !== undefined) options.fixMode = fixMode(argv[++index]);
    else if (["--repository", "--since", "--until"].includes(name) && argv[index + 1] !== undefined) options[name.slice(2)] = argv[++index];
    else throw new Error(USAGE);
  }
  if (!REPOSITORY.test(options.repository ?? "")) throw new Error(USAGE);
  for (const key of ["since", "until"]) if (options[key] !== undefined && Number.isNaN(Date.parse(options[key]))) throw new Error(USAGE);
  return options;
}

export async function main(argv, env, now = new Date()) {
  const options = parse(argv);
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  if (!token) throw new Error("GH_TOKEN is required");
  const api = client(token);
  const since = new Date(options.since ?? now.getTime() - LOOKBACK_HOURS * 3600 * 1000).toISOString();
  const mode = options.fixMode ?? "off";
  const snapshot = await gather(api, { repository: options.repository, since, until: options.until ? new Date(options.until).toISOString() : undefined, fix: mode !== "off" });
  const actions = plan(snapshot, { mode: snapshot.fixUnavailable ? "off" : mode, now });
  const results = options.dryRun ? actions : await apply(api, options.repository, actions, now);
  const text = summarize(results, options.dryRun, snapshot.fixUnavailable ? `${mode}, not judged in this pass (${snapshot.fixUnavailable})` : mode);
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
  return results.some(result => result.ok === false) ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).then(code => { process.exitCode = code; }, error => {
    console.error(error instanceof Error ? error.message : "post-merge failure record failed");
    process.exitCode = 2;
  });
}
