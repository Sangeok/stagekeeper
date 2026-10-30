import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { inspectDocs, parseFrontMatter } from "../checks/verify-docs.mjs";
import { parseWebHttpArguments, prepareWebHttpReport, renderWebHttpReport, writeWebHttpReport, type WebHttpCaseResult, type WebHttpReportRun } from "./web-http-report";

const roots: string[] = [];
const at = new Date("2026-10-29T03:04:05.000Z");
const pass: WebHttpCaseResult = { case: "HTTP fixture", expected: "guarded response", observed: "response checked", status: "Pass" };
const reportFields = ["status", "stage", "result", "report-kind", "report-size", "test-levels", "test-tools", "created-at", "completed-at", "last-executed-at", "tested-revision", "owners", "related", "primary-area", "observed-environments", "test-summary", "follow-up"];
const reportSections = ["Summary and Decision", "Scope and Criteria", "Test Target", "Preconditions and Test Data", "Test Matrix", "Commands and Static Checks", "Evidence Registry", "Findings and Follow-up", "Test Data and Cleanup", "Conclusion", "Review Checklist"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function metadata(body: string): Record<string, unknown> {
  const fields: unknown = parseFrontMatter(body);
  assert.ok(isRecord(fields));
  return fields;
}

function tableRows(body: string): string[][] {
  return body.split("\n").filter(line => line.startsWith("|")).slice(2).map(line => line.slice(1, -1).split("|").map(cell => cell.trim()));
}

function assertCompleteReport(body: string, reportPath: string): Record<string, unknown> {
  const fields = metadata(body);
  assert.deepEqual(Object.keys(fields).sort(), [...reportFields].sort());
  assert.equal(fields.status, "completed");
  assert.equal(fields.stage, null);
  assert.ok(["pass", "fail", "blocked"].includes(String(fields.result)));
  assert.equal(fields["report-kind"], "acceptance");
  assert.equal(fields["report-size"], "standard");
  for (const key of ["test-levels", "test-tools", "owners", "related", "observed-environments", "follow-up"]) {
    const value = fields[key];
    assert.ok(Array.isArray(value), key);
    assert.ok(value.every((item: unknown) => typeof item === "string"), key);
  }
  for (const key of ["created-at", "completed-at"]) assert.match(String(fields[key]), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(String(fields["last-executed-at"]), /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/);
  assert.ok(Number.isFinite(Date.parse(String(fields["last-executed-at"]))));
  assert.match(String(fields["tested-revision"]), /^[a-f0-9]{40}(?: \(dirty working tree\))?$/);
  assert.equal(fields["primary-area"], "web/http-contracts");
  assert.ok(String(fields["test-summary"]).startsWith(`${fields.result}:`));
  const headings = [...body.matchAll(/^## (.+)$/gm)];
  assert.deepEqual(headings.map(heading => heading[1]), reportSections);
  const sections = new Map(headings.map((heading, index) => [heading[1], body.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? body.length)]));
  const criteria = new Set([...sections.get("Scope and Criteria")!.matchAll(/^- (C\d+):/gm)].map(match => match[1]));
  assert.deepEqual([...criteria].sort(), ["C1", "C2"]);
  const matrix = tableRows(sections.get("Test Matrix")!);
  const evidence = tableRows(sections.get("Evidence Registry")!);
  assert.ok(matrix.length > 1);
  assert.ok(evidence.length > 1);
  const caseIds = new Set(matrix.map(row => row[0]));
  const evidenceIds = new Set(evidence.map(row => row[0]));
  assert.equal(caseIds.size, matrix.length);
  assert.equal(evidenceIds.size, evidence.length);
  for (const row of matrix) {
    assert.equal(row.length, 7);
    assert.ok(/^T\d+$/.test(row[0]) || row[0] === "CLEANUP");
    assert.equal(row[1], "required");
    assert.ok(criteria.has(row[2]));
    assert.ok(evidenceIds.has(row[5]));
    assert.ok(["PASS", "FAIL", "NOT RUN"].includes(row[6]));
  }
  for (const row of evidence) {
    assert.equal(row.length, 4);
    assert.match(row[0], /^E\d+$/);
    assert.ok(row[1].length > 0);
    assert.ok(caseIds.has(row[2]));
  }
  const expected = matrix.some(row => row[6] === "FAIL") ? "fail" : matrix.some(row => row[6] === "NOT RUN") ? "blocked" : "pass";
  assert.equal(fields.result, expected);
  const commands = tableRows(sections.get("Commands and Static Checks")!);
  assert.equal(commands.length, 1);
  assert.equal(commands[0][0], "CMD1");
  assert.equal(commands[0][1], "informational");
  assert.equal(commands[0][4], "NOT RUN");
  const encoded = sections.get("Commands and Static Checks")!.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(encoded);
  assert.deepEqual(JSON.parse(encoded[1]), {
    command: "node", cwd: "repository-root",
    args: ["--import", "./tests/server/register-server-only.mjs", "--import", "tsx", "scripts/rehearsals/rehearse-web-http-contracts.ts", "--report", reportPath],
  });
  assert.doesNotMatch(body, /--report <new\.md>/);
  return fields;
}

function reportRun(): WebHttpReportRun {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "web-http-report-"));
  roots.push(root);
  const path = join(root, "docs/test-reports/completed/2026-10-29-web-http-contracts.md");
  mkdirSync(dirname(path), { recursive: true });
  return { path, repository: root, startedAt: "2026-10-29T03:00:00.000Z", revision: "a".repeat(40), dirty: true, environment: "local | loopback HTTP | Node/macOS | role:fixture-owner" };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("accepts one execution mode and rejects missing, mixed and unknown arguments", () => {
  assert.deepEqual(parseWebHttpArguments(["--help"]), { ok: true, options: { mode: "help" } });
  assert.deepEqual(parseWebHttpArguments(["--consumer-self-test"]), { ok: true, options: { mode: "self-test" } });
  assert.deepEqual(parseWebHttpArguments(["--report", "new.md"]), { ok: true, options: { mode: "run", reportPath: "new.md" } });
  assert.deepEqual(parseWebHttpArguments(["--flight-worker", "/page"]), { ok: true, options: { mode: "flight-worker", route: "/page" } });
  assert.deepEqual(parseWebHttpArguments(["--flight-probe-worker", "positive"]), { ok: true, options: { mode: "probe-worker", probe: "positive" } });
  for (const args of [[], ["--unknown"], ["--report"], ["--report", ""], ["--report", "--help"], ["--help", "--report", "new.md"], ["--consumer-self-test", "--report", "new.md"], ["--report", "one.md", "--report", "two.md"], ["--flight-probe-worker", "unknown"]]) {
    assert.deepEqual(parseWebHttpArguments(args), { ok: false }, JSON.stringify(args));
  }
});

it("keeps document completion separate from fail, blocked and pass results", () => {
  const run = reportRun();
  for (const scenario of [
    { results: [pass], cleanup: true, result: "pass" },
    { results: [{ ...pass, status: "Not run" as const }], cleanup: true, result: "blocked" },
    { results: [{ ...pass, status: "Not run" as const }, { ...pass, status: "Fail" as const }], cleanup: true, result: "fail" },
    { results: [pass], cleanup: false, result: "fail" },
    { results: [], cleanup: true, result: "blocked" },
  ]) {
    const fields = assertCompleteReport(renderWebHttpReport({ run, build: "fixture-build", at, ...scenario }), run.path);
    assert.equal(fields.status, "completed");
    assert.equal(fields.stage, null);
    assert.equal(fields.result, scenario.result);
  }
});

it("records the actual execution metadata and produces a report accepted by the current docs checker", () => {
  const run = reportRun();
  mkdirSync(join(run.repository, "docs/architecture"));
  writeFileSync(join(run.repository, "docs/architecture/verification.md"), "# Verification\n");
  writeWebHttpReport({ run, results: [{ ...pass, observed: "checked | bounded\nfixture" }], build: "build-id / sha256 abc", cleanup: true, at });
  const body = readFileSync(run.path, "utf8");
  const fields = assertCompleteReport(body, run.path);
  assert.equal(fields["created-at"], "2026-10-29");
  assert.equal(fields["completed-at"], "2026-10-29");
  assert.equal(fields["last-executed-at"], at.toISOString());
  assert.equal(fields["tested-revision"], `${run.revision} (dirty working tree)`);
  assert.deepEqual(fields["observed-environments"], [run.environment]);
  assert.match(body, /checked   bounded fixture/);
  assert.match(body, /NOT RUN never counts as PASS/);
  assert.match(body, /## Evidence Registry/);
  assert.match(body, /## Test Data and Cleanup/);
  const control = join(dirname(run.path), "permissions-control");
  writeFileSync(control, "default permissions");
  assert.equal(statSync(run.path).mode & 0o777, statSync(control).mode & 0o777);
  assert.deepEqual(readdirSync(dirname(run.path)).filter(name => name.startsWith(".stagekeeper-web-http-")), []);
  const inspection = inspectDocs(run.repository, ["docs/test-reports/completed/2026-10-29-web-http-contracts.md", "docs/architecture/verification.md"]);
  assert.deepEqual(inspection.problems, []);
});

it("preserves an existing result and a file created after preparation", () => {
  const run = reportRun();
  const input = { run, results: [pass], build: "fixture", cleanup: true, at };
  writeWebHttpReport(input);
  const original = readFileSync(run.path);
  assert.throws(() => writeWebHttpReport(input), /Existing report refused/);
  assert.deepEqual(readFileSync(run.path), original);
  assert.throws(() => prepareWebHttpReport({ reportPath: run.path, repository: run.repository, at }), /Existing report refused/);
  const raced = reportRun();
  writeFileSync(raced.path, "another execution owns this report");
  assert.throws(() => writeWebHttpReport({ ...input, run: raced }), /Existing report refused/);
  assert.equal(readFileSync(raced.path, "utf8"), "another execution owns this report");
});

it("rejects active campaigns, invalid completed dates and symlink targets before inspecting Git", t => {
  const run = reportRun();
  const active = join(run.repository, "docs/test-reports/active");
  mkdirSync(active);
  for (const target of [join(active, "campaign.md"), join(dirname(run.path), "2026-10-04-history.md"), join(dirname(run.path), "result.json"), join(run.repository, "root-report.md")]) {
    assert.throws(() => prepareWebHttpReport({ reportPath: target, repository: run.repository, at }), /Report|Repository/);
  }
  const history = join(dirname(run.path), "2026-10-29-history.md");
  writeFileSync(history, "completed evidence");
  if (process.platform === "win32") { t.diagnostic("Symlink fixture requires Windows privileges; other path rejection checks ran."); return; }
  symlinkSync(history, run.path);
  assert.throws(() => prepareWebHttpReport({ reportPath: run.path, repository: run.repository, at }), /Existing report refused/);
  assert.equal(readFileSync(history, "utf8"), "completed evidence");
});

it("keeps shell-sensitive output paths as JSON argument data", () => {
  const run = reportRun();
  const operator = process.platform === "win32" ? "&" : "|";
  run.path = join(dirname(run.path), `2026-10-29-report ' $(printf unsafe) ${operator} \`printf marker\`.md`);
  writeWebHttpReport({ run, results: [pass], build: "fixture", cleanup: true, at });
  assertCompleteReport(readFileSync(run.path, "utf8"), run.path);
});

it("rejects incomplete bodies, missing metadata, broken evidence and replay rows marked as executed", () => {
  const run = reportRun();
  const body = renderWebHttpReport({ run, results: [pass], build: "fixture", cleanup: true, at });
  const invalid = [
    body.replace(/^tested-revision:.*\n/m, ""),
    body.replace(/^## Test Matrix\n[\s\S]*?(?=^## )/m, ""),
    body.replace(/^## Evidence Registry\n[\s\S]*?(?=^## )/m, "## Evidence Registry\n\n"),
    body.replace("| E1 | PASS |", "| E999 | PASS |"),
    body.replace("| CMD1 | informational |", "| CMD1 | required |"),
  ];
  for (const changed of invalid) {
    assert.notEqual(changed, body);
    assert.throws(() => assertCompleteReport(changed, run.path));
  }
});

it("keeps UTC rollover rejection inside the repository and records the actual date outside it", () => {
  const run = reportRun();
  const finished = new Date("2026-10-30T00:00:01.000Z");
  assert.throws(() => writeWebHttpReport({ run, results: [pass], build: "fixture", cleanup: true, at: finished }), /execution date/);
  assert.equal(existsSync(run.path), false);
  assert.deepEqual(readdirSync(dirname(run.path)), []);
  run.path = join(dirname(run.repository), "web-http-report-" + basename(run.repository) + ".md");
  try {
    writeWebHttpReport({ run, results: [pass], build: "fixture", cleanup: true, at: finished });
    const fields = assertCompleteReport(readFileSync(run.path, "utf8"), run.path);
    assert.equal(fields["created-at"], "2026-10-29");
    assert.equal(fields["completed-at"], "2026-10-30");
  } finally { rmSync(run.path, { force: true }); }
});

const faultProgram = String.raw`
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const data = JSON.parse(process.argv[1]);
const { writeWebHttpReport } = require(data.helper);
const saved = Object.fromEntries(['openSync','writeFileSync','closeSync','linkSync','unlinkSync','fstatSync','lstatSync','readFileSync','readdirSync','existsSync'].map(name => [name, fs[name]]));
const parent = dirname(data.input.run.path);
let descriptor, temporary, foreignDescriptor, closeFaultUsed = false;
const ioError = code => Object.assign(new Error('injected ' + code), { code });
const createForeignFile = (path, text) => {
  const file = saved.openSync(path, 'wx');
  try { saved.writeFileSync(file, text); } finally { saved.closeSync(file); }
};
fs.openSync = (path, flags, ...options) => {
  if (typeof path === 'string' && dirname(path) === parent && path.endsWith('.tmp')) {
    temporary = path;
    if (data.fault === 'temporary-collision') createForeignFile(path, 'foreign temporary file');
    descriptor = saved.openSync(path, flags, ...options);
    return descriptor;
  }
  return saved.openSync(path, flags, ...options);
};
fs.writeFileSync = (file, value, options) => {
  if (file === descriptor && ['partial-write','partial-and-close'].includes(data.fault)) {
    saved.writeFileSync(file, String(value).slice(0, 100), options);
    throw ioError('ENOSPC');
  }
  return saved.writeFileSync(file, value, options);
};
fs.closeSync = file => {
  if (file === descriptor && !closeFaultUsed) {
    if (data.fault === 'close-before') { closeFaultUsed = true; throw ioError('EIO'); }
    if (['close-after','partial-and-close'].includes(data.fault)) { closeFaultUsed = true; saved.closeSync(file); throw ioError('EIO'); }
    if (data.fault === 'descriptor-replaced') {
      closeFaultUsed = true; saved.closeSync(file);
      foreignDescriptor = saved.openSync(join(parent, 'foreign-descriptor'), 'wx');
      saved.writeFileSync(foreignDescriptor, 'foreign descriptor data');
      throw ioError('EIO');
    }
    if (data.fault === 'temporary-replaced') {
      closeFaultUsed = true; saved.closeSync(file);
      saved.linkSync(temporary, join(parent, 'pinned-original'));
      saved.unlinkSync(temporary);
      createForeignFile(temporary, 'foreign replacement');
      return;
    }
  }
  return saved.closeSync(file);
};
fs.linkSync = (from, target) => {
  if (target === data.input.run.path) {
    if (data.fault === 'final-collision') createForeignFile(target, 'competing final report');
    if (data.fault === 'link-failure') throw ioError('EPERM');
  }
  return saved.linkSync(from, target);
};
fs.unlinkSync = path => {
  if (path === temporary && data.fault === 'unlink-failure') throw ioError('EACCES');
  return saved.unlinkSync(path);
};
syncBuiltinESMExports();
let failure;
try { writeWebHttpReport({ ...data.input, at: new Date(data.input.at) }); } catch (error) { failure = error; }
const errors = error => error?.errors ? error.errors.flatMap(errors) : error ? [{ code: error.code ?? null, message: error.message }] : [];
const isOpen = file => { if (file === undefined) return false; try { saved.fstatSync(file); return true; } catch { return false; } };
const outputExists = saved.existsSync(data.input.run.path);
const observed = {
  errors: errors(failure), outputExists,
  output: outputExists ? saved.readFileSync(data.input.run.path, 'utf8') : null,
  descriptorOpen: isOpen(descriptor), foreignDescriptorOpen: isOpen(foreignDescriptor),
  temporaryExists: temporary ? saved.existsSync(temporary) : false,
  temporary: temporary && saved.existsSync(temporary) ? saved.readFileSync(temporary, 'utf8') : null,
  files: saved.readdirSync(parent),
};
if (isOpen(foreignDescriptor)) saved.closeSync(foreignDescriptor);
console.log(JSON.stringify(observed));
`;

function publicationArguments(fault: string, run: WebHttpReportRun): string[] {
  const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const helper = fileURLToPath(new URL("./web-http-report.ts", import.meta.url));
  const input = { run, results: [pass], build: "fixture", cleanup: true, at: at.toISOString() };
  return ["--import", loader, "--input-type=module", "-e", faultProgram, JSON.stringify({ fault, helper, input })];
}

function publicationFault(fault: string, run: WebHttpReportRun): Record<string, unknown> {
  const child = spawnSync(process.execPath, publicationArguments(fault, run), {
    encoding: "utf8", timeout: 15_000, env: { ...process.env, TSX_DISABLE_CACHE: "1" },
  });
  assert.equal(child.status, 0, child.stderr);
  const observed: unknown = JSON.parse(child.stdout);
  assert.ok(isRecord(observed));
  return observed;
}

function publicationErrorCodes(observed: Record<string, unknown>): unknown[] {
  assert.ok(Array.isArray(observed.errors));
  return observed.errors.map((error: unknown) => { assert.ok(isRecord(error)); return error.code; });
}

for (const fault of ["partial-write", "partial-and-close", "close-before", "close-after", "link-failure"]) {
  it(`keeps the final path absent and closes its descriptor after ${fault}`, () => {
    const run = reportRun();
    const observed = publicationFault(fault, run);
    assert.equal(observed.outputExists, false);
    assert.equal(observed.descriptorOpen, false);
    assert.equal(observed.temporaryExists, false);
    assert.deepEqual(observed.files, []);
    const codes = fault === "partial-and-close" ? ["ENOSPC", "EIO"] : fault === "partial-write" ? ["ENOSPC"] : fault === "link-failure" ? ["EPERM"] : ["EIO"];
    assert.deepEqual(publicationErrorCodes(observed), codes);
  });
}

it("preserves the final file created by a competing publisher and removes only its own temporary file", () => {
  const observed = publicationFault("final-collision", reportRun());
  assert.equal(observed.output, "competing final report");
  assert.equal(observed.temporaryExists, false);
  assert.equal(observed.descriptorOpen, false);
  assert.deepEqual(publicationErrorCodes(observed), ["EEXIST"]);
});

it("preserves a temporary name already owned by another execution", () => {
  const observed = publicationFault("temporary-collision", reportRun());
  assert.equal(observed.outputExists, false);
  assert.equal(observed.temporary, "foreign temporary file");
  assert.equal(observed.descriptorOpen, false);
  assert.deepEqual(publicationErrorCodes(observed), ["EEXIST"]);
});

it("refuses a replaced temporary file without publishing or deleting it", () => {
  const observed = publicationFault("temporary-replaced", reportRun());
  assert.equal(observed.outputExists, false);
  assert.equal(observed.temporary, "foreign replacement");
  assert.equal(observed.descriptorOpen, false);
  assert.ok(publicationErrorCodes(observed).length > 0);
});

it("preserves a descriptor successor when the original close reports failure", () => {
  const observed = publicationFault("descriptor-replaced", reportRun());
  assert.equal(observed.outputExists, false);
  assert.equal(observed.foreignDescriptorOpen, true);
  assert.equal(observed.temporaryExists, false);
  assert.ok(publicationErrorCodes(observed).includes("EIO"));
});

it("reports temporary unlink failure while retaining the complete published body", () => {
  const run = reportRun();
  const observed = publicationFault("unlink-failure", run);
  assert.equal(observed.outputExists, true);
  assert.equal(observed.descriptorOpen, false);
  assert.equal(observed.temporaryExists, true);
  assertCompleteReport(String(observed.output), run.path);
  assert.deepEqual(publicationErrorCodes(observed), ["EACCES"]);
});

it("allows only one of two independent publishers to own the final report", async () => {
  const run = reportRun();
  const execute = promisify(execFile);
  const actors = [run, { ...run, revision: "b".repeat(40) }];
  const children = await Promise.allSettled(actors.map(async actor => {
    const { stdout } = await execute(process.execPath, publicationArguments("normal", actor), { encoding: "utf8", timeout: 15_000, env: { ...process.env, TSX_DISABLE_CACHE: "1" } });
    const value: unknown = JSON.parse(stdout);
    assert.ok(isRecord(value));
    return value;
  }));
  const observations = children.map(child => { assert.ok(child.status === "fulfilled"); return child.value; });
  assert.equal(observations.filter(child => publicationErrorCodes(child).length === 0).length, 1);
  const body = readFileSync(run.path, "utf8");
  const fields = assertCompleteReport(body, run.path);
  assert.ok(actors.some(actor => fields["tested-revision"] === `${actor.revision} (dirty working tree)`));
  assert.deepEqual(readdirSync(dirname(run.path)), [basename(run.path)]);
});
