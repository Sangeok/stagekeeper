import assert from "node:assert/strict";
import { it } from "node:test";
import { LABELS, NOT_STARTED, STATES, apply, failedJobs, gather, markerOf, parse, plan, stateOf, summarize, titleOf, withStatus } from "./record.mjs";

const SHA = "a".repeat(40);
const job = (name, conclusion, steps = []) => ({ name, conclusion, url: `https://example.test/job/${encodeURIComponent(name)}`, steps });
const step = (name, conclusion = "success") => ({ name, conclusion });
const run = overrides => ({ repository: "owner/name", id: 1, workflow: "check.yml", workflowName: "check", branch: "dev", sha: SHA, attempt: 1, status: "completed",
  conclusion: "failure", url: "https://example.test/run/1", createdAt: "2026-11-20T00:00:00Z", jobs: [job("check (test)", "failure", [step("Set up"), step("Run tests", "failure")])],
  firstAttempt: null, pull: { number: 7, title: "Change something", files: ["a.md"] }, previous: { conclusion: "success", url: "https://example.test/run/0" }, siblings: [], ...overrides });
const issue = overrides => ({ number: 10, title: titleOf("check", "check (test)", "Run tests"), state: "open", body: "", labels: [], comments: [], ...overrides });
const JOB = "check (test)";
const failure = (runId, branch = "dev") => markerOf(runId, 1, JOB, { branch });
const rerun = (runId, result) => markerOf(runId, 2, JOB, { result });
const latestRun = (runId, conclusion, branch = "dev") => ({ workflowName: "check", branch, runId, jobs: [{ name: JOB, conclusion }] });

it("names a failed job by its first failed step and a run with no failed job by the job that did not start", () => {
  assert.deepEqual(failedJobs([job("a", "success"), job("b", "failure", [step("one"), step("two", "failure"), step("three", "failure")])]).map(found => [found.name, found.step]), [["b", "two"]]);
  assert.deepEqual(failedJobs([job("a", "success"), job("b", "cancelled")]).map(found => [found.name, found.step]), [["b", NOT_STARTED]]);
  assert.deepEqual(failedJobs([job("a", "success"), job("b", "skipped")]), []);
});

it("opens one issue for a first failure, records the run details and reruns the failed jobs once", () => {
  const actions = plan({ runs: [run({})], issues: [] });
  assert.deepEqual(actions.map(action => action.type), ["rerun", "create"]);
  assert.equal(actions[0].runId, 1);
  assert.equal(actions[1].title, "[post-merge] check/check (test): Run tests");
  for (const expected of [failure(1), "#7 Change something", "`a.md`", "previous push: success", "attempt 1 failed"]) assert.ok(actions[1].body.includes(expected), expected);
  assert.ok(actions[1].body.startsWith("<!-- post-merge-status -->\n**Status:** The rerun has not finished."));
  assert.deepEqual(actions[1].labels, []);
});

it("adds the same failure of another commit to the open issue instead of opening a second one", () => {
  const second = run({ id: 2, sha: "b".repeat(40), url: "https://example.test/run/2", createdAt: "2026-11-20T01:00:00Z" });
  const actions = plan({ runs: [run({}), second], issues: [] });
  assert.deepEqual(actions.map(action => action.type), ["rerun", "rerun", "create"]);
  assert.ok(actions[2].body.includes(failure(1)) && actions[2].body.includes(failure(2)));
  const later = plan({ runs: [second], issues: [issue({ body: failure(1) })] });
  assert.deepEqual(later.map(action => [action.type, action.number ?? action.runId]), [["rerun", 2], ["comment", 10], ["status", 10]]);
});

it("does not record a run and attempt that an issue or a comment already holds", () => {
  assert.deepEqual(plan({ runs: [run({})], issues: [issue({ comments: [failure(1)] })] }).map(action => action.type), ["rerun", "status"]);
  assert.deepEqual(plan({ runs: [run({})], issues: [issue({ state: "closed", body: failure(1) })] }).map(action => action.type), ["rerun"]);
});

