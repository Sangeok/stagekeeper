import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, accessSync, closeSync, fstatSync, linkSync, lstatSync, openSync, realpathSync, unlinkSync, writeFileSync, type BigIntStats } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const FLIGHT_PROBE_CASES = ["positive", "turbopack-chunks", "missing-loader", "missing-mapping", "chunk-reject", "module-throw", "truncated-reference"] as const;
export const WEB_HTTP_USAGE = `Usage:
  node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-web-http-contracts.ts --report <new.md>
  node --import tsx scripts/rehearsals/rehearse-web-http-contracts.ts --consumer-self-test
  node --import tsx scripts/rehearsals/rehearse-web-http-contracts.ts --help

Run from the repository root. Full acceptance requires a fresh production build,
migrated isolated TEST_DATABASE_URL and free loopback port 55455. It checks actual
HTTP Actions, Flight decoding, access guards, read-only pages and owned cleanup.
The report must be new. Repository reports belong in docs/test-reports/completed/
with today's UTC YYYY-MM-DD prefix. An existing directory outside the repository
may hold temporary reports. Self-test runs decoder controls without DB, Next or a report.`;

type WebHttpOptions =
  | { mode: "help" }
  | { mode: "self-test" }
  | { mode: "run"; reportPath: string }
  | { mode: "flight-worker"; route: string }
  | { mode: "probe-worker"; probe: string };

export function parseWebHttpArguments(args: string[]): { ok: true; options: WebHttpOptions } | { ok: false } {
  if (args.length === 1 && args[0] === "--help") return { ok: true, options: { mode: "help" } };
  if (args.length === 1 && args[0] === "--consumer-self-test") return { ok: true, options: { mode: "self-test" } };
  if (args.length !== 2 || !args[1]?.trim() || args[1].startsWith("--")) return { ok: false };
  if (args[0] === "--report") return { ok: true, options: { mode: "run", reportPath: args[1] } };
  if (args[0] === "--flight-worker") return { ok: true, options: { mode: "flight-worker", route: args[1] } };
  if (args[0] === "--flight-probe-worker" && FLIGHT_PROBE_CASES.some(probe => probe === args[1])) {
    return { ok: true, options: { mode: "probe-worker", probe: args[1] } };
  }
  return { ok: false };
}

export type WebHttpCaseResult = { case: string; expected: string; observed: string; status: "Pass" | "Fail" | "Not run" };
export type WebHttpReportRun = {
  path: string;
  repository: string;
  startedAt: string;
  revision: string;
  dirty: boolean;
  environment: string;
};
type ReportInput = { run: WebHttpReportRun; results: WebHttpCaseResult[]; build: string; cleanup: boolean; at?: Date };
const repository = fileURLToPath(new URL("../../", import.meta.url));
type FileIdentity = Pick<BigIntStats, "dev" | "ino">;

function hasFileErrorCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function removeOwnedReportTemp(path: string, identity: FileIdentity): void {
  let current: BigIntStats;
  try { current = lstatSync(path, { bigint: true }); }
  catch (error) { if (hasFileErrorCode(error, "ENOENT")) return; throw error; }
  if (!sameFileIdentity(current, identity)) throw new Error("Temporary report identity changed");
  unlinkSync(path);
}

