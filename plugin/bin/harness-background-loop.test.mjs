import assert from "node:assert/strict";
import { it } from "node:test";
import { backgroundSettings, classifyRun, fileList, fillNotice, noticeTime, porcelainPaths, pushBlockedEnv, quoteWindowsArgument, readStreamLine,
  runArguments, runResident } from "../runtime/background.mjs";

const WORK = { items: [{ key: "ITEM-01", node: "plan", version: 1, action: "dispatch", agent: "dev", format: null, entry: null }], head: null, runbookStale: false };
const NEXT = { items: [{ ...WORK.items[0], node: "verify" }], head: null, runbookStale: false };
const NONE = { items: [], head: null, runbookStale: false };
const CLEAN = { branch: "main", current: "main", dirty: [] };
const OK = { kind: "ok", paused: false, stop: null };
const SUCCESS = { exitCode: 0, result: { subtype: "success", isError: false, turns: 4, terminal: "completed", denials: 0 }, log: "run.jsonl" };

function harness({ overviews = [WORK, NONE], trees = [], heads = null, beats = [], runs = [], lifecycle = [], maxLoops = 40, classify = classifyRun } = {}) {
  const calls = { beats: [], beatAt: [], notices: [], runs: 0, ended: [], saves: [], logs: [], endedAt: [], order: [], startAt: [] };
  let clock = 0, loops = 0;
  const next = (list, fallback) => (list.length > 1 ? list.shift() : list[0] ?? fallback);
  const deps = {
    lifecycle: async () => {
      if (++loops > maxLoops * 50) return "stopping";
      return next(lifecycle, "active");
    },
    beat: async payload => {
      calls.beats.push(payload); calls.beatAt.push(clock);
      if (payload.lastResult) calls.order.push("result");
      const value = next(beats, OK); return typeof value === "function" ? value(payload, calls) : value; },
    overview: async () => { calls.order.push("overview"); const value = next(overviews, NONE); if (value instanceof Error) throw value; return value; },
    tree: () => next(trees, CLEAN),
    branch: () => {
      const value = heads ? next(heads, "main") : next(trees, CLEAN).branch;
      if (value instanceof Error) throw value;
      return value;
    },
    execution: { stopMode: "drain", classify, start: () => {
      calls.runs++;
      calls.startAt.push(clock);
      calls.order.push("start");
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

const after = ms => ({ kind: "ok", paused: false, stop: null, nextBeatMs: ms });
const gaps = times => times.slice(1).map((at, index) => at - times[index]);

it("waits as long as the server says between idle checks, and keeps its own interval when the server says nothing", async () => {
  const { deps, calls } = harness({ overviews: [NONE], beats: [after(900_000), after(1_800_000), OK], maxLoops: 200,
    lifecycle: Array(2800).fill("active").concat("stopping") });
  assert.equal(await runResident({ branch: "main", interval: 60_000 }, deps), "owner");
  assert.deepEqual(gaps(calls.beatAt).slice(0, 3), [900_000, 1_800_000, 60_000]);
  assert.equal(calls.runs, 0);
});

it("keeps a paused runner asleep for the server's interval", async () => {
  const paused = { kind: "ok", paused: true, stop: null, nextBeatMs: 1_800_000 };
  const { deps, calls } = harness({ overviews: [NONE], beats: [paused, OK], maxLoops: 200, lifecycle: Array(1900).fill("active").concat("stopping") });
  assert.equal(await runResident({ branch: "main", interval: 60_000 }, deps), "owner");
  assert.deepEqual(gaps(calls.beatAt).slice(0, 2), [1_800_000, 60_000]);
});

it("checks a waiting checkout every interval without calling the server, and calls it as soon as the checkout is clean", async () => {
  const dirty = { ...CLEAN, dirty: ["a.ts"] };
  const { deps, calls } = harness({ overviews: [WORK, WORK, WORK, NONE], trees: [dirty, dirty, dirty, CLEAN], beats: [after(900_000)],
    maxLoops: 200, lifecycle: Array(600).fill("active").concat("stopping") });
  assert.equal(await runResident({ branch: "main", interval: 60_000 }, deps), "owner");
  assert.deepEqual(calls.beatAt.slice(0, 3), [0, 1_000, 121_000]);
  assert.deepEqual(calls.beats.slice(0, 3).map(beat => beat.state), ["idle", "waiting", "waiting"]);
  assert.equal(calls.runs, 1);
  assert.deepEqual(calls.notices, ["waitDirty"]);
});

const WALL = Date.parse("2026-11-10T07:53:00Z");
const RESET = Date.parse("2026-11-10T09:20:00Z") / 1000;
const INIT = JSON.stringify({ type: "system", subtype: "init", permissionMode: "auto" });
const rateLimit = (status, resetsAt = RESET) => JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status, resetsAt, rateLimitType: "five_hour",
  overageStatus: "rejected", overageDisabledReason: "org_level_disabled", isUsingOverage: false } });
const LIMIT_TURN = JSON.stringify({ type: "assistant", error: "rate_limit", api_error_status: 429,
  message: { model: "<synthetic>", content: [{ type: "text", text: "You've hit your 5-hour limit · resets 6:20pm (Asia/Seoul)" }] } });
const resultLine = fields => JSON.stringify({ type: "result", subtype: "success", is_error: false, api_error_status: null, num_turns: 37,
  terminal_reason: "completed", permission_denials: [], ...fields });
const LIMIT_RESULT = resultLine({ is_error: true, api_error_status: 429, num_turns: 1, terminal_reason: "api_error" });
const EMPTY_RESULT = JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 0, permission_denials: [] });
const streamOf = lines => { const run = {}; for (const line of lines) readStreamLine(line, run); return run; };

