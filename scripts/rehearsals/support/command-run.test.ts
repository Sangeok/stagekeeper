import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { Run } from "./command-run";

const LEAVES_A_CHILD_RUNNING = [
  "const { spawn } = require(\"node:child_process\");",
  "const child = spawn(process.execPath, [\"-e\", \"setTimeout(() => {}, 60000)\"], { detached: true, stdio: [\"ignore\", \"inherit\", \"inherit\"] });",
  "child.unref();",
  "console.log(JSON.stringify({ started: child.pid }));",
].join("\n");

function runLeavingAChild(timeout: number, outputName?: string) {
  const temporary = realpathSync.native(tmpdir());
  const work = mkdtempSync(path.join(temporary, "rehearsal-run-"));
  const run = new Run(path.join(work, "commands.log"));
  let child: number | undefined;
  try {
    const outcome = run.command(process.execPath, ["-e", LEAVES_A_CHILD_RUNNING], temporary, process.env, timeout, outputName && path.join(work, outputName));
    child = Number(/"started":(\d+)/.exec(outcome.stdout)?.[1]) || undefined;
    return outcome;
  } finally {
    if (child) process.kill(child);
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

it("fails a command that hits its timeout even when the process itself exited 0", () => {
  const outcome = runLeavingAChild(1_000);
  assert.match(outcome.stdout, /"started":\d+/);
  assert.equal(outcome.code, -1);
});

it("returns when the process exits and keeps its output when an output file is given, while its child keeps running", () => {
  const outcome = runLeavingAChild(20_000, "start.txt");
  assert.equal(outcome.code, 0);
  assert.match(outcome.stdout, /"started":\d+/);
});

it("records an aborted step without calling its action or opening a log", async t => {
  const work = mkdtempSync(path.join(realpathSync.native(tmpdir()), "rehearsal-abort-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const controller = new AbortController();
  const stopped = new Error("stopped before setup");
  controller.abort(stopped);
  const log = path.join(work, "commands.log");
  const run = new Run(log, controller.signal);
  let called = false;
  await assert.rejects(run.step("setup", () => { called = true; }), error => error === stopped);
  assert.equal(called, false);
  assert.equal(run.failure, "setup");
  assert.deepEqual(run.steps, [{ step: "setup", result: "fail" }]);
  assert.deepEqual(run.outputs, []);
  assert.equal(existsSync(log), false);
});
