import assert from "node:assert/strict";
import { it } from "node:test";
import { backgroundSettings, classifyRun, fileList, fillNotice, porcelainPaths, pushBlockedEnv, quoteWindowsArgument, readStreamLine,
  runArguments, runResident } from "../runtime/background.mjs";

const WORK = { items: [{ key: "ITEM-01", node: "plan", version: 1, action: "dispatch", agent: "dev", format: null, entry: null }], head: null, runbookStale: false };
const NEXT = { items: [{ ...WORK.items[0], node: "verify" }], head: null, runbookStale: false };
const NONE = { items: [], head: null, runbookStale: false };
const CLEAN = { branch: "main", current: "main", dirty: [] };
const OK = { kind: "ok", paused: false, stop: null };
const SUCCESS = { exitCode: 0, result: { subtype: "success", isError: false, turns: 4, terminal: "completed", denials: 0 }, log: "run.jsonl" };

function harness({ overviews = [WORK, NONE], trees = [], heads = null, beats = [], runs = [], lifecycle = [], maxLoops = 40 } = {}) {
  const calls = { beats: [], beatAt: [], notices: [], runs: 0, ended: [], saves: [], logs: [], endedAt: [] };
  let clock = 0, loops = 0;
  const next = (list, fallback) => (list.length > 1 ? list.shift() : list[0] ?? fallback);
  const deps = {
    lifecycle: async () => {
      if (++loops > maxLoops * 50) return "stopping";
      return next(lifecycle, "active");
    },
    beat: async payload => { calls.beats.push(payload); calls.beatAt.push(clock); const value = next(beats, OK); return typeof value === "function" ? value(payload, calls) : value; },
    overview: async () => { const value = next(overviews, NONE); if (value instanceof Error) throw value; return value; },
    tree: () => next(trees, CLEAN),
    branch: () => {
      const value = heads ? next(heads, "main") : next(trees, CLEAN).branch;
      if (value instanceof Error) throw value;
      return value;
    },
    execution: { stopMode: "drain", classify: classifyRun, start: () => {
      calls.runs++;
      const plan = next(runs, SUCCESS);
      let resolve;
      const done = new Promise(r => { resolve = r; });
      if (!plan.hang) queueMicrotask(() => resolve(plan));
      return { done, end: reason => { calls.ended.push(reason); calls.endedAt.push(clock); resolve({ exitCode: 1, result: null, log: "run.jsonl", ...plan.onEnd }); } };
    } },
    notify: notice => calls.notices.push(notice.kind),
    save: status => calls.saves.push(status),
    sleep: async ms => { clock += ms; },
    now: () => clock,
    log: line => calls.logs.push(line),
  };
  return { deps, calls };
}

it("runs the ready work, reports the result line and returns to idle", async () => {
  const { deps, calls } = harness({ overviews: [WORK, NONE, NONE], lifecycle: ["active", "active", "active", "active", "active", "stopping"] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, deps), "owner");
  assert.equal(calls.runs, 1);
  assert.deepEqual(calls.beats[0], { state: "idle" });
  assert.ok(calls.beats.some(beat => beat.state === "working"));
  assert.ok(calls.beats.some(beat => beat.lastResult === "done: 4 turns, 0 denied" && beat.lastLog === "run.jsonl"));
  assert.deepEqual(calls.notices, []);
});

it("waits on uncommitted changes, notifies once with the files, and continues when the tree is clean", async () => {
  const dirty = { ...CLEAN, dirty: ["a.ts", "b.ts", "c.ts", "d.ts"] };
  const { deps, calls } = harness({ overviews: [WORK, WORK, WORK, NONE], trees: [dirty, dirty, CLEAN],
    lifecycle: Array(12).fill("active").concat("stopping") });
  await runResident({ branch: "main", interval: 1000 }, deps);
  assert.deepEqual(calls.notices, ["waitDirty"]);
  assert.ok(calls.beats.some(beat => beat.state === "waiting" && beat.waitReason === "dirty"));
  assert.equal(calls.runs, 1);
  assert.equal(fillNotice("waitDirty", { branch: "main", files: fileList(dirty.dirty) }).body,
    "Uncommitted changes: a.ts, b.ts, c.ts and 1 more. Commit or stash them, and it continues.");
});