it("treats a marker written before the branch and result fields existed as already recorded", () => {
  const before = "<!-- post-merge-record run=1 attempt=1 job=check%20(test) -->";
  assert.deepEqual(plan({ runs: [run({})], issues: [issue({ state: "closed", body: before })] }).map(action => action.type), ["rerun"]);
});

it("links the closed issue of the same failure when it opens a new one", () => {
  const [, created] = plan({ runs: [run({ id: 5 })], issues: [issue({ number: 3, state: "closed" }), issue({ number: 9, state: "closed" })] });
  assert.equal(created.type, "create");
  assert.ok(created.body.includes("Previous issue for the same failure: #9"));
});

it("skips cancelled, successful and unfinished first attempts", () => {
  const runs = [run({ id: 1, conclusion: "cancelled" }), run({ id: 2, conclusion: "success" }), run({ id: 3, status: "in_progress", conclusion: null })];
  assert.deepEqual(plan({ runs, issues: [] }), []);
});

it("records the rerun result under the first failure and never reruns a second attempt", () => {
  const first = { conclusion: "failure", jobs: [job("check (test)", "failure", [step("Run tests", "failure")])] };
  const passed = run({ attempt: 2, conclusion: "success", jobs: [job("check (test)", "success", [step("Run tests")])], firstAttempt: first });
  const recorded = issue({ body: failure(1) });
  const afterPass = plan({ runs: [passed], issues: [recorded] });
  assert.deepEqual(afterPass.map(action => action.type), ["comment", "status", "labels"]);
  assert.ok(afterPass[0].body.includes("rerun (attempt 2) passed") && afterPass[0].body.includes(rerun(1, "passed")));

  const again = run({ attempt: 2, conclusion: "failure", jobs: [job("check (test)", "failure", [step("Run tests", "failure")])], firstAttempt: first });
  const afterFailure = plan({ runs: [again], issues: [recorded] });
  assert.deepEqual(afterFailure.map(action => action.type), ["comment", "status", "labels"]);
  assert.ok(afterFailure[0].body.includes("failed again at step `Run tests`") && afterFailure[0].body.includes(rerun(1, "failed")));

  const running = run({ attempt: 2, status: "in_progress", conclusion: null, jobs: [], firstAttempt: first });
  assert.deepEqual(plan({ runs: [running], issues: [recorded] }).map(action => action.type), ["status"]);
});

it("records the first failure of a run it only sees after a rerun, and ignores a rerun of a run that had passed", () => {
  const first = { conclusion: "failure", jobs: [job("check (test)", "failure", [step("Run tests", "failure")])] };
  const actions = plan({ runs: [run({ attempt: 2, conclusion: "success", jobs: [job("check (test)", "success")], firstAttempt: first })], issues: [] });
  assert.deepEqual(actions.map(action => action.type), ["create"]);
  assert.ok(actions[0].body.includes(failure(1)) && actions[0].body.includes(rerun(1, "passed")));
  assert.deepEqual(actions[0].labels, [LABELS.passed]);
  assert.deepEqual(plan({ runs: [run({ attempt: 2, conclusion: "failure", firstAttempt: { conclusion: "success", jobs: [] } })], issues: [] }), []);
});

it("ignores issues outside its own title prefix", () => {
  const actions = plan({ runs: [run({})], issues: [issue({ title: "[gate] check abc", body: markerOf(1, 1, "check (test)") })] });
  assert.deepEqual(actions.map(action => action.type), ["rerun", "create"]);
});

