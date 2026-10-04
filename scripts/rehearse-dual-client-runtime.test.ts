import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { buildReport, capabilityProbe, isolatedModelEnvironment, main, overallResult, parseArguments, parseReport, reportLocation, runCapability, runAcceptance, writeReport } from "./rehearse-dual-client-runtime";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const REVISION = "a".repeat(40);
const AT = "2026-10-03T12:00:00+09:00";
const PROPOSAL = "docs/proposals/completed/2026-10-04-codex-dual-client-support.md";
const FOLLOW_UP = "docs/proposals/active/codex-dual-client-runtime-follow-ups.md";

it("independent model environment forwards OS keys without credentials or parent context", () => {
  const environment = isolatedModelEnvironment({ Path: "fixture path", SystemRoot: "fixture system", USERPROFILE: "fixture profile", HARNESS_TOKEN: "private", HARNESS_OWNER_TOKEN: "private", OPENAI_API_KEY: "private", CODEX_THREAD_ID: "parent", CODEX_SESSION_ID: "parent", NODE_OPTIONS: "untrusted" });
  assert.deepEqual(environment, { Path: "fixture path", SystemRoot: "fixture system", USERPROFILE: "fixture profile" });
});

it("strict prototype separates repository/scratch without mixing legacy sandbox or escalation", () => {
  const root = path.resolve(tmpdir(), "stagekeeper-dual-prototype with spaces");
  const result = capabilityProbe(root, "strict-profile");
  assert.equal(result.args.includes("--sandbox"), false);
  assert.equal(result.args.includes("--approve-for-me"), false);
  assert.ok(result.args.includes("--strict-config"));
  const rules = result.args.find(value => value.startsWith("permissions.c0-verifier.filesystem="));
  assert.ok(rules?.includes(JSON.stringify(result.repository.split(path.sep).join("/")) + '="read"'));
  assert.ok(rules?.includes(JSON.stringify(result.scratch.split(path.sep).join("/")) + '="write"'));
  assert.ok(result.args.some(value => value.includes("sandbox_approval=false")));
  assert.ok(result.prompt.includes("BLOCKED, not successful filesystem isolation"));
  assert.equal(result.prompt.includes("C0_PARENT_CANARY"), false);
});

function fixture(t: TestContext): { repo: string; report: string; body: string } {
  const repo = mkdtempSync(path.join(tmpdir(), "stagekeeper-dual-report-test-"));
  t.after(() => {
    assert.equal(path.dirname(repo), path.resolve(tmpdir()));
    assert.ok(path.basename(repo).startsWith("stagekeeper-dual-report-test-"));
    rmSync(repo, { recursive: true, force: true });
  });
  for (const directory of ["docs/test-reports/active", "docs/test-reports/completed", "docs/proposals/active", "docs/proposals/completed"]) mkdirSync(path.join(repo, directory), { recursive: true });
  for (const name of [PROPOSAL, FOLLOW_UP, "docs/test-reports/README.md", "docs/test-reports/template.md"]) writeFileSync(path.join(repo, name), "Fixture reference\n");
  const report = path.join(repo, "docs/test-reports/active/dual-client-runtime-report.md");
  const body = buildReport({ observations: [{ method: "native isolation", expected: "actual permission evidence", detail: "NOT RUN: authentication prerequisite", verdict: "NOT RUN" }], revision: REVISION, at: AT, reportPath: report, repoRoot: repo });
  return { repo, report, body };
}

it("rejects invalid/duplicate/conflicting/unimplemented phases before side effects", () => {
  const invalid = [[], ["--phase", "unknown"], ["--root"], ["--x", "y"], ["--validate-report-only", "--report", "a", "--root", "b"], ["--report", "a", "--report", "b"], ["--phase", "acceptance", "--root", "relative", "--report", "a"], ["--phase", "watch", "--root", path.resolve(tmpdir()), "--report", "a"]];
  for (const args of invalid) assert.throws(() => parseArguments(args));
  assert.deepEqual(parseArguments(["--report", "a", "--validate-report-only"]), { mode: "validate", report: "a" });
  assert.equal(parseArguments(["--phase", "acceptance", "--root", path.resolve(tmpdir()), "--report", "a"]).mode, "acceptance");
});