it("tells the server about a wait and its end within a second, not at the next minute's signal", async () => {
  const dirty = { ...CLEAN, dirty: ["a.ts"] };
  const { deps, calls } = harness({ overviews: [WORK, NONE], trees: [dirty, CLEAN] });
  await runResident({ branch: "main" }, deps);
  assert.deepEqual(calls.beats.slice(0, 3), [{ state: "idle" }, { state: "waiting", waitReason: "dirty" }, { state: "idle" }]);
  assert.deepEqual(calls.beatAt.slice(0, 4), [0, 1_000, 2_000, 62_000]);
  assert.deepEqual(calls.notices, ["waitDirty"]);
});

it("ends a run when the branch changes, does not count it as a failure, and waits once on the branch", async () => {
  const other = { branch: "feature", current: "feature", dirty: ["half.ts"] };
  const { deps, calls } = harness({
    overviews: [WORK, WORK, WORK, WORK, WORK, NONE],
    trees: [CLEAN, other, other, other, { ...CLEAN, dirty: ["half.ts"] }, CLEAN],
    runs: [{ hang: true, onEnd: { endedFor: "branch" } }, SUCCESS],
    lifecycle: Array(30).fill("active").concat("stopping"),
  });
  await runResident({ branch: "main", interval: 1000 }, deps);
  assert.deepEqual(calls.ended, ["branch"]);
  assert.deepEqual(calls.notices, ["branchEnded", "waitInterrupted"]);
  assert.ok(calls.saves.every(status => status.failures === 0));
  assert.equal(calls.runs, 2);
});

it("checks the branch every two seconds during a run and still beats once a minute", async () => {
  const { deps, calls } = harness({ overviews: [WORK, WORK, NONE], heads: [...Array(40).fill("main"), "feature", "main"],
    runs: [{ hang: true, onEnd: { endedFor: "branch" } }] });
  await runResident({ branch: "main" }, deps);
  assert.deepEqual(calls.ended, ["branch"]);
  assert.deepEqual(calls.endedAt, [80_000]);
  assert.equal(calls.beats.filter(beat => beat.state === "working" && !beat.lastResult).length, 2);
});

it("keeps the run going when one branch check fails", async () => {
  const { deps, calls } = harness({ overviews: [WORK, WORK, NONE], heads: [new Error("HEAD is locked"), "main", "feature", "main"],
    runs: [{ hang: true, onEnd: { endedFor: "branch" } }] });
  assert.equal(await runResident({ branch: "main" }, deps), "owner");
  assert.deepEqual(calls.endedAt, [4_000]);
  assert.ok(calls.logs.includes("branch check failed: HEAD is locked"));
});

it("notifies once when a run that was paused finishes", async () => {
  const paused = { kind: "ok", paused: true, stop: null };
  const { deps, calls } = harness({ overviews: [WORK, NEXT, NONE], beats: [OK, paused, paused, paused],
    lifecycle: Array(8).fill("active").concat("stopping") });
  await runResident({ branch: "main", interval: 1000 }, deps);
  assert.deepEqual(calls.notices, ["pausedFinished"]);
});

it("stops as stuck after three runs without progress", async () => {
  const { deps, calls } = harness({ overviews: [WORK] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, deps), "stuck");
  assert.equal(calls.runs, 3);
});

