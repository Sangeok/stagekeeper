import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { it } from "node:test";
import { promisify } from "node:util";
import { dryRunHelper, openDryRunObserver, planned, preserved, receiptOutput } from "./codex-init-eval-observer.mjs";

const invoke = promisify(execFile);
const turn = () => ({ id: randomUUID(), name: "dry-run-only", repetition: 1 });

it("runs only the bound native operation and returns its receipt and safe output", { skip: process.platform === "win32" }, async () => {
  const current = turn();
  const observer = await openDryRunObserver(current);
  const helper = path.join(import.meta.dirname, dryRunHelper);
  const options = { env: { STAGEKEEPER_EVAL_OBSERVER: observer.url } };
  let calls = 0, sealed;
  try {
    const health = await invoke(helper, ["--check-observer"], options);
    assert.equal(health.stdout.trim(), current.id);
    observer.begin(async () => ({ exitCode: calls++ === 0 ? 0 : 3, stdout: "server: private\n" + preserved + "\n" + planned + "\n", stderr: "private error" }));
    const first = await invoke(helper, [], options);
    const failure = await invoke(helper, [], options).then(() => assert.fail("Expected native exit 3"), error => error);
    assert.equal(failure.code, 3);
    observer.seal();
    assert.equal((await invoke(helper, ["--check-observer"], options)).stdout.trim(), current.id);
    sealed = await observer.close(true);
    assert.equal(sealed.complete, true);
    assert.equal(sealed.attempts, 2);
    assert.deepEqual(sealed.calls.map(c => c.exitCode), [0, 3]);
    assert.notEqual(sealed.calls[0].receipt, sealed.calls[1].receipt);
    for (const [i, output] of [first, failure].entries()) {
      assert.deepEqual(sealed.calls[i].lines, [preserved, planned]);
      assert.equal(output.stdout.trimEnd(), receiptOutput(sealed.calls[i]));
      assert.equal(output.stderr, "");
    }
  } finally {
    if (!sealed) await observer.close(false);
  }
});

it("keeps preflight and model observations separate and records a refused incomplete-package request", async t => {
  const first = await openDryRunObserver(turn()), next = await openDryRunObserver(turn());
  t.after(() => Promise.all([first.close(false), next.close(false)]));
  first.begin(async () => ({ exitCode: 0, stdout: planned }));
  const receipt = await (await fetch(first.url, { method: "POST" })).text();
  first.seal();
  const preflight = await first.close(true);
  assert.ok(receipt.includes(preflight.calls[0].receipt));
  next.begin(null);
  const refusal = await fetch(next.url, { method: "POST" });
  assert.equal((await refusal.text()).trim(), "2\ndry-run target unavailable");
  next.seal();
  const observation = await next.close(true);
  assert.equal(observation.complete, true);
  assert.equal(observation.attempts, 1);
  assert.deepEqual(observation.calls, []);
  assert.notEqual(preflight.id, observation.id);
});

it("cannot report complete coverage if execution, transport or the final probe fails", async () => {
  const unavailable = await openDryRunObserver(turn());
  unavailable.begin(async () => { throw new Error("private backend detail"); });
  const failure = await fetch(unavailable.url, { method: "POST" });
  assert.equal(failure.status, 503);
  assert.equal(await failure.text(), "");
  unavailable.seal();
  assert.equal((await unavailable.close(true)).complete, false);

  const unverified = await openDryRunObserver(turn());
  unverified.begin(null);
  unverified.seal();
  assert.equal((await unverified.close(false)).complete, false);
});

it("seals the current turn and drains unfinished execution before returning evidence", async () => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const result = new Promise(resolve => { release = resolve; });
  const observer = await openDryRunObserver(turn());
  observer.begin(async () => { entered(); return result; });
  const request = fetch(observer.url, { method: "POST" });
  await started;
  observer.seal();
  const late = await fetch(observer.url, { method: "POST" });
  assert.equal(late.status, 409);
  release({ exitCode: 0, stdout: planned });
  await (await request).text();
  const observed = await observer.close(true);
  assert.equal(observed.complete, false);
  assert.equal(observed.calls.length, 1);
});

it("does not accept caller-supplied execution results or a different turn's address", async t => {
  const observer = await openDryRunObserver(turn());
  t.after(() => observer.close(false));
  let launches = 0;
  observer.begin(async () => { launches++; return { exitCode: 0, stdout: planned }; });
  const otherTurn = new URL("/" + randomUUID(), observer.url);
  assert.equal((await fetch(otherTurn, { method: "POST" })).status, 404);
  const submitted = await fetch(observer.url, { method: "POST", body: JSON.stringify({ exitCode: 0, lines: [planned] }) });
  assert.equal(submitted.status, 400);
  observer.seal();
  const evidence = await observer.close(true);
  assert.equal(launches, 0);
  assert.equal(evidence.complete, false);
  assert.deepEqual(evidence.calls, []);
});
