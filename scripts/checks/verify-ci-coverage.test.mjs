import assert from "node:assert/strict";
import { it } from "node:test";
import { inspectCoverage, inspectRepository, readCoverageTable, readWorkflow } from "./verify-ci-coverage.mjs";

const head = "name: sample\n\non:\n  workflow_dispatch:\n\njobs:\n";
const smoke = readWorkflow("smoke", `${head}  gate:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: windows-2022
            leg: windows
          - os: macos-15
            leg: macos
    outputs:
      summary_windows: \${{ steps.run.outputs.summary_windows }}
      summary_macos: \${{ steps.run.outputs.summary_macos }}
    steps:
      - run: node scripts/rehearsals/rehearse-sample.ts
  record:
    needs: [gate]
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/gate-record
        with:
          workflow: smoke
          legs: windows,macos
`);
const windowsUnit = readWorkflow("windows-unit", `${head}  tests:
    runs-on: windows-2022
    steps:
      - run: node --test "plugin/bin/*.test.mjs" "plugin/runtime/*.test.mjs"
      - run: node scripts/windows/build.mjs
`);
const macosUnit = readWorkflow("macos-unit", `${head}  tests:
    runs-on: \${{ matrix.runner }}
    strategy:
      matrix:
        runner: [macos-15, macos-15-intel]
    steps:
      - run: node --test "plugin/bin/*.test.mjs" "plugin/runtime/*.test.mjs"
`);
const linux = readWorkflow("check", `${head}  check:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`);
const workflows = [smoke, windowsUnit, macosUnit, linux];
const packageJson = { scripts: { test: 'node --test "plugin/bin/*.test.mjs" "plugin/runtime/*.test.mjs"' } };

const HEADER = "| 검사 | 분류 | Windows | macOS | Linux | 미충족 | 이유 또는 확인 문자열 |\n| --- | --- | --- | --- | --- | --- | --- |";
const rows = {
  smoke: "| 설치 | OS별 | `smoke/gate` | `smoke/gate` | | | `scripts/rehearsals/rehearse-sample.ts` |",
  unit: "| 제품 코드 시험 | OS별 | `windows-unit/tests` | `macos-unit/tests` | `check/check` | | `npm test`의 대상 묶음 |",
  record: "| 기록 | 공통 | | | `smoke/record` | | |",
  build: "| Windows 빌드 | 단일 OS | `windows-unit/tests` | | | | Windows에만 있는 구현이다 |",
};
const table = (...lines) => readCoverageTable(`before\n<!-- ci-coverage:start -->\n${HEADER}\n${lines.join("\n")}\n<!-- ci-coverage:end -->\nafter\n`);
const inspect = (lines, overrides = {}) => inspectCoverage({ workflows, table: table(...lines), packageJson, ...overrides });
const complete = Object.values(rows);

it("accepts the repository's own workflows and coverage table", () => {
  const result = inspectRepository();

  assert.deepEqual(result.problems, []);
  assert.ok(result.jobs >= 12);
  assert.ok(result.rows >= 10);
});

it("reads each job's systems, legs, summary outputs and record legs from the workflow text", () => {
  assert.deepEqual(smoke.map(job => [job.key, job.systems, job.matrixLegs, job.summaryLegs, job.needs, job.recordLegs]), [
    ["smoke/gate", ["Windows", "macOS"], ["windows", "macos"], ["windows", "macos"], [], null],
    ["smoke/record", ["Linux"], [], [], ["smoke/gate"], ["windows", "macos"]],
  ]);
  assert.deepEqual(macosUnit[0].systems, ["macOS"]);
  assert.deepEqual(windowsUnit[0].systems, ["Windows"]);
});

