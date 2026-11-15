import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { controlDetected, evalLines, evalRecord, GATE_CASES, main, summarizeEval } from "./agent-eval-summary.mjs";

const control = { cases: [{ name: "control-real-write", arms: { with: [{ graders: [
  { name: "shell-prefix-active", passed: true },
  { name: "no-register-before-yes", passed: false },
  { name: "no-generate-before-yes", passed: false },
  { name: "no-write-before-yes", passed: false },
] }] } }] };
const result = () => ({
  cases: Object.entries(GATE_CASES).map(([name, graders]) => ({ name, aggregates: { score: 1 }, arms: { with: Array.from({ length: 3 }, () => ({ graders: graders.map(name => ({ name, passed: true })) })) } })),
  costUsd: 4.3219, durationSeconds: 512.4,
});

function workspace(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "stagekeeper-eval-summary-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "plugin", ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, "plugin", ".claude-plugin", "plugin.json"), '{"version":"0.6.14"}');
  writeFileSync(join(root, "control.json"), JSON.stringify(control));
  writeFileSync(join(root, "eval.json"), JSON.stringify(result()));
  return root;
}

function args(root) {
  return ["--result", join(root, "eval.json"), "--exit-code", "0", "--control", join(root, "control.json"), "--plugin", join(root, "plugin"), "--commit", "c".repeat(40), "--summary", join(root, "summary.json")];
}

it("requires a working control and three successful repetitions of every gate case", () => {
  assert.equal(controlDetected(control), true);
  assert.equal(evalRecord(result(), 0, control).gateComplete, true);
  assert.equal(evalRecord(result(), 0).gateComplete, false);
  assert.equal(evalRecord(result(), 1, control).result, "fail");
  const partial = result();
  partial.cases.pop();
  assert.equal(evalRecord(partial, 0, control).result, "pass");
  assert.equal(evalRecord(partial, 0, control).gateComplete, false);
  partial.cases = [result().cases[0], result().cases[0], result().cases[0]];
  assert.equal(evalRecord(partial, 0, control).result, "fail");
});

it("rejects missing output, graders and errors despite exit zero", () => {
  for (const input of [null, {}, { cases: [] }, { cases: "invalid" }]) assert.equal(evalRecord(input, 0, control).result, "fail");
  for (const mutate of [
    run => { run.graders = []; },
    run => { run.graders.pop(); },
    run => { run.graders[0].passed = false; },
    run => { run.graders[1] = run.graders[0]; },
    run => { run.error = "private error"; },
  ]) {
    const input = result();
    mutate(input.cases[0].arms.with[0]);
    const summary = evalRecord(input, 0, control);
    assert.equal(summary.result, "fail");
    assert.equal(summary.gateComplete, false);
    assert.equal(summary.cases[0].failedRuns, 1);
  }
});

it("rejects an errored, incomplete or different control", () => {
  for (const mutate of [
    input => { input.cases[0].name = "other"; },
    input => { input.cases[0].arms.with[0].error = "failed"; },
    input => { input.cases[0].arms.with[0].graders.pop(); },
    input => { input.cases[0].arms.with[0].graders[0].passed = false; },
    input => { input.cases.push(input.cases[0]); },
  ]) {
    const input = structuredClone(control);
    mutate(input);
    assert.equal(controlDetected(input), false);
  }
});

it("prints only known cases and numbers and keeps unknown cost unknown", () => {
  const input = result();
  input.cases[0].arms.with[0].graders[0].name = "secret-canary-123";
  input.cases.push({ name: "secret-canary-123", aggregates: { score: "secret-canary-123" } });
  input.costUsd = "secret-canary-123";
  input.durationSeconds = "secret-canary-123";
  const lines = evalLines(input).join("\n");
  assert.equal(lines.includes("secret-canary-123"), false);
  assert.match(lines, /cost estimate unknown, unknowns/);
  assert.equal(evalLines(result()).at(-1), "cost estimate $4.32, 512s");
});

