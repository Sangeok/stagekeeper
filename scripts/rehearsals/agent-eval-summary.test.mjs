import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { evalLines, evalRecord, main, summarizeEval } from "./agent-eval-summary.mjs";

const grader = (name, passed) => ({ name, passed });
const evalResult = {
  cases: [
    { name: "rerun-asks-first", aggregates: { score: 1 }, arms: { with: [{ graders: [grader("asks-first", true)] }, { graders: [grader("asks-first", true)] }, { graders: [grader("asks-first", true)] }] } },
    { name: "first-connection-asks-before-register", aggregates: { score: 0.6667 }, arms: { with: [{ graders: [grader("no-register-before-yes", true)] }, { graders: [grader("no-register-before-yes", false)] }, { graders: [], error: "run timed out" }] } },
  ],
  costUsd: 4.3219,
  durationSeconds: 512.4,
};

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), "stagekeeper-eval-summary-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "plugin", ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, "plugin", ".claude-plugin", "plugin.json"), '{"version":"0.6.14"}');
  return root;
}

it("prints one line per case, one per run and the cost line", () => {
  assert.deepEqual(evalLines(evalResult), [
    "rerun-asks-first: score 1 over 3 runs",
    "  run 1: asks-first=pass",
    "  run 2: asks-first=pass",
    "  run 3: asks-first=pass",
    "first-connection-asks-before-register: score 0.6667 over 3 runs",
    "  run 1: no-register-before-yes=pass",
    "  run 2: no-register-before-yes=fail",
    "  run 3:  error",
    "cost estimate $4.32, 512.4s",
  ]);
});

it("counts a run as failed when a grader did not pass or the run errored, and takes the verdict from the exit code", () => {
  const passed = evalRecord(evalResult, 0);
  assert.deepEqual(passed.cases, [
    { name: "rerun-asks-first", score: 1, runs: 3, failedRuns: 0 },
    { name: "first-connection-asks-before-register", score: 0.6667, runs: 3, failedRuns: 2 },
  ]);
  assert.equal(passed.result, "pass");
  assert.equal(evalRecord(evalResult, 1).result, "fail");
  assert.deepEqual(evalRecord(null, 1), { result: "fail" });
});

it("keeps only allowlisted values in the eval summary", () => {
  const token = `hu_${"a".repeat(43)}`;
  const summary = summarizeEval({
    client: "claude", os: "darwin-arm64", osVersion: "15.7.1", clientVersion: "2.1.322", pluginVersion: "0.6.14", pluginCommit: "b".repeat(40),
    cases: [{ name: "rerun-asks-first", score: 0.66666, runs: 3, failedRuns: 1, note: token }, { name: `leak ${token}`, score: 1, runs: 3, failedRuns: 0 }, { name: "odd-counts", score: -1, runs: 1.5, failedRuns: "2" }],
    costUsd: 4.3219, seconds: 512.4, result: "pass", output: `Bearer ${token}`,
  });

  assert.equal(JSON.stringify(summary).includes(token), false);
  assert.deepEqual(summary.cases, [{ name: "rerun-asks-first", score: 0.67, runs: 3, failedRuns: 1 }, { name: "odd-counts" }]);
  assert.deepEqual(
    { client: summary.client, os: summary.os, osVersion: summary.osVersion, clientVersion: summary.clientVersion, pluginVersion: summary.pluginVersion, pluginCommit: summary.pluginCommit },
    { client: "claude", os: "darwin-arm64", osVersion: "15.7.1", clientVersion: "2.1.322", pluginVersion: "0.6.14", pluginCommit: "b".repeat(40) },
  );
  assert.equal(summary.costUsd, 4.32);
  assert.equal(summary.seconds, 512);
  assert.equal(summary.result, "pass");
  assert.equal("output" in summary, false);
  assert.equal(summarizeEval({ result: "maybe" }).result, undefined);
  assert.deepEqual(summarizeEval(summary), summary);
});

it("writes the summary file and prints the lines for a finished eval", t => {
  const root = workspace(t);
  writeFileSync(join(root, "eval.json"), JSON.stringify(evalResult));
  const printed = [];

  const code = main(["--result", join(root, "eval.json"), "--exit-code", "1", "--plugin", join(root, "plugin"), "--commit", "c".repeat(40), "--summary", join(root, "summary.json"), "--client-version-output", "2.1.322 (Claude Code)", "--os-version", "15.7.1\n"], line => printed.push(line), "darwin-arm64");

  assert.equal(code, 0);
  assert.equal(printed.join("\n"), evalLines(evalResult).join("\n"));
  const summary = JSON.parse(readFileSync(join(root, "summary.json"), "utf8"));
  assert.deepEqual(
    { client: summary.client, os: summary.os, osVersion: summary.osVersion, clientVersion: summary.clientVersion, pluginVersion: summary.pluginVersion, pluginCommit: summary.pluginCommit, result: summary.result },
    { client: "claude", os: "darwin-arm64", osVersion: "15.7.1", clientVersion: "2.1.322", pluginVersion: "0.6.14", pluginCommit: "c".repeat(40), result: "fail" },
  );
  assert.equal(summary.cases.length, 2);
});

it("still writes a summary with the verdict when the eval left no readable result", t => {
  const root = workspace(t);
  const printed = [];

  const code = main(["--result", join(root, "missing.json"), "--exit-code", "1", "--plugin", join(root, "plugin"), "--commit", "c".repeat(40), "--summary", join(root, "summary.json")], line => printed.push(line), "darwin-arm64");

  assert.equal(code, 0);
  assert.deepEqual(printed, ["no eval result"]);
  assert.deepEqual(JSON.parse(readFileSync(join(root, "summary.json"), "utf8")), { client: "claude", pluginVersion: "0.6.14", os: "darwin-arm64", pluginCommit: "c".repeat(40), result: "fail" });
});

it("refuses missing, unknown and malformed arguments before writing anything", t => {
  const root = workspace(t);
  const target = join(root, "summary.json");
  const complete = ["--result", join(root, "eval.json"), "--exit-code", "0", "--plugin", join(root, "plugin"), "--commit", "c".repeat(40), "--summary", target];

  assert.equal(main(complete.slice(2), () => {}), 2);
  assert.equal(main([...complete, "--note", "x"], () => {}), 2);
  assert.equal(main(complete.map(value => (value === "0" ? "zero" : value)), () => {}), 2);
  assert.throws(() => readFileSync(target, "utf8"));
});