it("acceptance refuses missing/same/production DB targets before any external command", async t => {
  const f = fixture(t), root = path.join(f.repo, "checkout"); mkdirSync(root);
  for (const environment of [{}, { TEST_DATABASE_URL: "postgresql://localhost/production" }, { DATABASE_URL: "postgresql://localhost/stagekeeper_test_x", TEST_DATABASE_URL: "postgresql://127.0.0.1/stagekeeper_test_x" }]) {
    let calls = 0;
    await assert.rejects(runAcceptance(root, f.repo, async () => { calls++; return { code: 0, stdout: "", stderr: "" }; }, environment));
    assert.equal(calls, 0);
  }
});

it("acceptance runs only protected DB contracts and keeps actual model/browser gates unexecuted", async t => {
  const f = fixture(t), root = path.join(f.repo, "checkout"); mkdirSync(path.join(root, "docs/harness"), { recursive: true });
  writeFileSync(path.join(root, "harness.json"), JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main", slug: "o-r" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] }));
  writeFileSync(path.join(root, "CLAUDE.md"), "<!-- harness:runbook:start -->\nFixture\n");
  writeFileSync(path.join(root, "docs/harness/codex-package.json"), JSON.stringify({ client: "codex", protocol: "harness-runtime-v1", runbook: "a".repeat(12) }));
  const calls: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const observations = await runAcceptance(root, f.repo, async (_command, args, options) => {
    calls.push({ args, env: options.env });
    return { code: 0, stdout: calls.length === 1 ? root : "# tests 6\n# pass 6\nparent-secret-unretained", stderr: "" };
  }, { TEST_DATABASE_URL: "postgresql://localhost/stagekeeper_test_dual", DATABASE_URL: "postgresql://localhost/production", HARNESS_OWNER_TOKEN: "parent-secret", OPENAI_API_KEY: "parent-secret" });
  assert.equal(calls.length, 3); assert.ok(calls[1].args.includes("deploy")); assert.ok(calls[2].args.includes("tests/server/integration/client-runtime.test.ts"));
  assert.equal(calls[2].env.HARNESS_OWNER_TOKEN, undefined); assert.equal(calls[2].env.OPENAI_API_KEY, undefined);
  assert.equal(calls[2].env.DATABASE_URL, "postgresql://localhost/stagekeeper_test_dual");
  assert.deepEqual(observations.map(row => row.verdict), ["PASS", "PASS", "NOT RUN"]);
  const appended = buildReport({ previous: f.body, observations, phase: "acceptance", revision: REVISION, at: AT, reportPath: f.report, repoRoot: f.repo });
  const parsed = parseReport(appended, f.report, f.repo);
  assert.equal(parsed.tests[0].reference, "R1"); assert.equal(parsed.tests.at(-1)?.reference, "R2"); assert.equal(overallResult(parsed.tests), "blocked"); assert.doesNotMatch(appended, /parent-secret-unretained/);
  assert.match(parsed.sections.get("Scope and Criteria")!, /earlier C0 exclusions describe their historical scope/);
  const acceptanceBody = buildReport({ observations, phase: "acceptance", revision: REVISION, at: AT, reportPath: f.report, repoRoot: f.repo });
  const firstAcceptance = parseReport(acceptanceBody, f.report, f.repo);
  assert.match(firstAcceptance.sections.get("Scope and Criteria")!, /Included: C3 isolated DB contracts/);
  assert.match(firstAcceptance.sections.get("Test Data and Cleanup")!, /migrations affect only the validated test DB/);
  assert.doesNotMatch(firstAcceptance.sections.get("Scope and Criteria")!, /Excluded:.*C3 acceptance/);
  const laterCapability = parseReport(buildReport({ previous: acceptanceBody, observations: [{ method: "capability", expected: "history", detail: "bounded fixture", verdict: "PASS" }], revision: REVISION, at: AT, reportPath: f.report, repoRoot: f.repo }), f.report, f.repo);
  assert.equal(laterCapability.tests[0].reference, "R2"); assert.equal(laterCapability.tests.at(-1)?.reference, "R1");
});

it("validation-only imports and reads a valid blocked report without file or network writes", async t => {
  const { repo, report, body } = fixture(t);
  writeFileSync(report, body);
  await main(["--validate-report-only", "--report", report], repo);
  assert.equal(readFileSync(report, "utf8"), body);
  assert.equal(existsSync(report + ".tmp"), false);
});

it("preserves active null result and required NOT RUN; structure PASS is not product PASS", t => {
  const { repo, report, body } = fixture(t);
  const parsed = parseReport(body, report, repo);
  assert.equal(parsed.metadata.result, null);
  assert.equal(parsed.metadata.stage, "blocked");
  assert.equal(parsed.tests[0].verdict, "NOT RUN");
  assert.equal(overallResult(parsed.tests), "blocked");
});

it("uses fail > blocked > pass and ignores informational failure in the overall result", () => {
  assert.equal(overallResult([{ gate: "required", verdict: "NOT RUN" }, { gate: "required", verdict: "FAIL" }]), "fail");
  assert.equal(overallResult([{ gate: "required", verdict: "NOT RUN" }]), "blocked");
  assert.equal(overallResult([{ gate: "required", verdict: "PASS" }, { gate: "informational", verdict: "FAIL" }]), "pass");
  assert.throws(() => overallResult([{ gate: "informational", verdict: "PASS" }]));
});

it("append preserves historical rows/evidence and records each new revision separately", t => {
  const { repo, report, body } = fixture(t);
  const appended = buildReport({ previous: body, observations: [{ method: "second execution", expected: "current revision", detail: "new observed fixture", verdict: "PASS" }], revision: "b".repeat(40), at: AT, reportPath: report, repoRoot: repo });
  const previous = parseReport(body, report, repo), current = parseReport(appended, report, repo);
  assert.deepEqual(current.tests[0], previous.tests[0]);
  assert.equal(current.tests.length, 2);
  assert.ok(current.evidenceIds.has("E1") && current.evidenceIds.has("E2"));
  assert.ok(appended.includes(`revision ${REVISION}`));
  assert.ok(appended.includes(`revision ${"b".repeat(40)}`));
  assert.equal(current.metadata.result, null);
  assert.equal(overallResult(current.tests), "blocked");
});

it("appends to a Windows CRLF campaign without damaging its evidence registry", t => {
  const { repo, report, body } = fixture(t);
  const previous = body.replace(/\n/g, "\r\n");
  writeFileSync(report, previous);
  writeReport(report, saved => buildReport({ previous: saved, observations: [{ method: "CRLF rerun", expected: "history retained", detail: "Observed current fixture", verdict: "PASS" }], revision: REVISION, at: AT, reportPath: report, repoRoot: repo }), { repoRoot: repo });
  const current = parseReport(readFileSync(report, "utf8"), report, repo);
  assert.deepEqual(current.tests[0], parseReport(previous, report, repo).tests[0]);
  assert.equal(current.tests.length, 2);
  assert.deepEqual([...current.evidenceIds], ["E1", "E2"]);
  assert.equal(current.metadata.result, null);
  assert.equal(overallResult(current.tests), "blocked");
  assert.equal(existsSync(report + ".tmp"), false);
});

it("accepts planned null fields/empty lists but not missing keys", t => {
  const { repo, report, body } = fixture(t);
  const planned = body.replace('stage: "blocked"', 'stage: "planned"').replace(/^(report-kind|last-executed-at|tested-revision|primary-area|test-summary): .+$/gm, "$1: null").replace(/^(test-levels|test-tools|owners|observed-environments): .+$/gm, "$1: []");
  assert.equal(parseReport(planned, report, repo).metadata.stage, "planned");
  assert.throws(() => parseReport(planned.replace(/^owners:.*\n/m, ""), report, repo));
});

it("rejects duplicate/unknown/nested metadata and arbitrary YAML", t => {
  const { repo, report, body } = fixture(t);
  for (const mutated of [body.replace('status: "active"', 'status: "active"\nstatus: "active"'), body.replace('status: "active"', 'status: "active"\nextra: true'), body.replace('owners: ["user:Sangeok"]', "owners:\n  - user:Sangeok"), body.replace('status: "active"', "status: 'active'")]) assert.throws(() => parseReport(mutated, report, repo));
});

it("rejects invalid enum, revision, timezone, date, owner and environment metadata", t => {
  const { repo, report, body } = fixture(t);
  for (const [old, replacement] of [['stage: "blocked"', 'stage: "done"'], [`tested-revision: "${REVISION}"`, 'tested-revision: "short"'], [`last-executed-at: "${AT}"`, 'last-executed-at: "2026-10-03T12:00:00"'], [`last-executed-at: "${AT}"`, 'last-executed-at: "2026-02-30T12:00:00Z"'], ['created-at: "2026-10-03"', 'created-at: "2026-02-30"'], ['owners: ["user:Sangeok"]', 'owners: ["unknown"]'], ["local | disposable CLI/loopback MCP", "local only"]]) assert.throws(() => parseReport(body.replace(old, replacement), report, repo));
});

it("rejects missing/duplicate standard sections and foreign campaign bodies", t => {
  const { repo, report, body } = fixture(t);
  for (const altered of [body.replace("## Test Target", "## Other Target"), body + "\n## Test Target\nDuplicate\n", body.replace("<!-- stagekeeper:dual-client-runtime:v1 -->", "Other campaign")]) assert.throws(() => parseReport(altered, report, repo));
});

it("rejects broken criteria, execution gates/verdicts and unresolved evidence references", t => {
  const { repo, report, body } = fixture(t);
  for (const changed of [body.replace("| T1 | R1 |", "| T1 | R2 |"), body.replace("| required |", "| optional |"), body.replace("| NOT RUN |", "| SUCCESS |"), body.replace("[E1]", "[E99]"), body.replace("| E1 | C0", "| E9 | C0"), body.replace("| R1 | docs/", "| invalid | docs/")]) assert.throws(() => parseReport(changed, report, repo));
});

it("checks independent command rows when deriving result and coverage", t => {
  const { repo, report, body } = fixture(t);
  const command = "| C1 | R1/T1 | required | check | exit 0 | [E1] | FAIL |\n\n";
  const failed = body.replace("## Evidence Registry", command + "## Evidence Registry").replace("blocked: dual-client", "fail: dual-client").replace("Result rationale: blocked", "Result rationale: fail");
  const parsed = parseReport(failed, report, repo);
  assert.equal(overallResult([...parsed.tests, ...parsed.commands]), "fail");
  assert.throws(() => parseReport(failed.replace("| C1 |", "| C0 |"), report, repo));
});

it("completed lifecycle requires matching filename/date, deterministic result and immutable history", async t => {
  const { repo, report, body } = fixture(t);
  const completed = path.join(repo, "docs/test-reports/completed/2026-10-03-dual-client-runtime-report.md");
  const converted = body.replace('status: "active"', 'status: "completed"').replace('stage: "blocked"', "stage: null").replace("result: null", 'result: "blocked"').replace("completed-at: null", 'completed-at: "2026-10-03"');
  assert.equal(parseReport(converted, completed, repo).metadata.result, "blocked");
  assert.throws(() => parseReport(converted.replace('result: "blocked"', 'result: "pass"'), completed, repo));
  assert.throws(() => parseReport(converted, report, repo));
  assert.throws(() => parseReport(converted, completed.replace("2026-10-03-", "2026-10-04-"), repo));
  assert.throws(() => buildReport({ previous: converted, observations: [], revision: REVISION, at: AT, reportPath: completed, repoRoot: repo }));
  writeFileSync(completed, converted);
  const root = path.join(repo, "must-not-be-created");
  await assert.rejects(main(["--phase", "capability", "--root", root, "--report", completed], repo), /Completed campaigns/);
  assert.equal(existsSync(root), false);
  assert.equal(readFileSync(completed, "utf8"), converted);
});

it("rejects local escaping/missing links and sensitive evidence; external links are not fetched", t => {
  const { repo, report, body } = fixture(t);
  assert.doesNotThrow(() => parseReport(body + "\n[official](https://developers.openai.com/fixture)\n", report, repo));
  for (const suffix of ["[missing](./missing.png)", "[escape](../../../../outside.md)", "hu_" + "a".repeat(43), "Bearer sensitive", "TODO"]) assert.throws(() => parseReport(body + "\n" + suffix, report, repo));
});

it("rejects paths outside the campaign and report symlinks", t => {
  const { repo, report, body } = fixture(t);
  assert.throws(() => reportLocation("../outside.md", repo));
  assert.throws(() => reportLocation("docs/test-reports/active/other-report.md", repo));
  const actual = report + ".source"; writeFileSync(actual, body);
  try { symlinkSync(actual, report, "file"); } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") { t.skip("Windows symlink privilege unavailable; path escape test executed."); return; }
    throw error;
  }
  assert.throws(() => reportLocation(report, repo));
});