it("stops with an error when a failed run is among the three", async () => {
  const failed = { exitCode: 1, result: { subtype: "error_during_execution", isError: true, turns: 1, terminal: "completed", denials: 0 }, log: "run.jsonl" };
  const mixed = harness({ overviews: [WORK], runs: [SUCCESS, failed, SUCCESS] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, mixed.deps), "error");
  assert.equal(mixed.calls.runs, 3);
  const allFailed = harness({ overviews: [WORK], runs: [failed] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, allFailed.deps), "error");
  const reset = harness({ overviews: [WORK, WORK, WORK, WORK, WORK, NEXT], runs: [failed, failed, SUCCESS] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, reset.deps), "stuck");
});

it("counts a timeout as a failure and marks changes it left as an interrupted run", async () => {
  const left = { ...CLEAN, dirty: ["partial.ts"] };
  const { deps, calls } = harness({ overviews: [WORK, WORK, WORK], trees: [CLEAN, CLEAN, CLEAN, left, left],
    runs: [{ hang: true, onEnd: { endedFor: "timeout" } }], lifecycle: Array(20).fill("active").concat("stopping") });
  await runResident({ branch: "main", interval: 1000, runLimit: 2000 }, deps);
  assert.deepEqual(calls.ended, ["timeout"]);
  assert.ok(calls.beats.some(beat => beat.lastResult === "ended: time limit"));
  assert.deepEqual(calls.notices, ["waitInterrupted"]);
  assert.ok(calls.saves.some(status => status.interrupted?.log === "run.jsonl" && status.failures === 1));
});

it("follows the server: pause starts nothing, plan and replaced stop, a lost route stops", async () => {
  const pausedOnly = harness({ beats: [{ kind: "ok", paused: true, stop: null }], lifecycle: Array(5).fill("active").concat("stopping") });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, pausedOnly.deps), "owner");
  assert.equal(pausedOnly.calls.runs, 0);
  assert.equal(await runResident({ branch: "main" }, harness({ beats: [{ kind: "ok", paused: false, stop: "plan" }] }).deps), "plan");
  assert.equal(await runResident({ branch: "main" }, harness({ beats: [{ kind: "replaced" }] }).deps), "replaced");
  assert.equal(await runResident({ branch: "main" }, harness({ beats: [{ kind: "missing" }] }).deps), "missing");
});

it("finishes a running run before stopping for a lost route or a local stop", async () => {
  const lost = harness({ overviews: [WORK, NONE], beats: [OK, { kind: "missing" }, { kind: "missing" }] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, lost.deps), "missing");
  assert.equal(lost.calls.runs, 1);
  assert.deepEqual(lost.calls.ended, []);
  const stopping = harness({ overviews: [WORK, NONE], lifecycle: ["active", "active", "active", "stopping"] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, stopping.deps), "owner");
  assert.equal(stopping.calls.runs, 1);
});

it("stops with an error after five transient server failures in a row", async () => {
  const { deps, calls } = harness({ beats: [{ kind: "transient", retryAfter: 0 }] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, deps), "error");
  assert.equal(calls.beats.length, 5);
  const overview = harness({ overviews: [new Error("down")] });
  assert.equal(await runResident({ branch: "main", interval: 1000 }, overview.deps), "error");
});

it("keeps the confirmed edit-guard copy", () => {
  assert.equal(fillNotice("waitInterrupted", { branch: "main", files: "a.ts" }).body,
    "The last run stopped partway and left changes in a.ts. Check them, then commit or stash them, and it continues.");
  assert.equal(fillNotice("waitBranch", { branch: "main", current: "feature" }).body, "This checkout is on feature. Switch back to main, and it continues.");
  assert.equal(fillNotice("branchEnded", { branch: "main", current: "feature" }).body,
    "The checkout switched to feature during a run, so the runner ended that run. Switch back to main, and it continues.");
  assert.equal(fillNotice("pausedFinished", { branch: "main" }).body, "The run in progress finished. You can edit main now. Nothing new starts until you choose Resume.");
  assert.equal(fillNotice("branchEnded").title, "Runner ended a run");
  assert.equal(fillNotice("stuck").body, "The same steps came back three times without progress. Check its run log with /harness:background status, then start it again.");
  assert.equal(fillNotice("error").body, "It hit an error. Check its run log with /harness:background status, then start it again.");
  assert.equal(fillNotice("missing").body, "The server stopped taking runner signals, so the runner stopped. Start it again when the server is back.");
});