it("describes the issue by its latest recorded failure and labels it by that failure's rerun result", () => {
  const title = issue({}).title;
  const notStarted = titleOf("check", JOB, NOT_STARTED);
  const cases = [
    ["rerun-pending", title, [failure(1), rerun(1, "passed"), failure(2)], [], null, "The rerun has not finished."],
    ["collecting", title, [failure(1), rerun(1, "passed"), failure(2), rerun(2, "passed")], [], LABELS.passed, "Failures whose rerun passed: 2."],
    ["broken", title, [failure(1), rerun(1, "passed"), failure(2), rerun(2, "failed")], [latestRun(2, "failure")], LABELS.failed, "The rerun failed too. Latest run of this job: failed."],
    ["resolved", title, [failure(2), rerun(2, "failed")], [latestRun(3, "success")], LABELS.failed, "but the latest run of this job passed"],
    ["rerun-unclear", title, [failure(2), rerun(2, "not-run")], [], null, "The rerun gave no result for this job."],
    ["not-started", notStarted, [failure(2), rerun(2, "failed")], [latestRun(2, "failure")], LABELS.failed, "The job did not start. Latest run of this job: failed."],
  ];
  for (const [name, caseTitle, texts, latest, label, phrase] of cases) {
    const state = stateOf(caseTitle, texts, latest);
    assert.equal(state.name, name);
    assert.equal(state.label, label, name);
    assert.ok(withStatus("", state).includes(phrase), name);
  }
  assert.deepEqual(Object.keys(STATES).sort(), cases.map(([name]) => name).sort());
  assert.equal(stateOf(title, ["no marker here"], []), null);
});

it("reads the latest run only from the branch of the latest failure and only when it is that run or a later one", () => {
  const texts = [failure(5, "main"), rerun(5, "failed")];
  assert.equal(stateOf(issue({}).title, texts, [latestRun(9, "success", "dev")]).name, "broken");
  assert.equal(stateOf(issue({}).title, texts, [latestRun(4, "success", "main")]).latestJob, "unknown");
  assert.equal(stateOf(issue({}).title, texts, [latestRun(9, "success", "main")]).name, "resolved");
});

it("rewrites only its own status block, and nothing when the status has not changed", () => {
  const state = stateOf(issue({}).title, [failure(1), rerun(1, "passed")], []);
  const body = withStatus(`Intro kept.\n\n${failure(1)}\n${rerun(1, "passed")}\n\nA note a person added.`, state);
  assert.ok(body.startsWith("<!-- post-merge-status -->") && body.includes("Intro kept.") && body.endsWith("A note a person added."));
  assert.equal(body.split("<!-- post-merge-status -->").length, 2);
  assert.deepEqual(plan({ runs: [], issues: [issue({ body, labels: [LABELS.passed] })] }), []);

  const next = plan({ runs: [], issues: [issue({ body, labels: [LABELS.passed], comments: [`${failure(2)}`, rerun(2, "failed")] })], latest: [latestRun(2, "failure")] });
  assert.deepEqual(next.map(action => action.type), ["status", "labels"]);
  assert.ok(next[0].body.includes("The rerun failed too.") && next[0].body.endsWith("A note a person added.") && !next[0].body.includes("Failures whose rerun passed"));
  assert.deepEqual([next[1].add, next[1].remove], [[LABELS.failed], [LABELS.passed]]);
});

it("removes its label while the rerun of a new failure is pending and leaves other labels alone", () => {
  const actions = plan({ runs: [], issues: [issue({ body: `${failure(1)}\n${rerun(1, "passed")}`, comments: [failure(2)], labels: [LABELS.passed, "bug"] })] });
  assert.deepEqual(actions.filter(action => action.type === "labels").map(action => [action.add, action.remove]), [[[], [LABELS.passed]]]);
});