it("filters public fields and survives a second pass through the record filter", () => {
  const secret = "hu_" + "a".repeat(43);
  const summary = summarizeEval({
    client: "claude", os: "darwin-arm64", osVersion: "15.7.1", clientVersion: "2.1.322", pluginVersion: "0.6.14", pluginCommit: "b".repeat(40),
    ...evalRecord(result(), 0, control), output: secret, selection: "gate",
  });
  assert.equal(JSON.stringify(summary).includes(secret), false);
  assert.equal(summary.gateComplete, true);
  assert.equal(summary.costUsd, 4.32);
  assert.deepEqual(summarizeEval(summary), summary);
  assert.equal(summarizeEval({ result: "maybe" }).result, undefined);
});

it("writes a complete summary only after checking the control", t => {
  const root = workspace(t);
  const printed = [];
  assert.equal(main([...args(root), "--client-version-output", "2.1.322 (Claude Code)", "--os-version", "15.7.1"], line => printed.push(line), "darwin-arm64"), 0);
  const summary = JSON.parse(readFileSync(join(root, "summary.json"), "utf8"));
  assert.equal(summary.gateComplete, true);
  assert.equal(summary.clientVersion, "2.1.322");
  assert.equal(summary.selection, "gate");
  assert.equal(printed.join("\n"), evalLines(result()).join("\n"));
});

it("records partial or absent output without passing the full gate", t => {
  const root = workspace(t);
  const partial = result();
  partial.cases = partial.cases.slice(0, 1);
  writeFileSync(join(root, "eval.json"), JSON.stringify(partial));
  assert.equal(main(args(root), () => {}), 1);
  assert.equal(main([...args(root), "--selection", "first-connection*"], () => {}), 0);
  assert.equal(JSON.parse(readFileSync(join(root, "summary.json"), "utf8")).gateComplete, false);
  rmSync(join(root, "eval.json"));
  assert.equal(main(args(root), () => {}), 1);
  assert.equal(JSON.parse(readFileSync(join(root, "summary.json"), "utf8")).result, "fail");
});

it("rejects malformed arguments before writing and prints fixed control diagnostics", t => {
  const root = workspace(t);
  assert.equal(main(args(root).slice(2), () => {}), 2);
  assert.equal(main([...args(root), "--note", "x"], () => {}), 2);
  assert.equal(main(args(root).map(value => value === "0" ? "zero" : value), () => {}), 2);
  assert.equal(existsSync(join(root, "summary.json")), false);
  const printed = [];
  assert.equal(main(["--check-control", join(root, "control.json")], line => printed.push(line)), 0);
  assert.equal(main(["--check-control", join(root, "missing.json")], line => printed.push(line)), 1);
  assert.deepEqual(printed, ["control: registration, generation and writes detected", "control: detection failed"]);
});

it("matches the cases and graders in the shipped evaluation fixtures", () => {
  for (const [name, graders] of Object.entries(GATE_CASES)) {
    const yaml = readFileSync(new URL("../../plugin/evals/" + name + "/case.yaml", import.meta.url), "utf8");
    assert.match(yaml, /tags: \[init, gate\]/);
    assert.deepEqual([...yaml.matchAll(/^  - name: ([a-z-]+)\r?$/gm)].map(match => match[1]), graders);
  }
});

it("redirects raw model output and propagates the summary failure in the workflow", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/agent-eval.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes('--json "$RUNNER_TEMP/control.json" > "$RUNNER_TEMP/control-private.log" 2>&1'));
  assert.ok(workflow.includes('--json "$RUNNER_TEMP/eval.json" > "$RUNNER_TEMP/eval-private.log" 2>&1'));
  assert.ok(workflow.includes('--check-control "$RUNNER_TEMP/control.json"'));
  assert.ok(workflow.includes('summary_code=${PIPESTATUS[0]}'));
  assert.ok(workflow.includes('exit "$summary_code"'));
  assert.doesNotMatch(workflow, /last message:|commands of one run|transcript:|upload-artifact|tail -n \+2/);
});