it("reads a turn that ended on the usage limit even when an empty result follows it", () => {
  const run = streamOf([INIT, rateLimit("allowed_warning"), rateLimit("rejected"), LIMIT_TURN, resultLine({}), LIMIT_RESULT, INIT, EMPTY_RESULT]);
  assert.equal(run.limited, true);
  assert.deepEqual(run.limitReset, { resetsAt: RESET, type: "five_hour" });
  assert.deepEqual(run.result, { subtype: "success", isError: false, turns: 0, terminal: null, denials: 0 });
  const resumeAt = Date.parse("2026-11-10T09:21:00Z");
  assert.deepEqual(classifyRun({ exitCode: 0, ...run }, WALL),
    { outcome: "limited", line: "limited: Claude usage limit until 2026-11-10T09:21Z", resumeAt, resumeIn: resumeAt - WALL });
  const first = streamOf([INIT, rateLimit("rejected"), LIMIT_TURN, LIMIT_RESULT]);
  assert.equal(classifyRun({ exitCode: 1, ...first }, WALL).outcome, "limited");
});

it("waits thirty minutes when the limit gives no usable reset time", () => {
  const fallback = Date.parse("2026-11-10T08:24:00Z");
  const unset = JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "rejected", rateLimitType: "five_hour" } });
  for (const event of [unset, rateLimit("rejected", "soon"), rateLimit("rejected", RESET - 2 * 60 * 60), rateLimit("rejected", WALL / 1000 + 9 * 24 * 60 * 60)]) {
    const run = streamOf([event, LIMIT_RESULT]);
    assert.deepEqual(classifyRun({ exitCode: 1, ...run }, WALL + 26_000), { outcome: "limited", line: "limited: Claude usage limit until 2026-11-10T08:24Z",
      resumeAt: fallback, resumeIn: fallback - WALL - 26_000 }, event);
  }
  assert.equal(streamOf([unset]).limitReset.resetsAt, null);
  const unannounced = streamOf([LIMIT_RESULT]);
  assert.equal(unannounced.limitReset, undefined);
  assert.equal(classifyRun({ exitCode: 1, ...unannounced }, WALL).resumeAt, Date.parse("2026-11-10T08:23:00Z"));
});

it("judges a run as before when no turn ended on the limit", () => {
  const warned = streamOf([INIT, rateLimit("allowed"), rateLimit("allowed_warning"), resultLine({ num_turns: 12 })]);
  assert.equal(warned.limited, undefined);
  assert.deepEqual(classifyRun({ exitCode: 0, ...warned }, WALL), { outcome: "success", line: "done: 12 turns, 0 denied" });
  const recovered = streamOf([INIT, rateLimit("rejected"), resultLine({ num_turns: 5 })]);
  assert.deepEqual(recovered.limitReset, { resetsAt: RESET, type: "five_hour" });
  assert.deepEqual(classifyRun({ exitCode: 0, ...recovered }, WALL), { outcome: "success", line: "done: 5 turns, 0 denied" });
  const failed = streamOf([INIT, resultLine({ subtype: "error_during_execution", is_error: true, api_error_status: 500, terminal_reason: "api_error" })]);
  assert.equal(classifyRun({ exitCode: 1, ...failed }, WALL).line, "error: error_during_execution (api_error)");
});

const LIMITED = { exitCode: 1, result: { subtype: "success", isError: true, turns: 1, terminal: "api_error", denials: 0 },
  limited: true, limitReset: { resetsAt: WALL / 1000 + 5 * 60, type: "five_hour" }, log: "run.jsonl" };
