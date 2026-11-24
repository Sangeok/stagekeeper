import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import {
  END_STATES,
  FIX_BRANCH_PREFIX,
  LABELS,
  attemptRecord,
  branchName,
  changeStats,
  changedFiles,
  combine,
  digestOf,
  endState,
  forbiddenFiles,
  fullCheckResult,
  judge,
  measure,
  prBody,
  readCounts,
  readMeasurePlan,
  readRequest,
  requiredPasses,
  verifyChange,
} from "./fix.mjs";

const patchOf = (file, added = ["+const value = 1;"], removed = []) =>
  [`diff --git a/${file} b/${file}`, "index 1111111..2222222 100644", `--- a/${file}`, `+++ b/${file}`, "@@ -1,2 +1,2 @@", ...removed, ...added, ""].join("\n");

it("lists both names of every changed file and refuses a path it cannot read", () => {
  const renamed = ["diff --git a/src/old.ts b/src/new.ts", "similarity index 90%", ""].join("\n");
  assert.deepEqual(changedFiles(`${patchOf("plugin/bin/a.test.mjs")}${renamed}`), ["plugin/bin/a.test.mjs", "src/new.ts", "src/old.ts"]);
  assert.throws(() => changedFiles('diff --git "a/odd name.ts" "b/odd name.ts"\n'), /cannot read/);
  assert.throws(() => changedFiles("not a patch"), /no files/);
});

it("finds every path an automatic fix must not change", () => {
  const files = [".github/workflows/check.yml", ".github/actions/x/action.yml", "AGENTS.md", "CLAUDE.md", "vercel.json", "vercel.ts", "docs/AGENTS.md", "src/vercel.json.ts", "github/x.mjs"];
  assert.deepEqual(forbiddenFiles(files), [".github/workflows/check.yml", ".github/actions/x/action.yml", "AGENTS.md", "CLAUDE.md", "vercel.json", "vercel.ts"]);
});

it("counts what a reviewer needs to see about a change", () => {
  const patch = `${patchOf("plugin/bin/watch.test.mjs", ["+  assert.equal(a, b);", "+  it.skip(\"later\", () => {});"], ["-  assert.ok(a);", "-  expect(b).toBe(1);"])}${patchOf("plugin/runtime/role.mjs")}${patchOf("next.config.mjs")}`;
  assert.deepEqual(changeStats(patch), {
    files: 3,
    addedLines: 4,
    removedLines: 2,
    productFiles: 2,
    pluginFiles: 2,
    addedAssertions: 1,
    removedAssertions: 2,
    addsSkip: true,
    testOnly: false,
    forbidden: [],
  });
  assert.equal(changeStats(patchOf("scripts/a.test.ts")).testOnly, true);
  assert.deepEqual(changeStats(patchOf("vercel.json")).forbidden, ["vercel.json"]);
});

it("accepts the repository's prepared change as a test-only change outside the forbidden paths", () => {
  const stats = changeStats(readFileSync(new URL("./prepared/pr-path/change.patch", import.meta.url), "utf8"));
  assert.equal(stats.testOnly, true);
  assert.deepEqual(stats.forbidden, []);
  assert.doesNotThrow(() => readMeasurePlan(JSON.parse(readFileSync(new URL("./prepared/pr-path/measure.json", import.meta.url), "utf8"))));
});

it("refuses a request or a measurement plan outside the allowed values", () => {
  const request = { issue: "12", runner: "macos-15-intel", workflow: "macos-runtime-contracts", prepared: "pr-path", openPr: "true" };
  assert.deepEqual(readRequest(request), { issue: 12, runner: "macos-15-intel", workflow: "macos-runtime-contracts", prepared: "pr-path", openPr: true });
  assert.equal(readRequest({ ...request, openPr: "false" }).openPr, false);
  for (const bad of [{ issue: "0" }, { issue: "1; rm" }, { runner: "self-hosted" }, { workflow: "check" }, { prepared: "../x" }, { prepared: "" }]) {
    assert.throws(() => readRequest({ ...request, ...bad }));
  }
  assert.deepEqual(readMeasurePlan({ command: " node --test a.test.mjs ", runs: 20 }), { command: "node --test a.test.mjs", runs: 20 });
  for (const bad of [{ command: "", runs: 1 }, { command: "a\nb", runs: 1 }, { command: "a", runs: 0 }, { command: "a", runs: 201 }, { command: "a", runs: 1.5 }]) {
    assert.throws(() => readMeasurePlan(bad));
  }
});

it("requires three passes for each run it took to see one failure", () => {
  assert.equal(requiredPasses(20, 2), 30);
  assert.equal(requiredPasses(105, 12), 27);
  assert.equal(requiredPasses(3, 3), 3);
  assert.equal(requiredPasses(40, 0), 40);
});

