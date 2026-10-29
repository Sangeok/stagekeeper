import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseFrontMatter } from "../checks/verify-docs.mjs";

const loader = createRequire(import.meta.url).resolve("tsx");
const repository = fileURLToPath(new URL("../../", import.meta.url));
const roots = [];

function temporaryDirectory() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "rehearsal-cli-"));
  roots.push(root);
  return root;
}

function run(script, args, cwd, { preload } = {}) {
  return spawnSync(process.execPath, [...(preload ? ["--require", preload] : []), "--import", loader, fileURLToPath(new URL(script, import.meta.url)), ...args], {
    cwd, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, TEST_DATABASE_URL: "", DATABASE_URL: "invalid-fixture-url", TSX_DISABLE_CACHE: "1" },
  });
}

function assertReportArtifact(body, output) {
  const fields = parseFrontMatter(body);
  assert.ok(fields);
  assert.deepEqual(Object.keys(fields).sort(), ["status", "stage", "result", "report-kind", "report-size", "test-levels", "test-tools", "created-at", "completed-at", "last-executed-at", "tested-revision", "owners", "related", "primary-area", "observed-environments", "test-summary", "follow-up"].sort());
  assert.deepEqual([...body.matchAll(/^## (.+)$/gm)].map(match => match[1]), ["Summary and Decision", "Scope and Criteria", "Test Target", "Preconditions and Test Data", "Test Matrix", "Commands and Static Checks", "Evidence Registry", "Findings and Follow-up", "Test Data and Cleanup", "Conclusion", "Review Checklist"]);
  const matrix = body.split("## Test Matrix\n")[1].split("\n## Commands and Static Checks")[0];
  const evidence = body.split("## Evidence Registry\n")[1].split("\n## Findings and Follow-up")[0];
  const rows = matrix.split("\n").filter(line => line.startsWith("|")).slice(2).map(line => line.slice(1, -1).split("|").map(value => value.trim()));
  const recorded = evidence.split("\n").filter(line => line.startsWith("|")).slice(2).map(line => line.slice(1, -1).split("|").map(value => value.trim()));
  const ids = new Set(recorded.map(row => row[0]));
  const cases = new Set(rows.map(row => row[0]));
  assert.equal(ids.size, recorded.length);
  assert.equal(cases.size, rows.length);
  assert.ok(rows.length > 1);
  assert.ok(rows.every(row => row.length === 7 && row[1] === "required" && ["C1", "C2"].includes(row[2]) && ids.has(row[5])));
  assert.ok(recorded.every(row => row.length === 4 && cases.has(row[2])));
  assert.match(body, /\| CMD1 \| informational \|.*\| NOT RUN \|/);
  const manifest = body.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(manifest);
  assert.deepEqual(JSON.parse(manifest[1]), {
    command: "node", cwd: "repository-root",
    args: ["--import", "./tests/server/register-server-only.mjs", "--import", "tsx", "scripts/rehearsals/rehearse-web-http-contracts.ts", "--report", output],
  });
  return fields;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("shows both help messages and rejects invalid arguments before build, database or report preparation", () => {
  const root = temporaryDirectory();
  for (const script of ["./rehearse-backlog-pipeline.ts", "./rehearse-src-clean-code-fourth-pass.ts", "./rehearse-web-http-contracts.ts"]) {
    const help = run(script, ["--help"], root);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);
    assert.match(help.stdout, /TEST_DATABASE_URL/);
    assert.deepEqual(readdirSync(root), []);
    for (const args of [["--unknown"], ["--help", "--unknown"], ["--consumer-self-test", "--report", "result.md"]]) {
      const result = run(script, args, root);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Usage:/);
      assert.deepEqual(readdirSync(root), []);
    }
  }
});

it("rejects a missing or existing HTTP report and direct worker invocation before starting the decoder", () => {
  const root = temporaryDirectory(), output = join(root, "history.md");
  writeFileSync(output, "preserved completed record");
  for (const args of [[], ["--report"], ["--report", output], ["--flight-worker", "/page"], ["--flight-probe-worker", "positive"]]) {
    const result = run("./rehearse-web-http-contracts.ts", args, root);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(readFileSync(output, "utf8"), "preserved completed record");
    assert.deepEqual(readdirSync(root), ["history.md"]);
  }
});

it("runs every independent decoder control without a report or test database", () => {
  const legacyReport = join(repository, "docs/test-reports/active/2026-10-04-src-clean-code-fifth-pass.md");
  const existed = existsSync(legacyReport);
  const before = existed ? readFileSync(legacyReport) : undefined;
  const result = run("./rehearse-web-http-contracts.ts", ["--consumer-self-test"], repository);
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(result.stdout);
  assert.equal(rows.length, 7);
  assert.ok(rows.every(row => row.status === "Pass"));
  assert.equal(existsSync(legacyReport), existed);
  if (existed) assert.deepEqual(readFileSync(legacyReport), before);
});

it("records an unprepared database as blocked without turning decoder success into full acceptance", () => {
  const root = temporaryDirectory(), output = join(root, "blocked.md");
  const result = run("./rehearse-web-http-contracts.ts", ["--report", output], repository);
  assert.equal(result.status, 1, result.stderr);
  const body = readFileSync(output, "utf8"), fields = assertReportArtifact(body, output);
  assert.equal(fields.status, "completed");
  assert.equal(fields.result, "blocked");
  assert.match(fields["tested-revision"], /^[a-f0-9]{40}/);
  assert.match(fields["last-executed-at"], /^\d{4}-\d{2}-\d{2}T/);
  assert.match(body, /zero DB writes and zero product workers/);
  assert.match(body, /NOT RUN/);
  assert.doesNotMatch(body, /invalid-fixture-url/);
});

it("keeps the npm destination, compatibility import and retired path consistent", () => {
  const pkg = JSON.parse(readFileSync(join(repository, "package.json"), "utf8"));
  assert.equal(pkg.scripts["test:acceptance:backlog-pipeline"], "node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-backlog-pipeline.ts");
  assert.equal(readFileSync(new URL("./rehearse-src-clean-code-fourth-pass.ts", import.meta.url), "utf8"), 'import "./rehearse-backlog-pipeline";\n');
  assert.equal(existsSync(new URL("./rehearse-backlog-pipeline.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./rehearse-web-http-contracts.ts", import.meta.url)), true);
  assert.equal(existsSync(new URL("./rehearse-src-clean-code-fifth-pass.ts", import.meta.url)), false);
});

for (const fault of ["partial-write", "publication-race"]) {
  it(`preserves the original failure and existing files when CLI report storage encounters ${fault}`, () => {
    const root = temporaryDirectory(), output = join(root, "result.md"), history = join(root, "history.md");
    const preload = join(root, "storage-fault.cjs");
    writeFileSync(history, "preserved completed history");
    writeFileSync(preload, `const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const write = fs.writeFileSync, link = fs.linkSync;
const target = ${JSON.stringify(output)};
const fault = ${JSON.stringify(fault)};
fs.writeFileSync = (file, body, options) => {
  if (fault === 'partial-write' && typeof file === 'number' && typeof body === 'string' && body.startsWith('---\\nstatus:') && body.includes('# Web HTTP contracts acceptance')) {
    write(file, body.slice(0, 100), options);
    throw Object.assign(new Error('fixture storage failure'), { code: 'ENOSPC' });
  }
  return write(file, body, options);
};
fs.linkSync = (from, to) => {
  if (fault === 'publication-race' && to === target) write(to, 'competing final report', { flag: 'wx' });
  return link(from, to);
};
syncBuiltinESMExports();
`);
    const result = run("./rehearse-web-http-contracts.ts", ["--report", output], repository, { preload });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /HTTP report write failed/);
    assert.match(result.stderr, /Web HTTP acceptance failed/);
    assert.equal(readFileSync(history, "utf8"), "preserved completed history");
    if (fault === "partial-write") assert.equal(existsSync(output), false);
    else assert.equal(readFileSync(output, "utf8"), "competing final report");
    assert.deepEqual(readdirSync(root).sort(), (fault === "partial-write" ? ["history.md", "storage-fault.cjs"] : ["history.md", "result.md", "storage-fault.cjs"]).sort());
  });
}
