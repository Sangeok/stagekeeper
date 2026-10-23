import assert from "node:assert/strict";
import { it } from "node:test";
import { ResidentRunUnsettled, runResident } from "../runtime/background.mjs";

const READY = { items: [{ key: "ITEM-01", node: "plan", version: 1, action: "dispatch", agent: "dev", format: null, entry: null }], head: null, runbookStale: false };
const EMPTY = { ...READY, items: [] };
const OK = { kind: "ok", paused: false, stop: null };
const CLEAN = { branch: "main", current: "main", dirty: [] };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture({ onBeat, onOverview, onStart, onSleep, onEnd, stopMode = "interrupt" } = {}) {
  const state = { now: 0, life: "active", overview: READY, branch: "main" };
  const calls = { beats: [], overviews: 0, runs: [], ends: [], classified: [], saves: [] };
  const deps = {
    lifecycle: () => state.life,
    beat: async body => { calls.beats.push(body); return await onBeat?.(body, state, calls) ?? OK; },
    overview: async () => { calls.overviews++; return await onOverview?.(state, calls) ?? state.overview; },
    tree: () => ({ ...CLEAN, branch: state.branch, current: state.branch }),
    branch: () => state.branch,
    save: body => calls.saves.push(body),
    log: () => {},
    notify: () => {},
    now: () => state.now,
    sleep: async ms => {
      state.now += ms;
      if (state.now > 120 * 60_000) throw new Error("Fake clock exceeded its bound");
      await onSleep?.(state, calls);
    },
    execution: {
      stopMode,
      start: ({ generation }) => {
        const completion = deferred();
        const run = { ...completion, generation };
        calls.runs.push(run);
        onStart?.(run, state, calls);
        return { done: completion.promise, end: async reason => { calls.ends.push({ generation, reason }); await onEnd?.(run, state, calls); } };
      },
      classify: result => {
        calls.classified.push(result);
        return { outcome: result.terminal === "completed" ? "success" : "error", line: "fake cycle completed" };
      },
    },
  };
  return { deps, calls, state, run: () => runResident({ branch: "main", interval: 100, branchCheck: 10 }, deps) };
}

it("keeps 110 minutes of idle model-free while reporting and polling", async () => {
  const f = fixture({ onSleep: state => { if (state.now >= 110 * 60_000) state.life = "stopping"; } });
  f.state.overview = EMPTY;
  assert.equal(await runResident({ branch: "main" }, f.deps), "owner");
  assert.equal(f.calls.runs.length, 0);
  assert.equal(f.calls.classified.length, 0);
  assert.equal(f.calls.beats.length, 110);
  assert.equal(f.calls.overviews, 110);
});

it("starts no run when Pause arrives after the ready overview", async () => {
  const f = fixture({
    onBeat: body => body.state === "working" ? { ...OK, paused: true } : OK,
    onSleep: state => { state.life = "stopping"; },
  });
  assert.equal(await f.run(), "owner");
  assert.equal(f.calls.overviews, 1);
  assert.equal(f.calls.runs.length, 0);
});

it("resumes a paused poller and serializes duplicate work using distinct generations", async () => {
  let active = 0, maximumActive = 0, paused = true;
  const f = fixture({
    onBeat: () => ({ ...OK, paused }),
    onSleep: () => { paused = false; },
    onStart: (run, state, calls) => {
      maximumActive = Math.max(maximumActive, ++active);
      queueMicrotask(() => {
        active--;
        run.resolve({ terminal: "completed", log: `run-${run.generation}.jsonl` });
        if (calls.runs.length > 1) calls.runs[0].resolve({ terminal: "late", log: "foreign.jsonl" });
      });
    },
  });
  assert.equal(await f.run(), "stuck");
  assert.deepEqual(f.calls.runs.map(run => run.generation), [1, 2, 3]);
  assert.equal(maximumActive, 1);
  assert.equal(f.calls.classified.length, 3);
  assert.ok(f.calls.classified.every(result => result.terminal === "completed"));
  assert.ok(f.calls.beats.filter(body => body.lastResult).every(body => body.lastResult === "fake cycle completed"));
});

it("waits for settlement after stop and rejects the late success as work", async () => {
  const interrupted = deferred();
  const f = fixture({
    onSleep: state => { state.life = "stopping"; },
    onEnd: () => { interrupted.resolve(); },
  });
  let returned = false;
  const running = f.run().then(result => { returned = true; return result; });
  await interrupted.promise;
  assert.equal(returned, false);
  assert.equal(f.calls.overviews, 1);
  assert.deepEqual(f.calls.ends, [{ generation: 1, reason: "stop" }]);
  f.calls.runs[0].resolve({ terminal: "completed", log: "late.jsonl" });
  assert.equal(await running, "owner");
  assert.equal(f.calls.runs.length, 1);
  assert.equal(f.calls.classified.length, 0);
  assert.equal(f.calls.overviews, 1);
  assert.ok(f.calls.beats.every(body => !body.lastResult));
  assert.ok(f.calls.saves.every(body => body.failures === 0 && body.lastResult === null));
});