it("refuses a workflow shape it cannot read instead of passing it", () => {
  assert.throws(() => readWorkflow("empty", "name: empty\n"), /no jobs section/);
  assert.throws(() => readWorkflow("none", head), /no jobs/);
  assert.throws(() => readWorkflow("reusable", `${head}  call:\n    uses: ./.github/workflows/other.yml\n`), /no runs-on/);
  assert.throws(() => readWorkflow("hosted", `${head}  job:\n    runs-on: [self-hosted, macOS]\n`), /not a Windows, macOS or Ubuntu runner/);
  assert.throws(() => readWorkflow("matrix", `${head}  job:\n    runs-on: \${{ matrix.os }}\n    steps: []\n`), /no runners for matrix\.os/);
  assert.throws(() => readWorkflow("anchor", `${head}  job: &shared\n    runs-on: ubuntu-latest\n`), /unsupported job line/);
  assert.throws(() => readWorkflow("after", `${head}  job:\n    runs-on: ubuntu-latest\nenv:\n  A: 1\n`), /unexpected top-level line/);
});

it("refuses a coverage table without its markers, columns or cells", () => {
  assert.throws(() => readCoverageTable(`${HEADER}\n${rows.record}\n`), /markers are missing/);
  assert.throws(() => readCoverageTable(`<!-- ci-coverage:start -->\n| 검사 | 분류 |\n| --- | --- |\n| 기록 | 공통 |\n<!-- ci-coverage:end -->`), /must have the columns/);
  assert.throws(() => table("| 기록 | 공통 | | | `smoke/record` | |"), /must have 7 cells/);
});

it("passes when every job is classified and every per-OS check has both systems", () => {
  assert.deepEqual(inspect(complete), []);
});

it("fails when a job is missing from the table or the table names a job that is not there", () => {
  assert.deepEqual(inspect([rows.smoke, rows.unit, rows.build]), ["job smoke/record is not in the CI coverage table"]);
  assert.match(inspect([...complete, "| 옛 검사 | 공통 | | | `check/removed` | | |"]).join("\n"), /job check\/removed does not exist/);
  assert.match(inspect([rows.smoke, rows.unit, rows.build, "| 기록 | 공통 | `smoke/record` | | | | 이유 |"]).join("\n"), /job smoke\/record does not run on Windows/);
  assert.match(inspect([...complete, "| 이상한 칸 | 공통 | | | `check` | | |"]).join("\n"), /is not a workflow\/job reference/);
  assert.match(inspect([rows.smoke, rows.unit, rows.build, "| 기록 | 선택 | | | `smoke/record` | | |"]).join("\n"), /the class must be one of/);
});

it("requires a per-OS check on both supported systems unless the missing one is recorded as unmet", () => {
  const windowsOnly = "| 제품 코드 시험 | OS별 | `windows-unit/tests` | | `check/check` | | `npm test`의 대상 묶음 |";
  const recorded = "| 제품 코드 시험 | OS별 | `windows-unit/tests` | | `check/check` | macOS | `npm test`의 대상 묶음 |";
  const stale = "| 제품 코드 시험 | OS별 | `windows-unit/tests` | `macos-unit/tests` | `check/check` | macOS | `npm test`의 대상 묶음 |";
  const linuxUnmet = "| 제품 코드 시험 | OS별 | `windows-unit/tests` | `macos-unit/tests` | `check/check` | Linux | `npm test`의 대상 묶음 |";
  const rest = [rows.smoke, rows.record, rows.build, "| macOS 시험 | 단일 OS | | `macos-unit/tests` | | | macOS에만 있는 구현이다 |"];

  assert.match(inspect([windowsOnly, ...rest]).join("\n"), /a per-OS check needs a macOS job/);
  assert.deepEqual(inspect([recorded, ...rest]), []);
  assert.match(inspect([stale, rows.smoke, rows.record, rows.build]).join("\n"), /macOS is listed as unmet but macos-unit\/tests covers it/);
  assert.match(inspect([linuxUnmet, rows.smoke, rows.record, rows.build]).join("\n"), /"Linux" in the unmet cell is not a supported system/);
});

