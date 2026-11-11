import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { findingIssue, gateRow, main, openFinding, recordComment } from "./gate-record.mjs";

const COMMIT = "1eddbc2ae66ad33b567e20e1b67f4abe582924d0";
const REPOSITORY = "Sangeok/stagekeeper";
const environment = { client: "claude", clientVersion: "2.1.322", osVersion: "10.0.20348", pluginVersion: "0.6.11" };
const pipelineSummary = {
  ...environment, os: "win32-x64", scenario: "slug", planVerifierPasses: 1, pluginCommit: COMMIT, templatesCommit: "8ccb37a4ab91de527e6a23caa6d415c7cdc6f215", permission: "auto", runnerState: "stopped",
  steps: [{ step: "seed-templates", result: "pass" }, { step: "item-done", result: "pass" }], runs: ["done: 41 turns, 0 denied"],
  turns: 41, denials: 0, agentCalls: 6, agentErrors: 0, costUsd: 1.52, models: ["claude-sonnet-5-5"], harnessErrors: { validation_record: 2 }, stepRefusals: 0, minutesToDone: 9, sealed: true, seconds: 612, result: "pass",
};
const initSummary = (os, scenario) => ({ ...environment, os, scenario, pluginSource: "github-branch", pluginCommit: COMMIT, steps: [{ step: "plugin-install", result: "pass" }], seconds: 95, result: "pass" });
const INIT_LEGS = ["windows_new_user", "windows_update", "macos_new_user", "macos_update"];
const initSummaries = {
  summary_windows_new_user: JSON.stringify(initSummary("win32-x64", "new-user")),
  summary_windows_update: JSON.stringify(initSummary("win32-x64", "update")),
  summary_macos_new_user: JSON.stringify({ ...initSummary("darwin-arm64", "new-user"), osVersion: "15.7.1" }),
  summary_macos_update: JSON.stringify({ ...initSummary("darwin-arm64", "update"), osVersion: "15.7.1" }),
};
const run = (overrides = {}) => ({ workflow: "pipeline-smoke", event: "workflow_dispatch", ref: "refs/heads/dev", commit: COMMIT, runId: "42921691891", runAttempt: "1", result: "success", legs: ["pipeline"], summaries: { summary_pipeline: JSON.stringify(pipelineSummary) }, ...overrides });

it("records a green pipeline run with its versions and reports harness errors as a finding", () => {
  const row = gateRow(run());

  assert.deepEqual(
    { schema: row.schema, workflow: row.workflow, level: row.level, event: row.event, ref: row.ref, commit: row.commit, runId: row.runId, runAttempt: row.runAttempt, conclusion: row.conclusion },
    { schema: 1, workflow: "pipeline-smoke", level: "pipeline", event: "workflow_dispatch", ref: "dev", commit: COMMIT, runId: 42921691891, runAttempt: 1, conclusion: "success" },
  );
  assert.deepEqual(row.findings, ["harness-errors"]);
  assert.deepEqual(row.legs, [{ leg: "pipeline", ...pipelineSummary }]);
});

it("records every leg of the init gate and names the leg that left no summary", () => {
  const complete = gateRow(run({ workflow: "client-init-smoke", legs: INIT_LEGS, summaries: initSummaries }));
  assert.equal(complete.level, "init");
  assert.deepEqual(complete.findings, []);
  assert.deepEqual(complete.legs.map(entry => [entry.leg, entry.os, entry.osVersion, entry.scenario, entry.result]), [
    ["windows_new_user", "win32-x64", "10.0.20348", "new-user", "pass"],
    ["windows_update", "win32-x64", "10.0.20348", "update", "pass"],
    ["macos_new_user", "darwin-arm64", "15.7.1", "new-user", "pass"],
    ["macos_update", "darwin-arm64", "15.7.1", "update", "pass"],
  ]);

  const partial = gateRow(run({ workflow: "client-init-smoke", legs: INIT_LEGS, summaries: { ...initSummaries, summary_macos_update: "" } }));
  assert.deepEqual(partial.findings, ["missing-summary"]);
  assert.deepEqual(partial.legs.at(-1), { leg: "macos_update", result: "missing" });
});