it("closes an issue of a job that did not start once the job passes, and no other issue", () => {
  const notStarted = overrides => issue({ title: titleOf("check", JOB, NOT_STARTED), ...overrides });
  const types = snapshot => plan({ runs: [], ...snapshot }).map(action => action.type);
  assert.ok(types({ issues: [notStarted({ body: `${failure(1)}\n${rerun(1, "passed")}` })] }).includes("close"));
  assert.ok(types({ issues: [notStarted({ body: `${failure(1)}\n${rerun(1, "failed")}` })], latest: [latestRun(2, "success")] }).includes("close"));
  assert.ok(!types({ issues: [notStarted({ body: `${failure(1)}\n${rerun(1, "failed")}` })], latest: [latestRun(1, "failure")] }).includes("close"));
  assert.ok(!types({ issues: [notStarted({ body: failure(1) })], latest: [latestRun(1, "failure")] }).includes("close"));
  assert.ok(!types({ issues: [issue({ body: `${failure(1)}\n${rerun(1, "passed")}` })], latest: [latestRun(2, "success")] }).includes("close"));
  assert.ok(!types({ issues: [notStarted({ state: "closed", body: `${failure(1)}\n${rerun(1, "passed")}` })] }).includes("close"));
});

function fakeApi(routes, calls = []) {
  return Object.assign(async (method, path, body) => {
    calls.push({ method, path, body });
    const match = Object.entries(routes).find(([prefix]) => `${method} ${path}`.startsWith(prefix));
    if (!match) throw new Error(`unexpected ${method} ${path}`);
    return typeof match[1] === "function" ? match[1](path, body) : match[1];
  }, { calls });
}

it("gathers only failed runs and only this action's own issues, and reads the first attempt of a rerun", async () => {
  const listed = (id, attempt, conclusion, createdAt) => ({ id, name: "check", head_sha: SHA, run_attempt: attempt, status: "completed", conclusion, html_url: `https://example.test/run/${id}`, created_at: createdAt });
  const api = fakeApi({
    "GET /repos/owner/name/actions/workflows/check.yml/runs?branch=dev": { workflow_runs: [listed(3, 2, "success", "2026-11-20T02:00:00Z"), listed(2, 1, "failure", "2026-11-20T01:00:00Z"), listed(1, 1, "success", "2026-11-20T00:00:00Z")] },
    "GET /repos/owner/name/actions/workflows/": { workflow_runs: [] },
    "GET /repos/owner/name/actions/runs/3/attempts/1/jobs": { jobs: [{ name: "check (test)", conclusion: "failure", html_url: "u", steps: [{ name: "Run tests", conclusion: "failure" }] }] },
    "GET /repos/owner/name/actions/runs/3/attempts/1": { conclusion: "failure" },
    "GET /repos/owner/name/actions/runs/": { jobs: [{ name: "check (test)", conclusion: "failure", html_url: "u", steps: [{ name: "Run tests", conclusion: "failure" }] }] },
    "GET /repos/owner/name/commits/": [{ number: 7, title: "Change something" }],
    "GET /repos/owner/name/pulls/7/files": [{ filename: "a.md" }],
    "GET /repos/owner/name/issues?state=all": [
      { number: 10, title: "[post-merge] check/check (test): Run tests", state: "open", body: "x", labels: [{ name: "post-merge:rerun-passed" }], user: { login: "github-actions[bot]" } },
      { number: 11, title: "[post-merge] check/check (test): Run tests", state: "open", body: "x", user: { login: "someone" } },
      { number: 12, title: "[gate] agent-eval abc", state: "open", body: "x", user: { login: "github-actions[bot]" } },
      { number: 13, title: "[post-merge] pull", state: "open", body: "x", user: { login: "github-actions[bot]" }, pull_request: {} }],
    "GET /repos/owner/name/issues/10/comments": [{ body: "kept", user: { login: "github-actions[bot]" } }, { body: "dropped", user: { login: "someone" } }],
  });
  const snapshot = await gather(api, { repository: "owner/name", since: "2026-11-19T00:00:00.000Z" });
  assert.deepEqual(snapshot.runs.map(found => [found.id, found.attempt, found.firstAttempt?.conclusion ?? null, found.previous?.conclusion ?? null]), [[3, 2, "failure", "failure"], [2, 1, null, "success"]]);
  assert.deepEqual(snapshot.runs[0].pull, { number: 7, title: "Change something", files: ["a.md"] });
  assert.deepEqual(snapshot.issues, [{ number: 10, title: "[post-merge] check/check (test): Run tests", state: "open", body: "x", labels: ["post-merge:rerun-passed"], comments: ["kept"] }]);
  assert.deepEqual(snapshot.latest, [{ workflowName: "check", branch: "dev", runId: 3, jobs: [{ name: "check (test)", conclusion: "failure" }] }]);
  assert.ok(api.calls.every(call => call.method === "GET"));
});