it("counts a system as covered only when its job contains the confirmation strings", () => {
  const partial = readWorkflow("windows-unit", `${head}  tests:\n    runs-on: windows-2022\n    steps:\n      - run: node --test "plugin/bin/*.test.mjs"\n      - run: node scripts/windows/build.mjs\n`);
  const problems = inspectCoverage({ workflows: [smoke, partial, macosUnit, linux], table: table(...complete), packageJson });
  assert.match(problems.join("\n"), /row "제품 코드 시험": a per-OS check needs a Windows job that runs npm test/);

  const unmet = "| 제품 코드 시험 | OS별 | `windows-unit/tests` | `macos-unit/tests` | `check/check` | Windows | `npm test`의 대상 묶음 |";
  assert.deepEqual(inspectCoverage({ workflows: [smoke, partial, macosUnit, linux], table: table(unmet, rows.smoke, rows.record, rows.build), packageJson }), []);

  const renamed = "| 설치 | OS별 | `smoke/gate` | `smoke/gate` | | | `scripts/rehearsals/rehearse-other.ts` |";
  assert.match(inspect([renamed, rows.unit, rows.record, rows.build]).join("\n"), /a per-OS check needs a Windows job that runs scripts\/rehearsals\/rehearse-other\.ts/);
});

it("requires a reason for a single-OS check and for a common check that never runs on Linux", () => {
  const noReason = "| Windows 빌드 | 단일 OS | `windows-unit/tests` | | | | |";
  const twoSystems = "| Windows 빌드 | 단일 OS | `windows-unit/tests` | `macos-unit/tests` | | | 이유 |";
  const commonOnMac = "| 모델 동작 | 공통 | | `macos-unit/tests` | | | |";
  const commonOnMacWithReason = "| 모델 동작 | 공통 | | `macos-unit/tests` | | | 샌드박스가 있는 OS에서만 돈다 |";
  const commonUnmet = "| 기록 | 공통 | | | `smoke/record` | macOS | |";
  const empty = "| 빈 검사 | 공통 | | | | | |";
  const base = [rows.smoke, rows.unit, rows.record];

  assert.match(inspect([...base, noReason]).join("\n"), /needs a reason/);
  assert.match(inspect([...base, twoSystems]).join("\n"), /lists jobs on exactly one system/);
  assert.match(inspect([...complete, commonOnMac]).join("\n"), /row "모델 동작": a check that runs on one system needs a reason/);
  assert.deepEqual(inspect([...complete, commonOnMacWithReason]), []);
  assert.match(inspect([rows.smoke, rows.unit, rows.build, commonUnmet]).join("\n"), /only a per-OS check can have unmet systems/);
  assert.match(inspect([...complete, empty]).join("\n"), /row "빈 검사": no job is listed/);
});

it("fails when a record job's legs differ from the summary outputs its gate declares", () => {
  const variant = (gateOutputs, legs, matrix = "windows\n          - os: macos-15\n            leg: macos") => readWorkflow("smoke", `${head}  gate:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        include:
          - os: windows-2022
            leg: ${matrix}
    outputs:
${gateOutputs.map(name => `      summary_${name}: x`).join("\n")}
    steps:
      - run: node scripts/rehearsals/rehearse-sample.ts
  record:
    needs: [gate]
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/gate-record
        with:
          legs: ${legs}
`);
  const check = smokeJobs => inspectCoverage({ workflows: [smokeJobs, windowsUnit, macosUnit, linux], table: table(...complete), packageJson });

  assert.deepEqual(check(variant(["windows", "macos"], "macos,windows")), []);
  assert.match(check(variant(["windows", "macos"], "windows")).join("\n"), /job smoke\/record: legs \[windows\] differ from the summary outputs \[windows, macos\] of smoke\/gate/);
  assert.match(check(variant(["windows"], "windows")).join("\n"), /job smoke\/gate: matrix leg macos has no summary_macos output/);

  const orphan = readWorkflow("smoke", `${head}  gate:\n    runs-on: \${{ matrix.os }}\n    strategy:\n      matrix:\n        include:\n          - os: windows-2022\n          - os: macos-15\n    steps:\n      - run: node scripts/rehearsals/rehearse-sample.ts\n  record:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/gate-record\n        with:\n          legs: windows\n`);
  assert.match(check(orphan).join("\n"), /job smoke\/record: a record job needs exactly one gate job/);
});