function publishNewReport(path: string, body: string): void {
  const temporary = join(dirname(path), `.stagekeeper-web-http-${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  let identity: FileIdentity | undefined;
  const failures: unknown[] = [];
  try {
    descriptor = openSync(temporary, "wx");
    identity = fstatSync(descriptor, { bigint: true });
    writeFileSync(descriptor, body, { encoding: "utf8" });
    closeSync(descriptor);
    descriptor = undefined;
    if (!sameFileIdentity(lstatSync(temporary, { bigint: true }), identity)) throw new Error("Temporary report identity changed");
    linkSync(temporary, path);
  } catch (error) {
    failures.push(error);
  } finally {
    if (descriptor !== undefined) {
      try {
        const current = fstatSync(descriptor, { bigint: true });
        if (identity && !sameFileIdentity(current, identity)) throw new Error("Report descriptor identity changed");
        identity ??= current;
        closeSync(descriptor);
      } catch (error) { if (!hasFileErrorCode(error, "EBADF")) failures.push(error); }
    }
    if (identity) {
      try { removeOwnedReportTemp(temporary, identity); }
      catch (error) { failures.push(error); }
    }
  }
  if (failures.length === 1 && failures[0] instanceof Error) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "Report publication or cleanup failed");
}

function newReportPath(input: { path: string; repository: string; at: Date }): string {
  const target = resolve(input.path);
  if (extname(target) !== ".md") throw new Error("Report must be a new Markdown file");
  const parent = realpathSync(dirname(target));
  const path = join(parent, basename(target));
  const fromRepository = relative(input.repository, path);
  const insideRepository = fromRepository !== ".." && !fromRepository.startsWith(`..${sep}`) && !isAbsolute(fromRepository);
  if (insideRepository) {
    const expected = join("docs", "test-reports", "completed", basename(path));
    if (fromRepository !== expected || !basename(path).startsWith(`${input.at.toISOString().slice(0, 10)}-`)) {
      throw new Error("Repository reports require a new completed/YYYY-MM-DD-*.md path matching the execution date");
    }
  }
  try {
    lstatSync(path);
  } catch (error) {
    if (hasFileErrorCode(error, "ENOENT")) {
      accessSync(parent, constants.W_OK);
      return path;
    }
    throw error;
  }
  throw new Error("Existing report refused");
}

export function prepareWebHttpReport(input: { reportPath: string; repository?: string; at?: Date }): WebHttpReportRun {
  const root = realpathSync(input.repository ?? repository);
  const at = input.at ?? new Date();
  const path = newReportPath({ path: input.reportPath, repository: root, at });
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  return {
    path, repository: root, startedAt: at.toISOString(), revision: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain=v1", "--untracked-files=normal"]).length > 0,
    environment: `local | loopback Next.js HTTP | Node ${process.version}/${process.platform}/${process.arch} | role:fixture-owner/read-only/foreign/guest`,
  };
}

export function renderWebHttpReport(input: ReportInput): string {
  const at = input.at ?? new Date();
  const date = at.toISOString().slice(0, 10);
  const failed = input.results.some(row => row.status === "Fail") || !input.cleanup;
  const blocked = input.results.length === 0 || input.results.some(row => row.status === "Not run");
  const result = failed ? "fail" : blocked ? "blocked" : "pass";
  const safe = (text: string) => text.replace(/[|\r\n]/g, " ");
  const verdicts = { Pass: "PASS", Fail: "FAIL", "Not run": "NOT RUN" } as const;
  const caseId = (index: number) => `T${index + 1}`;
  const rows: WebHttpCaseResult[] = input.results.length ? input.results : [{ case: "HTTP preparation", expected: "actual HTTP/DB observations", observed: "no observations collected", status: "Not run" }];
  const matrix = rows.map((row, index) => `| ${caseId(index)} | required | ${row.case === "cleanup" ? "C2" : "C1"} | ${safe(row.case)} | ${safe(row.expected)} | E${index + 1} | ${verdicts[row.status]} |`).join("\n");
  const evidence = rows.map((row, index) => `| E${index + 1} | ${safe(row.observed)} | ${caseId(index)} | inline; retained with this report |`).join("\n");
  const cleanupEvidence = `E${rows.length + 1}`;
  const cleanupObservation = input.cleanup ? "Owned resources were settled or preparation stopped before product resources were created." : "Owned-resource cleanup was not confirmed.";
  const incomplete = rows.flatMap((row, index) => row.status === "Pass" ? [] : [caseId(index)]);
  const replay = {
    command: "node", cwd: "repository-root",
    args: ["--import", "./tests/server/register-server-only.mjs", "--import", "tsx", "scripts/rehearsals/rehearse-web-http-contracts.ts", "--report", input.run.path],
  };
  const metadata = {
    status: "completed", stage: null, result, "report-kind": "acceptance", "report-size": "standard",
    "test-levels": ["contract", "integration"], "test-tools": ["Node.js", "Next.js HTTP", "React Flight decoder"],
    "created-at": input.run.startedAt.slice(0, 10), "completed-at": date, "last-executed-at": at.toISOString(),
    "tested-revision": `${input.run.revision}${input.run.dirty ? " (dirty working tree)" : ""}`,
    owners: ["user:Sangeok"], related: ["docs/architecture/verification.md"], "primary-area": "web/http-contracts",
    "observed-environments": [input.run.environment], "test-summary": `${result}: web HTTP contracts — ${input.results.length} required observations; cleanup ${input.cleanup ? "settled" : "failed"}`,
    "follow-up": [],
  };
  return `---
${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}
---

# Web HTTP contracts acceptance

## Summary and Decision

This report covers one HTTP/Flight rehearsal execution. The overall result is recorded
in front matter; document completion does not certify browser, native-client or production acceptance.

## Scope and Criteria

- C1: required decoder controls and actual HTTP Action/read-only/access contracts observed by this run.
- C2: required owned worker, Next process, fixture, connection and parent-environment cleanup.
- Required observations aggregate in fail > blocked > pass order. NOT RUN never counts as PASS.
- Browser DOM, native clients, repository command execution and production deployment are outside this scope.

## Test Target

Build identity: ${safe(input.build)}.
${input.run.dirty ? "The tested revision includes the working-tree changes present at rehearsal start; the commit alone does not identify the tested source." : "The source working tree was clean at rehearsal start."}

## Preconditions and Test Data

Full execution requires a fresh production build, migrated isolated TEST_DATABASE_URL distinct
from DATABASE_URL, and free loopback port 55455. Fixtures use synthetic users, projects and sessions.
Database URLs, credentials, tokens, cookies and raw HTTP responses are not retained.

## Test Matrix

| ID | Gate | Criterion | Case | Expected | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
${matrix}
| CLEANUP | required | C2 | Owned resource cleanup | owned resources settled | ${cleanupEvidence} | ${input.cleanup ? "PASS" : "FAIL"} |

## Commands and Static Checks

| ID | Gate | Command | Evidence | Verdict |
| --- | --- | --- | --- | --- |
| CMD1 | informational | Normalized replay manifest below | replay not executed | NOT RUN |

This is a replay recipe, not the original process argv or evidence of its exit code.
Select a new report path before replaying. Run the argument array from the repository
root without constructing a shell command. Required results come from the Test Matrix.

\`\`\`json
${JSON.stringify(replay, null, 2)}
\`\`\`

Static, architecture, build and browser gates are separate and are not inferred from CMD1.

## Evidence Registry

| ID | Observed | Reference | Retention |
| --- | --- | --- | --- |
${evidence}
| ${cleanupEvidence} | ${cleanupObservation} | CLEANUP | inline; retained with this report |

## Findings and Follow-up

${incomplete.length ? `Incomplete or failed observations: ${incomplete.join(", ")}. Re-run the affected criteria after resolving their recorded cause.` : input.results.length ? "No failed or unexecuted observations were recorded." : "HTTP/DB observations were not collected."}
${input.cleanup ? "" : "Cleanup requires investigation before another run reuses the environment."}

## Test Data and Cleanup

${input.cleanup ? "Owned resources were settled or no product resources were created before preparation stopped." : "Owned-resource cleanup was not confirmed; inspect the recorded failure before retrying."}
Existing reports and completed historical records are never overwritten by this command.

## Conclusion

The decision follows C1, C2 and the required verdicts above. This is the completed record of this
bounded execution, including a blocked or failed execution. Further testing uses a new output path.

## Review Checklist

- [x] Scope, required criteria, evidence and cleanup are recorded separately.
- [x] Run time and source revision come from this execution.
- [x] Raw credentials and responses are excluded from retained observations.
- [x] Unexecuted external gates are excluded from any HTTP result claim.
`;
}

export function writeWebHttpReport(input: ReportInput): void {
  const at = input.at ?? new Date();
  const path = newReportPath({ path: input.run.path, repository: input.run.repository, at });
  publishNewReport(path, renderWebHttpReport({ ...input, at }));
}