it("rejects a symlink/junction parent before writing through it", t => {
  const { repo } = fixture(t);
  const active = path.join(repo, "docs/test-reports/active"), old = active + "-original";
  renameSync(active, old);
  symlinkSync(old, active, process.platform === "win32" ? "junction" : "dir");
  const report = path.join(active, "dual-client-runtime-report.md");
  assert.throws(() => reportLocation(report, repo));
  assert.throws(() => writeReport(report, () => "not written", { repoRoot: repo }));
  assert.equal(existsSync(path.join(old, "dual-client-runtime-report.md.tmp")), false);
});

it("atomically writes, reads back, and appends to the same campaign", t => {
  const { repo, report, body } = fixture(t);
  writeReport(report, previous => { assert.equal(previous, undefined); return body; }, { repoRoot: repo });
  writeReport(report, previous => buildReport({ previous, observations: [{ method: "append", expected: "retain", detail: "retained", verdict: "PASS" }], revision: REVISION, at: AT, reportPath: report, repoRoot: repo }), { repoRoot: repo });
  assert.equal(parseReport(readFileSync(report, "utf8"), report, repo).tests.length, 2);
  assert.equal(existsSync(report + ".tmp"), false);
});

it("busy writer never takes over/deletes existing temporary content", t => {
  const { repo, report, body } = fixture(t);
  writeFileSync(report, body); writeFileSync(report + ".tmp", "Other writer");
  assert.throws(() => writeReport(report, () => body, { repoRoot: repo }));
  assert.equal(readFileSync(report, "utf8"), body);
  assert.equal(readFileSync(report + ".tmp", "utf8"), "Other writer");
});