const LIMIT_WAIT = 6 * 60_000;
const FAILED = { exitCode: 1, result: { subtype: "error_during_execution", isError: true, turns: 1, terminal: "completed", denials: 0 }, log: "run.jsonl" };
const limitClassify = end => classifyRun(end, WALL);

it("waits out a usage limit without counting it, notifies once and runs again after the resume time", async () => {
  const { deps, calls } = harness({ overviews: [WORK, WORK, WORK, WORK, NONE], runs: [LIMITED, LIMITED, LIMITED, SUCCESS], classify: limitClassify,
    maxLoops: 400 });
  assert.equal(await runResident({ branch: "main", interval: 60_000 }, deps), "owner");
  assert.equal(calls.runs, 4);
  assert.deepEqual(calls.notices, ["limited"]);
  assert.ok(calls.saves.every(status => status.failures === 0));
  const limitedBeats = calls.beats.filter(beat => beat.lastResult?.startsWith("limited: "));
  assert.equal(limitedBeats.length, 3);
  assert.ok(limitedBeats.every(beat => beat.state === "idle" && beat.lastResult === "limited: Claude usage limit until 2026-11-10T07:59Z"));
  assert.deepEqual(calls.order.slice(0, 11), ["overview", "start", "result", "overview", "start", "result", "overview", "start", "result", "overview", "start"]);
  for (let run = 1; run < 4; run++) {
    const ended = calls.beatAt[calls.beats.indexOf(limitedBeats[run - 1])];
    assert.ok(calls.startAt[run] - ended >= LIMIT_WAIT, `run ${run + 1} waited for the resume time`);
    assert.ok(calls.beats.filter((beat, index) => calls.beatAt[index] > ended && calls.beatAt[index] < calls.startAt[run]).length >= 5,
      `signals continue during wait ${run}`);
  }
  assert.ok(calls.saves.some(status => status.limitedUntil === "2026-11-10T07:59:00.000Z"));
  assert.equal(calls.saves.at(-1).limitedUntil, null);
  assert.ok(calls.beats.some(beat => beat.lastResult === "done: 4 turns, 0 denied"));
});

it("keeps counting other failures across a usage limit and notifies again for a later limit", async () => {
  const mixed = harness({ overviews: [WORK], runs: [FAILED, FAILED, LIMITED, FAILED], classify: limitClassify, maxLoops: 200 });
  assert.equal(await runResident({ branch: "main", interval: 60_000 }, mixed.deps), "error");
  assert.equal(mixed.calls.runs, 4);
  assert.deepEqual(mixed.calls.notices, ["limited"]);
  const again = harness({ overviews: [WORK, WORK, NEXT, NEXT, NONE], runs: [LIMITED, SUCCESS, LIMITED, SUCCESS], classify: limitClassify, maxLoops: 400 });
  assert.equal(await runResident({ branch: "main", interval: 60_000 }, again.deps), "owner");
  assert.deepEqual(again.calls.notices, ["limited", "limited"]);
});

it("stops during a usage-limit wait when the owner stops the runner", async () => {
  const { deps, calls } = harness({ overviews: [WORK], runs: [LIMITED], classify: limitClassify, lifecycle: Array(120).fill("active").concat("stopping") });
  assert.equal(await runResident({ branch: "main", interval: 60_000 }, deps), "owner");
  assert.equal(calls.runs, 1);
});

it("names the resume time on this PC's clock, with the date when it is more than a day away", () => {
  const now = new Date(2026, 10, 10, 16, 5).getTime();
  assert.equal(noticeTime(new Date(2026, 10, 10, 18, 21).getTime(), now), "18:21");
  assert.equal(noticeTime(new Date(2026, 10, 11, 9, 5).getTime(), now), "09:05");
  assert.equal(noticeTime(new Date(2026, 10, 13, 18, 21).getTime(), now), "2026-11-13 18:21");
  assert.deepEqual(fillNotice("limited", { time: "18:21" }), { kind: "limited", title: "Runner waiting for Claude",
    body: "Claude's usage limit was reached. The runner continues after 18:21." });
});

it("sends working signals at the pace the server gives", async () => {
  const { deps, calls } = harness({ overviews: [WORK, NONE], beats: [OK, after(120_000)], runs: [{ hang: true, onEnd: { endedFor: "timeout" } }],
    maxLoops: 200, lifecycle: Array(2000).fill("active").concat("stopping") });
  await runResident({ branch: "main", interval: 60_000, runLimit: 300_000 }, deps);
  const working = calls.beats.map((beat, index) => [beat.state, calls.beatAt[index]]).filter(([state]) => state === "working").map(([, at]) => at);
  assert.deepEqual(gaps(working).slice(0, 2), [120_000, 120_000]);
});