it("applies each action through its own endpoint and reports a failed one without stopping", async () => {
  const api = fakeApi({
    "POST /repos/owner/name/actions/runs/1/rerun-failed-jobs": () => { throw new Error("POST /repos/owner/name/actions/runs/1/rerun-failed-jobs returned 403"); },
    "POST /repos/owner/name/issues/10/comments": {},
    "POST /repos/owner/name/issues": {},
  });
  const results = await apply(api, "owner/name", [{ type: "rerun", runId: 1 }, { type: "comment", number: 10, title: "t", body: "b" }, { type: "create", title: "t2", body: "b2" }]);
  assert.deepEqual(results.map(result => result.ok), [false, true, true]);
  assert.deepEqual(api.calls.map(call => [call.path, call.body ?? null]), [["/repos/owner/name/actions/runs/1/rerun-failed-jobs", null],
    ["/repos/owner/name/issues/10/comments", { body: "b" }], ["/repos/owner/name/issues", { title: "t2", body: "b2", labels: [] }]]);
  assert.ok(summarize(results, false).includes("failed: POST /repos/owner/name/actions/runs/1/rerun-failed-jobs returned 403"));
});

it("creates a missing label before using it, rewrites a status in place and closes with a comment", async () => {
  const api = fakeApi({
    "POST /repos/owner/name/labels": (path, body) => { if (body.name === LABELS.failed) throw new Error("POST /repos/owner/name/labels returned 422"); return {}; },
    "POST /repos/owner/name/issues/10/labels": {},
    "DELETE /repos/owner/name/issues/10/labels/": null,
    "PATCH /repos/owner/name/issues/10": {},
    "POST /repos/owner/name/issues/10/comments": {},
    "POST /repos/owner/name/issues": {},
  });
  const results = await apply(api, "owner/name", [
    { type: "labels", number: 10, title: "t", add: [LABELS.failed], remove: [LABELS.passed] },
    { type: "status", number: 10, title: "t", body: "new body" },
    { type: "close", number: 10, title: "t", body: "why" },
    { type: "create", title: "t2", body: "b2", labels: [LABELS.failed, LABELS.passed] }]);
  assert.deepEqual(results.map(result => result.ok), [true, true, true, true]);
  assert.deepEqual(api.calls.map(call => [call.method, call.path, call.body?.name ?? call.body?.labels ?? call.body?.state ?? call.body?.body ?? null]), [
    ["POST", "/repos/owner/name/labels", LABELS.failed],
    ["POST", "/repos/owner/name/issues/10/labels", [LABELS.failed]],
    ["DELETE", "/repos/owner/name/issues/10/labels/post-merge%3Arerun-passed", null],
    ["PATCH", "/repos/owner/name/issues/10", "new body"],
    ["POST", "/repos/owner/name/issues/10/comments", "why"],
    ["PATCH", "/repos/owner/name/issues/10", "closed"],
    ["POST", "/repos/owner/name/labels", LABELS.passed],
    ["POST", "/repos/owner/name/issues", [LABELS.failed, LABELS.passed]]]);
});

it("accepts only its documented arguments", () => {
  assert.deepEqual(parse(["--repository", "owner/name", "--since", "2026-11-10T00:00:00Z", "--dry-run"]), { dryRun: true, repository: "owner/name", since: "2026-11-10T00:00:00Z" });
  for (const argv of [[], ["--repository", "not a repository"], ["--repository", "owner/name", "--since", "yesterday"], ["--repository", "owner/name", "--unknown"]]) assert.throws(() => parse(argv), /Usage/);
});