it("failed validation or rename preserves the prior report and removes only its own temp", t => {
  const { repo, report, body } = fixture(t);
  writeFileSync(report, body);
  assert.throws(() => writeReport(report, () => "invalid", { repoRoot: repo }));
  assert.equal(readFileSync(report, "utf8"), body);
  assert.equal(existsSync(report + ".tmp"), false);
  assert.throws(() => writeReport(report, () => body, { repoRoot: repo, beforeRename: () => { throw new Error("Injected failure"); } }));
  assert.equal(readFileSync(report, "utf8"), body);
  assert.equal(existsSync(report + ".tmp"), false);
});

it("temporary successor is not deleted or promoted by a failed old writer", t => {
  const { repo, report, body } = fixture(t);
  writeFileSync(report, body);
  assert.throws(() => writeReport(report, () => body, { repoRoot: repo, beforeRename: () => { renameSync(report + ".tmp", report + ".retired"); writeFileSync(report + ".tmp", "Successor"); } }));
  assert.equal(readFileSync(report, "utf8"), body);
  assert.equal(readFileSync(report + ".tmp", "utf8"), "Successor");
});

it("out-of-band report modification is retained and the stale writer fails", t => {
  const { repo, report, body } = fixture(t);
  writeFileSync(report, body);
  assert.throws(() => writeReport(report, () => body, { repoRoot: repo, beforeRename: () => { writeFileSync(report, "Concurrent change"); } }));
  assert.equal(readFileSync(report, "utf8"), "Concurrent change");
  assert.equal(existsSync(report + ".tmp"), false);
});

it("nonempty/containing fixture roots refuse before invoking child processes", async t => {
  const { repo } = fixture(t);
  let called = false;
  const runner = async () => { called = true; return { code: 0, stdout: "", stderr: "" }; };
  await assert.rejects(runCapability(repo, REPO, runner));
  await assert.rejects(runCapability(REPO, REPO, runner));
  await assert.rejects(runCapability(path.dirname(REPO), REPO, runner));
  assert.equal(called, false);
});

it("foreign campaign fails before creating a disposable root", async t => {
  const { repo, report } = fixture(t);
  writeFileSync(report, "Foreign campaign");
  const root = path.join(repo, "must-not-exist");
  await assert.rejects(main(["--phase", "capability", "--root", root, "--report", report], repo));
  assert.equal(existsSync(root), false);
});

it("missing metadata local reference is rejected without external resolution", t => {
  const { repo, report, body } = fixture(t);
  const changed = body.replace(PROPOSAL, "docs/proposals/active/missing.md");
  assert.throws(() => parseReport(changed, report, repo));
  copyFileSync(path.join(repo, PROPOSAL), path.join(repo, "docs/proposals/active/missing.md"));
  assert.doesNotThrow(() => parseReport(changed, report, repo));
});