it("reports a failed gate, a failed leg and server refusals, and nothing for a cancelled run", () => {
  const failedJob = gateRow(run({ result: "failure", summaries: {} }));
  assert.deepEqual(failedJob.findings, ["gate-failed", "missing-summary"]);

  const failedLeg = gateRow(run({ summaries: { summary_pipeline: JSON.stringify({ ...pipelineSummary, harnessErrors: {}, failure: "item-held", stepRefusals: 2 }) } }));
  assert.deepEqual(failedLeg.findings, ["gate-failed", "step-refusals"]);
  assert.equal(failedLeg.legs[0].result, "fail");

  const cancelled = gateRow(run({ result: "cancelled", summaries: {} }));
  assert.equal(cancelled.conclusion, "cancelled");
  assert.deepEqual(cancelled.findings, []);
  assert.deepEqual(cancelled.legs, [{ leg: "pipeline", result: "missing" }]);

  const evalRow = gateRow(run({ workflow: "agent-eval", legs: ["init_skill"], result: "failure", summaries: { summary_init_skill: JSON.stringify({ ...environment, os: "darwin-arm64", osVersion: "15.7.1", cases: [{ name: "rerun-asks-first", score: 0.67, runs: 3, failedRuns: 1 }], result: "fail" }) } }));
  assert.equal(evalRow.level, "eval");
  assert.deepEqual(evalRow.findings, ["gate-failed"]);
  assert.deepEqual(evalRow.legs[0].cases, [{ name: "rerun-asks-first", score: 0.67, runs: 3, failedRuns: 1 }]);
});

it("never copies text that the summary filters do not allow into the public comment", () => {
  const token = `hu_${"a".repeat(43)}`;
  const hostile = { ...pipelineSummary, os: "win32-x64", note: `@everyone ${token}`, scenario: "[click](https://example.invalid)", clientVersion: "2.1.322 @everyone", runs: ["done: 41 turns, 0 denied", `model said ${token}`], harnessErrors: { "@everyone": 3 }, steps: [{ step: `leak ${token}`, result: "pass" }] };
  const row = gateRow(run({ summaries: { summary_pipeline: JSON.stringify(hostile) } }));
  const comment = recordComment(row, REPOSITORY);
  const finding = findingIssue(gateRow(run({ result: "failure", summaries: { summary_pipeline: JSON.stringify(hostile) } })), REPOSITORY, "319");

  for (const text of [comment, finding.body, finding.title]) {
    assert.equal(text.includes(token), false);
    assert.equal(text.includes("@everyone"), false);
    assert.equal(text.includes("example.invalid"), false);
  }
  assert.deepEqual(row.legs[0].runs, ["done: 41 turns, 0 denied"]);
  assert.equal(row.legs[0].clientVersion, undefined);

  for (const text of ["not json", "[1,2]", "null", '"pass"', "{}", JSON.stringify({ result: "pass", note: "no os" })]) {
    assert.deepEqual(gateRow(run({ summaries: { summary_pipeline: text } })).legs, [{ leg: "pipeline", result: "missing" }]);
  }
});

it("refuses pull request runs, other branches and malformed run details", () => {
  assert.throws(() => gateRow(run({ event: "pull_request" })), /manual and scheduled/);
  assert.throws(() => gateRow(run({ ref: "refs/heads/harness/some-topic" })), /dev and main/);
  assert.throws(() => gateRow(run({ ref: "refs/pull/318/merge" })), /dev and main/);
  assert.throws(() => gateRow(run({ workflow: "check" })), /recorded gate/);
  assert.throws(() => gateRow(run({ workflow: "constructor" })), /recorded gate/);
  assert.throws(() => gateRow(run({ result: "neutral" })), /job result/);
  assert.throws(() => gateRow(run({ commit: "1eddbc2" })), /full commit/);
  assert.throws(() => gateRow(run({ runId: "0" })), /positive integers/);
  assert.throws(() => gateRow(run({ runAttempt: "1; rm" })), /positive integers/);
  assert.throws(() => gateRow(run({ legs: [] })), /distinct plain names/);
  assert.throws(() => gateRow(run({ legs: ["pipeline", "pipeline"] })), /distinct plain names/);
  assert.throws(() => gateRow(run({ legs: ["../pipeline"] })), /distinct plain names/);
  assert.equal(gateRow(run({ event: "schedule", ref: "refs/heads/main" })).ref, "main");
});