for (const [name, signal, expected] of [
  ["replaced", { kind: "replaced" }, "replaced"],
  ["plan withdrawal", { ...OK, stop: "plan" }, "plan"],
  ["lost route", { kind: "missing" }, "missing"],
  ["access refusal", { kind: "refused" }, "error"],
]) {
  it(`interrupts ${name} once and performs no work effects after settlement`, async () => {
    const f = fixture({
      onBeat: (body, state, calls) => calls.runs.length ? signal : OK,
      onEnd: run => { run.resolve({ terminal: "completed" }); },
    });
    assert.equal(await f.run(), expected);
    assert.deepEqual(f.calls.ends, [{ generation: 1, reason: "stop" }]);
    assert.equal(f.calls.overviews, 1);
    assert.equal(f.calls.classified.length, 0);
    assert.ok(f.calls.beats.every(body => !body.lastResult));
  });
}

it("interrupts after five failed heartbeats during a run", async () => {
  let failed = 0;
  const f = fixture({
    onBeat: (body, state, calls) => {
      if (!calls.runs.length) return OK;
      failed++;
      return { kind: "transient" };
    },
    onEnd: run => { run.resolve({ terminal: "completed" }); },
  });
  assert.equal(await f.run(), "error");
  assert.equal(failed, 5);
  assert.equal(f.calls.ends.length, 1);
  assert.equal(f.calls.overviews, 1);
});

it("bounds failures at the pre-dispatch lease check without starting a model", async () => {
  const f = fixture({ onBeat: body => body.state === "working" ? { kind: "transient" } : OK });
  assert.equal(await f.run(), "error");
  assert.equal(f.calls.runs.length, 0);
  assert.equal(f.calls.beats.filter(body => body.state === "working").length, 5);
});

for (const operation of ["beat", "overview"]) {
  it(`fences a local ownership change during an awaited ${operation}`, async () => {
    const f = fixture({
      onBeat: (body, state) => { if (operation === "beat") state.life = "gone"; return OK; },
      onOverview: state => { if (operation === "overview") state.life = "gone"; },
    });
    assert.equal(await f.run(), "replaced");
    assert.equal(f.calls.runs.length, 0);
    assert.equal(f.calls.overviews, operation === "overview" ? 1 : 0);
  });
}

it("lets a paused active run finish without querying new work or interrupting it", async () => {
  const f = fixture({
    onBeat: (body, state, calls) => {
      if (!calls.runs.length) return OK;
      calls.runs[0].resolve({ terminal: "completed", log: "run.jsonl" });
      return { ...OK, paused: true };
    },
    onSleep: state => { state.life = "stopping"; },
  });
  assert.equal(await f.run(), "owner");
  assert.equal(f.calls.runs.length, 1);
  assert.equal(f.calls.ends.length, 0);
  assert.equal(f.calls.overviews, 1);
});

it("rechecks ownership after completion before querying progress or publishing results", async () => {
  const f = fixture({ onStart: (run, state) => { queueMicrotask(() => { state.life = "gone"; run.resolve({ terminal: "completed" }); }); } });
  assert.equal(await f.run(), "replaced");
  assert.equal(f.calls.overviews, 1);
  assert.equal(f.calls.classified.length, 0);
  assert.ok(f.calls.beats.every(body => !body.lastResult));
});

it("does not publish a result when ownership is lost during the progress request", async () => {
  const f = fixture({
    onStart: run => { queueMicrotask(() => run.resolve({ terminal: "completed" })); },
    onOverview: (state, calls) => { if (calls.overviews === 2) state.life = "gone"; },
  });
  assert.equal(await f.run(), "replaced");
  assert.equal(f.calls.overviews, 2);
  assert.ok(f.calls.beats.every(body => !body.lastResult));
});

it("propagates unconfirmed cleanup without classifying, reporting or restarting", async () => {
  const f = fixture({ onStart: run => { queueMicrotask(() => run.reject(new Error("reader still open"))); } });
  await assert.rejects(f.run(), error => error instanceof ResidentRunUnsettled && error.code === "resident-run-unsettled");
  assert.equal(f.calls.runs.length, 1);
  assert.equal(f.calls.classified.length, 0);
  assert.equal(f.calls.overviews, 1);
  assert.ok(f.calls.beats.every(body => !body.lastResult));
});

it("preserves unsettled ownership when the termination request rejects", async () => {
  const f = fixture({
    onSleep: state => { state.life = "stopping"; },
    onEnd: () => { throw new Error("interrupt failed"); },
  });
  await assert.rejects(f.run(), { code: "resident-run-unsettled" });
  assert.equal(f.calls.ends.length, 1);
  f.calls.runs[0].reject(new Error("late transport failure"));
  await Promise.resolve();
  assert.equal(f.calls.classified.length, 0);
});

it("requires an explicit execution contract before any server request", async () => {
  const f = fixture();
  delete f.deps.execution;
  await assert.rejects(f.run(), /execution adapter required/);
  assert.equal(f.calls.beats.length, 0);
});
