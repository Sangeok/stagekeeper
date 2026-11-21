import assert from "node:assert/strict";
import { it } from "node:test";
import { NOT_STARTED, apply, failedJobs, gather, markerOf, parse, plan, summarize, titleOf } from "./record.mjs";

const SHA = "a".repeat(40);
const job = (name, conclusion, steps = []) => ({ name, conclusion, url: `https://example.test/job/${encodeURIComponent(name)}`, steps });
const step = (name, conclusion = "success") => ({ name, conclusion });
const run = overrides => ({ repository: "owner/name", id: 1, workflow: "check.yml", workflowName: "check", branch: "dev", sha: SHA, attempt: 1, status: "completed",
  conclusion: "failure", url: "https://example.test/run/1", createdAt: "2026-11-20T00:00:00Z", jobs: [job("check (test)", "failure", [step("Set up"), step("Run tests", "failure")])],
  firstAttempt: null, pull: { number: 7, title: "Change something", files: ["a.md"] }, previous: { conclusion: "success", url: "https://example.test/run/0" }, siblings: [], ...overrides });
const issue = overrides => ({ number: 10, title: titleOf("check", "check (test)", "Run tests"), state: "open", body: "", comments: [], ...overrides });

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
  for (const expected of [markerOf(1, 1, "check (test)"), "#7 Change something", "`a.md`", "previous push: success", "attempt 1 failed"]) assert.ok(actions[1].body.includes(expected), expected);
});

it("adds the same failure of another commit to the open issue instead of opening a second one", () => {
  const second = run({ id: 2, sha: "b".repeat(40), url: "https://example.test/run/2", createdAt: "2026-11-20T01:00:00Z" });
  const actions = plan({ runs: [run({}), second], issues: [] });
  assert.deepEqual(actions.map(action => action.type), ["rerun", "rerun", "create"]);
  assert.ok(actions[2].body.includes(markerOf(1, 1, "check (test)")) && actions[2].body.includes(markerOf(2, 1, "check (test)")));
  const later = plan({ runs: [second], issues: [issue({ body: markerOf(1, 1, "check (test)") })] });
  assert.deepEqual(later.map(action => [action.type, action.number ?? action.runId]), [["rerun", 2], ["comment", 10]]);
});

it("does not record a run and attempt that an issue or a comment already holds", () => {
  assert.deepEqual(plan({ runs: [run({})], issues: [issue({ comments: [markerOf(1, 1, "check (test)")] })] }).map(action => action.type), ["rerun"]);
  assert.deepEqual(plan({ runs: [run({})], issues: [issue({ state: "closed", body: markerOf(1, 1, "check (test)") })] }).map(action => action.type), ["rerun"]);
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
  const recorded = issue({ body: markerOf(1, 1, "check (test)") });
  const afterPass = plan({ runs: [passed], issues: [recorded] });
  assert.deepEqual(afterPass.map(action => action.type), ["comment"]);
  assert.ok(afterPass[0].body.includes("rerun (attempt 2) passed") && afterPass[0].body.includes(markerOf(1, 2, "check (test)")));

  const again = run({ attempt: 2, conclusion: "failure", jobs: [job("check (test)", "failure", [step("Run tests", "failure")])], firstAttempt: first });
  const afterFailure = plan({ runs: [again], issues: [recorded] });
  assert.deepEqual(afterFailure.map(action => action.type), ["comment"]);
  assert.ok(afterFailure[0].body.includes("failed again at step `Run tests`"));

  const running = run({ attempt: 2, status: "in_progress", conclusion: null, jobs: [], firstAttempt: first });
  assert.deepEqual(plan({ runs: [running], issues: [recorded] }), []);
});

it("records the first failure of a run it only sees after a rerun, and ignores a rerun of a run that had passed", () => {
  const first = { conclusion: "failure", jobs: [job("check (test)", "failure", [step("Run tests", "failure")])] };
  const actions = plan({ runs: [run({ attempt: 2, conclusion: "success", jobs: [job("check (test)", "success")], firstAttempt: first })], issues: [] });
  assert.deepEqual(actions.map(action => action.type), ["create"]);
  assert.ok(actions[0].body.includes(markerOf(1, 1, "check (test)")) && actions[0].body.includes(markerOf(1, 2, "check (test)")));
  assert.deepEqual(plan({ runs: [run({ attempt: 2, conclusion: "failure", firstAttempt: { conclusion: "success", jobs: [] } })], issues: [] }), []);
});

it("ignores issues outside its own title prefix", () => {
  const actions = plan({ runs: [run({})], issues: [issue({ title: "[gate] check abc", body: markerOf(1, 1, "check (test)") })] });
  assert.deepEqual(actions.map(action => action.type), ["rerun", "create"]);
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
      { number: 10, title: "[post-merge] check/check (test): Run tests", state: "open", body: "x", user: { login: "github-actions[bot]" } },
      { number: 11, title: "[post-merge] check/check (test): Run tests", state: "open", body: "x", user: { login: "someone" } },
      { number: 12, title: "[gate] agent-eval abc", state: "open", body: "x", user: { login: "github-actions[bot]" } },
      { number: 13, title: "[post-merge] pull", state: "open", body: "x", user: { login: "github-actions[bot]" }, pull_request: {} }],
    "GET /repos/owner/name/issues/10/comments": [{ body: "kept", user: { login: "github-actions[bot]" } }, { body: "dropped", user: { login: "someone" } }],
  });
  const snapshot = await gather(api, { repository: "owner/name", since: "2026-11-19T00:00:00.000Z" });
  assert.deepEqual(snapshot.runs.map(found => [found.id, found.attempt, found.firstAttempt?.conclusion ?? null, found.previous?.conclusion ?? null]), [[3, 2, "failure", "failure"], [2, 1, null, "success"]]);
  assert.deepEqual(snapshot.runs[0].pull, { number: 7, title: "Change something", files: ["a.md"] });
  assert.deepEqual(snapshot.issues, [{ number: 10, title: "[post-merge] check/check (test): Run tests", state: "open", body: "x", comments: ["kept"] }]);
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
    ["/repos/owner/name/issues/10/comments", { body: "b" }], ["/repos/owner/name/issues", { title: "t2", body: "b2" }]]);
  assert.ok(summarize(results, false).includes("failed: POST /repos/owner/name/actions/runs/1/rerun-failed-jobs returned 403"));
});

it("accepts only its documented arguments", () => {
  assert.deepEqual(parse(["--repository", "owner/name", "--since", "2026-11-10T00:00:00Z", "--dry-run"]), { dryRun: true, repository: "owner/name", since: "2026-11-10T00:00:00Z" });
  for (const argv of [[], ["--repository", "not a repository"], ["--repository", "owner/name", "--since", "yesterday"], ["--repository", "owner/name", "--unknown"]]) assert.throws(() => parse(argv), /Usage/);
});