it("writes a first line for people, one line per leg and the row as JSON", () => {
  const row = gateRow(run());
  const comment = recordComment(row, REPOSITORY);
  const lines = comment.split("\n");

  assert.equal(lines[0], "pipeline-smoke · dev 1eddbc2 · success · run [42921691891](https://github.com/Sangeok/stagekeeper/actions/runs/42921691891/attempts/1) · harness-errors");
  assert.equal(lines[2], "- `pipeline`: pass · claude 2.1.322 · win32-x64 10.0.20348 · plugin 0.6.11");
  assert.deepEqual(JSON.parse(lines[lines.indexOf("```json") + 1]), row);
  assert.throws(() => recordComment(row, "not a repository"), /owner\/name/);
});

it("opens a finding only when there is one and reuses only the open issue that the workflow itself created", () => {
  const clean = gateRow(run({ summaries: { summary_pipeline: JSON.stringify({ ...pipelineSummary, harnessErrors: {} }) } }));
  assert.equal(findingIssue(clean, REPOSITORY, "319"), null);

  const finding = findingIssue(gateRow(run()), REPOSITORY, "319");
  assert.equal(finding.title, "[gate] pipeline-smoke 1eddbc2");
  assert.match(finding.body, /- `harness-errors`: /);
  assert.match(finding.body, /The row is in #319\./);
  assert.throws(() => findingIssue(gateRow(run()), REPOSITORY, "three"), /issue number/);

  const issues = [
    { number: 400, title: finding.title, login: "someone-else", pull: false },
    { number: 401, title: finding.title, login: "github-actions[bot]", pull: true },
    { number: 402, title: `${finding.title} again`, login: "github-actions[bot]", pull: false },
    { number: 403, title: finding.title, login: "github-actions[bot]", pull: false },
  ];
  assert.equal(openFinding(issues, finding.title), 403);
  assert.equal(openFinding(issues.slice(0, 3), finding.title), null);
});

it("writes the comment and the finding files, and nothing for a run that must not be recorded", t => {
  const root = mkdtempSync(join(tmpdir(), "stagekeeper-gate-record-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const open = join(root, "open.ndjson");
  writeFileSync(open, `${JSON.stringify({ number: 403, title: "[gate] pipeline-smoke 1eddbc2", login: "github-actions[bot]", pull: false })}\n`);
  const args = out => ["--workflow", "pipeline-smoke", "--result", "success", "--legs", "pipeline", "--event", "workflow_dispatch", "--ref", "refs/heads/dev", "--commit", COMMIT, "--run-id", "42921691891", "--run-attempt", "1", "--repository", REPOSITORY, "--record-issue", "319", "--out", out, "--open-issues", open];
  const env = { GATE_SUMMARIES: JSON.stringify({ summary_pipeline: JSON.stringify(pipelineSummary) }) };

  assert.equal(main(args(join(root, "found")), env), 0);
  assert.equal(readFileSync(join(root, "found", "comment.md"), "utf8"), recordComment(gateRow(run()), REPOSITORY));
  assert.equal(readFileSync(join(root, "found", "finding-title.txt"), "utf8"), "[gate] pipeline-smoke 1eddbc2");
  assert.equal(readFileSync(join(root, "found", "finding-number.txt"), "utf8"), "403");
  assert.match(readFileSync(join(root, "found", "finding-body.md"), "utf8"), /needs a review/);

  assert.equal(main(args(join(root, "clean")), { GATE_SUMMARIES: JSON.stringify({ summary_pipeline: JSON.stringify({ ...pipelineSummary, harnessErrors: {} }) }) }), 0);
  assert.equal(existsSync(join(root, "clean", "comment.md")), true);
  assert.equal(existsSync(join(root, "clean", "finding-title.txt")), false);

  const pullRequest = args(join(root, "pull")).map(value => (value === "workflow_dispatch" ? "pull_request" : value));
  assert.equal(main(pullRequest, env), 1);
  assert.equal(existsSync(join(root, "pull")), false);
  assert.equal(main(args(join(root, "short")).slice(2), env), 1);
  assert.equal(existsSync(join(root, "short")), false);
});
