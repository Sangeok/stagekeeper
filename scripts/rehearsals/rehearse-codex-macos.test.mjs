import assert from "node:assert/strict";
import { it } from "node:test";
import path from "node:path";
import { assertIdleObservationGap, countResidentModelStarts, hasSuccessfulRoleRecord, parseMacosRehearsalArguments } from "./rehearse-codex-macos.mjs";

const required = ["--package", path.resolve("package"), "--templates", path.resolve("templates"), "--work", path.resolve("evidence"), "--browser-cli", path.resolve("browser/cli.js")];

it("counts actual resident model starts without counting message text and refuses damaged evidence", () => {
  const events = [{ event: "model-start", generation: 1 }, { event: "model-message", text: JSON.stringify({ event: "model-start" }) }, { event: "model-settled" }, { generation: 2, event: "model-start" }];
  const log = events.map(event => `2026-11-10T00:00:00Z ${JSON.stringify(event)}`).join("\n");
  assert.equal(countResidentModelStarts(log), 2);
  assert.equal(countResidentModelStarts("Runner started\n"), 0);
  assert.throws(() => countResidentModelStarts(log + '\n2026-11-10T00:01:00Z {"event":'));
});

it("requires accepted terminal outcomes instead of treating an owner-closed run as completed work", () => {
  const record = { agent: "work-assigner", closedAt: "2026-11-10T00:00:00Z", steps: [{ stepId: "propose", outcome: "ok", accepted: true }] };
  assert.equal(hasSuccessfulRoleRecord(record), false);
  for (const step of [{ stepId: "report", outcome: "ok", accepted: false }, { stepId: "report", outcome: "handoff", accepted: true }]) {
    assert.equal(hasSuccessfulRoleRecord({ ...record, steps: [...record.steps, step] }), false);
  }
  const complete = { ...record, steps: [...record.steps, { stepId: "report", outcome: "ok", accepted: true }] };
  assert.equal(hasSuccessfulRoleRecord(complete), true);
  assert.equal(hasSuccessfulRoleRecord({ ...complete, closedAt: null }), false);
  assert.equal(hasSuccessfulRoleRecord({ ...complete, closedAt: undefined }), false);
  for (const outcome of ["failed", "blocked"]) {
    assert.equal(hasSuccessfulRoleRecord({ ...complete, steps: [...complete.steps, { stepId: "propose", outcome, accepted: true }] }), false);
    assert.equal(hasSuccessfulRoleRecord({ ...complete, steps: [...complete.steps, { stepId: "propose", outcome, accepted: false }] }), true);
  }
  assert.equal(hasSuccessfulRoleRecord({ agent: "app-dev", closedAt: record.closedAt, steps: [{ stepId: "plan", outcome: "ok", accepted: true }] }), true);
});

it("refuses to count a suspended or discontinuous clock interval as observed idle time", () => {
  assert.doesNotThrow(() => assertIdleObservationGap(100000, 160000));
  assert.doesNotThrow(() => assertIdleObservationGap(100000, 190000));
  for (const current of [190001, 100000 + 110 * 60000, 99999, NaN, Infinity]) assert.throws(() => assertIdleObservationGap(100000, current), /interrupted/);
  assert.throws(() => assertIdleObservationGap(undefined, 160000), /interrupted/);
});

it("requires an explicit model-run decision and absolute isolated artifact inputs", () => {
  assert.throws(() => parseMacosRehearsalArguments(required), /run-models/);
  assert.throws(() => parseMacosRehearsalArguments([...required, "--run-models", "--work", path.resolve("other")]), /Invalid/);
  assert.throws(() => parseMacosRehearsalArguments(["--run-models", "--package", "relative"]), /absolute/);
  const result = parseMacosRehearsalArguments([...required, "--run-models", "--idle-minutes", "110"]);
  assert.equal(result.idleMinutes, 110);
  assert.equal(result.packageRoot, path.resolve("package"));
});

it("does not accept unbounded, negative or fractional idle observations", () => {
  for (const minutes of ["-1", "0.5", "121", "NaN", "Infinity"]) assert.throws(() => parseMacosRehearsalArguments([...required, "--run-models", "--idle-minutes", minutes]), /idle-minutes/);
});

it("separates model-free initialization from explicit eval and pipeline runs", () => {
  const init = parseMacosRehearsalArguments([...required, "--phase", "init", "--previous-package", path.resolve("previous")]);
  assert.equal(init.phase, "init");
  assert.equal(init.idleMinutes, 0);
  assert.equal(init.previousPackage, path.resolve("previous"));
  assert.equal(parseMacosRehearsalArguments([...required, "--phase", "eval", "--run-models"]).phase, "eval");
  for (const args of [["--phase", "init", "--run-models"], ["--phase", "eval"], ["--phase", "unknown"], ["--phase", "init", "--idle-minutes", "1"], ["--phase", "eval", "--run-models", "--previous-package", path.resolve("previous")]]) assert.throws(() => parseMacosRehearsalArguments([...required, ...args]));
});