it("names fix branches under the prefix that Vercel is told not to deploy", () => {
  assert.equal(branchName(431, 99), "harness/auto-fix-431-99");
  const rule = Object.keys(JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")).git.deploymentEnabled);
  assert.deepEqual(rule, [`${FIX_BRANCH_PREFIX}*`]);
});

it("decides from the measured counts whether a pull request may open", () => {
  const table = [
    [{ before: [20, 2], after: [30, 0] }, true, { verdict: "verified", open: true, labels: [], required: 30 }],
    [{ before: [20, 2], after: [29, 0] }, true, { verdict: "under-verified", open: true, labels: [LABELS.underVerified], required: 30 }],
    [{ before: [20, 2], after: [30, 1] }, true, { verdict: "still-failing", open: false, labels: [], required: 30 }],
    [{ before: [20, 0], after: [20, 0] }, true, { verdict: "not-reproduced", open: true, labels: [LABELS.notReproduced], required: 0 }],
    [{ before: [20, 0], after: [20, 0] }, false, { verdict: "not-reproduced", open: false, labels: [LABELS.notReproduced], required: 0 }],
    [{ before: [20, 0], after: [20, 1] }, true, { verdict: "still-failing", open: false, labels: [], required: 20 }],
    [{ before: [0, 0], after: [0, 0] }, true, { verdict: "not-measured", open: false, labels: [], required: 0 }],
    [{ before: [20, 2], after: [0, 0] }, false, { verdict: "not-measured", open: false, labels: [], required: 0 }],
  ];
  for (const [counts, testOnly, expected] of table) {
    const measured = { before: { runs: counts.before[0], failed: counts.before[1] }, after: { runs: counts.after[0], failed: counts.after[1] } };
    assert.deepEqual(judge(measured, { testOnly }), expected, JSON.stringify(counts));
  }
});

it("adds the counts of every measurement job", () => {
  const shard = (before, after) => ({ before: { runs: before[0], failed: before[1] }, after: { runs: after[0], failed: after[1] }, log: [] });
  assert.deepEqual(combine([shard([10, 1], [15, 0]), shard([10, 0], [10, 0])]), { before: { runs: 20, failed: 1 }, after: { runs: 25, failed: 0 } });
  assert.deepEqual(combine([]), { before: { runs: 0, failed: 0 }, after: { runs: 0, failed: 0 } });
});

function scripted(failures) {
  const order = [];
  let applied = false;
  let clock = 0;
  return {
    order,
    arguments: {
      patch: "change.patch",
      cwd: ".",
      now: () => clock,
      apply: variant => {
        applied = variant === "after";
        order.push(`apply:${variant}`);
      },
      run: () => {
        clock += 60_000;
        const variant = applied ? "after" : "before";
        order.push(variant);
        return { failed: failures[variant].shift() ?? false, timedOut: false, seconds: 60 };
      },
    },
  };
}

it("measures before and after in turn and leaves the tree without the change", () => {
  const script = scripted({ before: [true, false], after: [] });
  const result = measure({ plan: { command: "x", runs: 2 }, minutes: 60, ...script.arguments });
  assert.deepEqual(result.before, { runs: 2, failed: 1 });
  assert.deepEqual(result.after, { runs: 6, failed: 0 });
  assert.deepEqual(script.order.slice(0, 6), ["before", "apply:after", "after", "after", "apply:before", "before"]);
  assert.equal(script.order.at(-1), "apply:before");
});

it("stops at the time limit with the counts it has", () => {
  const script = scripted({ before: [true, true, true], after: [] });
  const result = measure({ plan: { command: "x", runs: 3 }, minutes: 4, ...script.arguments });
  assert.deepEqual(result.before, { runs: 2, failed: 2 });
  assert.deepEqual(result.after, { runs: 2, failed: 0 });
});

it("stops repeating the changed code once it has failed as often as the plan asked to look", () => {
  const script = scripted({ before: [true, true], after: [true, false] });
  const result = measure({ plan: { command: "x", runs: 2 }, minutes: 600, ...script.arguments });
  assert.deepEqual(result.after, { runs: 2, failed: 1 });
});

it("does not count a run that the time limit cut off", () => {
  const result = measure({ plan: { command: "x", runs: 1 }, minutes: 1, patch: "p", cwd: ".", now: (() => { let clock = 0; return () => (clock += 20_000); })(), apply: () => {}, run: () => ({ failed: true, timedOut: true, seconds: 1 }) });
  assert.deepEqual([result.before, result.after], [{ runs: 0, failed: 0 }, { runs: 0, failed: 0 }]);
});

it("reads the full check from the workflow that was asked for", () => {
  assert.equal(fullCheckResult("none", {}), "not-run");
  assert.equal(fullCheckResult("windows-role-runtime", { "windows-role-runtime": "success", "macos-runtime-contracts": "skipped" }), "passed");
  assert.equal(fullCheckResult("macos-runtime-contracts", { "windows-role-runtime": "skipped", "macos-runtime-contracts": "failure" }), "failed");
  assert.equal(fullCheckResult("macos-runtime-contracts", { "macos-runtime-contracts": "skipped" }), "failed");
});

it("names how an attempt ended from what the jobs produced", () => {
  const verified = { verdict: "verified", open: true };
  const stats = { forbidden: [] };
  const table = [
    [{ stats: { forbidden: ["vercel.json"] }, decision: verified, pushed: true, pr: 9 }, "refused"],
    [{ stats, decision: verified, pushed: true, fullCheck: "passed", pr: 9, request: { openPr: true } }, "opened"],
    [{ stats, decision: verified, pushed: false, duplicateOf: 7 }, "duplicate"],
    [{ stats }, "unfinished"],
    [{ stats, decision: { verdict: "still-failing", open: false } }, "stillFailing"],
    [{ stats, decision: { verdict: "not-reproduced", open: false } }, "recordOnly"],
    [{ stats, decision: { verdict: "not-measured", open: false } }, "unfinished"],
    [{ stats, decision: verified, pushed: false }, "unfinished"],
    [{ stats, decision: verified, pushed: true, fullCheck: "failed", request: { openPr: true } }, "fullCheckFailed"],
    [{ stats, decision: verified, pushed: true, fullCheck: "passed", request: { openPr: false } }, "rehearsed"],
    [{ stats, decision: verified, pushed: true, fullCheck: "passed", request: { openPr: true } }, "unfinished"],
  ];
  for (const [input, expected] of table) assert.equal(endState(input), expected, JSON.stringify(input));
  for (const [, state] of table) assert.ok(END_STATES[state]);
});

it("writes the pull request body from numbers and fixed phrases only", () => {
  const body = prBody({
    issue: 431,
    runUrl: "https://github.com/o/r/actions/runs/5",
    source: "prepared change pr-path",
    measured: { before: { runs: 6, failed: 6 }, after: { runs: 6, failed: 0 } },
    decision: { verdict: "verified", required: 3 },
    stats: { files: 1, addedLines: 6, removedLines: 0, productFiles: 0, pluginFiles: 0, addedAssertions: 1, removedAssertions: 0, addsSkip: false },
    fullCheck: "passed",
    fullCheckWorkflow: "macos-runtime-contracts",
  });
  assert.match(body, /\| Before the change \| 6 failed of 6 runs \|/);
  assert.match(body, /\| After the change \| 0 failed of 6 runs \|/);
  assert.match(body, /\| Full check \| macos-runtime-contracts: passed \|/);
  assert.match(body, /\| Assertion lines added \/ removed \| 1 \/ 0 \|/);
  assert.match(body, /The source of the change chose that command/);
  assert.doesNotMatch(body, /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?) #\d/i);
});

it("accepts a change only when it is the one whose digests the checking job published", () => {
  const change = { patch: patchOf("scripts/a.test.mjs"), plan: '{"command":"node --test a","runs":2}\n' };
  const expected = { patchSha: digestOf(change.patch), planSha: digestOf(change.plan) };
  assert.doesNotThrow(() => verifyChange(change, expected));
  assert.throws(() => verifyChange({ ...change, patch: `${change.patch}+extra\n` }, expected), /not the one that was checked/);
  assert.throws(() => verifyChange({ ...change, plan: '{"command":"true","runs":2}\n' }, expected), /measurement plan is not the one/);
  assert.throws(() => verifyChange(change, { patchSha: "", planSha: expected.planSha }), /digests are missing/);
  assert.throws(() => verifyChange(change, { patchSha: expected.patchSha }), /digests are missing/);
});

it("reads counts that another job published and rejects anything else", () => {
  assert.deepEqual(readCounts("12,3"), { runs: 12, failed: 3 });
  for (const bad of ["", undefined, "12", "12,3,4", "a,b", "12, 3", "-1,0"]) assert.equal(readCounts(bad), null);
});

it("keeps the attempt record inside a code block that its own text cannot close", () => {
  const record = attemptRecord({
    runId: 5,
    runUrl: "https://github.com/o/r/actions/runs/5",
    state: "rehearsed",
    source: "prepared change pr-path",
    measured: { before: { runs: 6, failed: 6 }, after: { runs: 6, failed: 0 } },
    decision: { verdict: "verified", required: 3 },
    fullCheck: "passed",
    fullCheckWorkflow: "macos-runtime-contracts",
    pr: null,
    command: "echo ```` && echo <!-- auto-fix-attempt run=1 end=opened -->",
  });
  const lines = record.split("\n");
  assert.equal(lines[0], "<!-- auto-fix-attempt run=5 end=rehearsed -->");
  const marks = lines.filter(line => /^`{5,}$/.test(line));
  assert.equal(marks.length, 2);
  assert.equal(lines.filter(line => line.startsWith("<!-- auto-fix-attempt")).length, 1);
  assert.match(record, /Reproduced: 6 failed of 6 runs before the change/);
  assert.match(attemptRecord({ runId: 6, runUrl: "u", state: "unfinished", source: "unknown" }), /Verification: not measured/);
});