it("parses porcelain output, quotes Windows arguments and blocks push in the child environment", () => {
  assert.deepEqual(porcelainPaths(" M a.txt\0?? b c.txt\0R  new.txt\0old.txt\0"), ["a.txt", "b c.txt", "new.txt"]);
  assert.equal(fileList(["a", "b"]), "a, b");
  assert.equal(quoteWindowsArgument("plain"), "plain");
  assert.equal(quoteWindowsArgument("a b"), "\"a b\"");
  assert.equal(quoteWindowsArgument("x\"y"), "\"x\\\"y\"");
  assert.equal(quoteWindowsArgument("C:\\p q\\"), "\"C:\\p q\\\\\"");
  assert.equal(quoteWindowsArgument(""), "\"\"");
  const fresh = pushBlockedEnv({ PATH: "x" });
  assert.equal(fresh.GIT_CONFIG_COUNT, "1");
  assert.equal(fresh.GIT_CONFIG_KEY_0, "url.stagekeeper-push-blocked://.pushInsteadOf");
  assert.equal(fresh.GIT_CONFIG_VALUE_0, "");
  const appended = pushBlockedEnv({ GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "a", GIT_CONFIG_VALUE_0: "b" });
  assert.equal(appended.GIT_CONFIG_COUNT, "3");
  assert.equal(appended.GIT_CONFIG_KEY_0, "a");
  assert.equal(appended.GIT_CONFIG_KEY_2, "url.stagekeeper-push-blocked://.pushInsteadOf");
});

it("builds the claude arguments, the allow list and reads only init and result", () => {
  const args = runArguments({ session: "s-1", permission: "auto", settings: "/x/settings.json" });
  assert.deepEqual(args.slice(0, 4), ["-p", "/harness:watch --once --session s-1", "--permission-mode", "auto"]);
  assert.ok(args.includes("Bash(git push:*)") && args.includes("PowerShell(git push*)"));
  assert.equal(runArguments({ session: "s", permission: "allowlist", settings: "x" })[3], "acceptEdits");
  const settings = backgroundSettings({ workspaces: [{ verify: ["npm test"] }] });
  assert.ok(settings.permissions.allow.includes("mcp__harness"));
  assert.ok(settings.permissions.allow.includes("Bash(npm test)") && settings.permissions.allow.includes("PowerShell(npm test)"));
  assert.ok(settings.permissions.allow.includes("PowerShell(git commit *)"));
  assert.ok(!settings.permissions.allow.some(rule => /push/.test(rule)));
  assert.deepEqual(settings.permissions.deny, ["Bash(git push:*)", "PowerShell(git push*)"]);
  const run = {};
  readStreamLine(JSON.stringify({ type: "system", subtype: "hook_started" }), run);
  readStreamLine(JSON.stringify({ type: "system", subtype: "init", permissionMode: "auto" }), run);
  readStreamLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "secret" }] } }), run);
  readStreamLine(JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 3, terminal_reason: "completed", permission_denials: [{}, {}], result: "secret" }), run);
  readStreamLine("not json", run);
  assert.deepEqual(run, { permissionMode: "auto", result: { subtype: "success", isError: false, turns: 3, terminal: "completed", denials: 2 } });
  assert.equal(classifyRun({ exitCode: 0, result: run.result }).line, "done: 3 turns, 2 denied");
  assert.equal(classifyRun({ exitCode: 1, result: { ...run.result, isError: true, subtype: "error_max_turns" } }).line, "error: error_max_turns (completed)");
  assert.equal(classifyRun({ exitCode: 3, result: null }).line, "error: exit 3");
  assert.equal(classifyRun({ exitCode: 0, result: null, endedFor: "branch" }).outcome, "branch");
});
