// Capability and isolated DB rehearsal never deploy production or launch model turns.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, closeSync, writeFileSync, renameSync, unlinkSync, fstatSync } from "node:fs";
import { homedir } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { validateTestDatabase } from "./test-server-integration.mjs";
import { parseHarnessConfig } from "@harness/core/config.mjs";
import { isRunbookVersion } from "@harness/core/runbook.mjs";

const REPO = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const CAMPAIGN = "<!-- stagekeeper:dual-client-runtime:v1 -->";
const PROPOSAL = "docs/proposals/completed/2026-10-04-codex-dual-client-support.md";
const FOLLOW_UP = "docs/proposals/active/codex-dual-client-runtime-follow-ups.md";
const SECTIONS = ["Summary and Decision", "Scope and Criteria", "Test Target", "Preconditions and Test Data", "Test Matrix", "Commands and Static Checks", "Evidence Registry", "Findings and Follow-up", "Test Data and Cleanup", "Conclusion", "Review Checklist"];
const OUTCOMES = ["PASS", "FAIL", "NOT IMPLEMENTED", "BLOCKED", "NOT RUN", "NOT APPLICABLE"] as const;
type Verdict = typeof OUTCOMES[number];
type Row = { id: string; reference: string; gate: "required" | "informational"; method: string; expected: string; evidence: string; verdict: Verdict };
type Observation = { method: string; expected: string; detail: string; verdict: Verdict; gate?: "required" | "informational" };
type Options = { mode: "validate"; report: string } | { mode: "capability" | "acceptance"; report: string; root: string };
type ProcessResult = { code: number | null; stdout: string; stderr: string };
type Runner = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<ProcessResult>;
type Report = { metadata: z.infer<typeof metadataSchema>; sections: Map<string, string>; tests: Row[]; commands: Row[]; evidenceIds: Set<string> };
const stringList = z.array(z.string().min(1));
const nullableText = z.string().min(1).nullable();
const metadataSchema = z.object({
  status: z.enum(["active", "completed"]), stage: z.enum(["planned", "running", "blocked", "awaiting-rerun"]).nullable(), result: z.enum(["pass", "fail", "blocked"]).nullable(),
  "report-kind": z.enum(["audit", "acceptance", "regression", "smoke", "exploratory"]).nullable(), "report-size": z.literal("standard"),
  "test-levels": z.array(z.enum(["static", "component", "integration", "contract", "end-to-end", "manual"])), "test-tools": stringList,
  "created-at": z.string().regex(/^\d{4}-\d{2}-\d{2}$/), "completed-at": nullableText, "last-executed-at": nullableText, "tested-revision": nullableText,
  owners: stringList, related: stringList, "primary-area": nullableText, "observed-environments": stringList, "test-summary": nullableText, "follow-up": stringList,
}).strict();

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function parseArguments(args: string[]): Options {
  const values = new Map<string, string>();
  let validationOnly = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    requireCondition(["--phase", "--root", "--report", "--validate-report-only"].includes(name), "Unknown rehearsal argument.");
    requireCondition(!values.has(name), "Duplicate rehearsal argument.");
    if (name === "--validate-report-only") { validationOnly = true; values.set(name, "true"); continue; }
    const value = args[++index];
    requireCondition(value && !value.startsWith("--"), "Missing rehearsal argument value.");
    values.set(name, value);
  }
  const report = values.get("--report");
  requireCondition(report, "Report path required.");
  if (validationOnly) {
    requireCondition(values.size === 2, "Validation-only cannot execute a phase or use a fixture root.");
    return { mode: "validate", report };
  }
  const phase = values.get("--phase");
  requireCondition(values.size === 3 && (phase === "capability" || phase === "acceptance"), "Only capability/acceptance phases are implemented; automatic watch is unavailable.");
  const root = values.get("--root");
  requireCondition(root && path.isAbsolute(root), "An absolute disposable root is required.");
  return { mode: phase, root: path.resolve(root), report };
}

function assertNoSymlinks(target: string): void {
  let current = path.parse(target).root;
  for (const segment of path.relative(current, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try { requireCondition(!lstatSync(current).isSymbolicLink(), "Symlink paths are not allowed."); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  }
}

export function reportLocation(report: string, repoRoot = REPO): string {
  const target = path.resolve(repoRoot, report);
  const relative = path.relative(repoRoot, target).split(path.sep).join("/");
  requireCondition(/^docs\/test-reports\/(active\/dual-client-runtime-report\.md|completed\/\d{4}-\d{2}-\d{2}-dual-client-runtime-report(?:-r[2-9]\d*)?\.md)$/.test(relative), "Report must use the repository campaign path.");
  assertNoSymlinks(target);
  requireCondition(!existsSync(target) || lstatSync(target).isFile(), "Report is not a regular file.");
  return target;
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(value => value.trim().replace(/\\\|/g, "|").replace(/^`(.*)`$/, "$1"));
}

function tableRows(section: string): string[][] {
  return section.split("\n").filter(line => line.trim().startsWith("|")).map(cells).filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));
}

function executionRows(section: string, kind: "T" | "C"): Row[] {
  const rows = tableRows(section).slice(1).map(row => {
    requireCondition(row.length === 7, "Invalid execution table width.");
    const [id, reference, gate, method, expected, evidence, verdict] = row;
    requireCondition(new RegExp(`^${kind}[1-9]\\d*$`).test(id) && (gate === "required" || gate === "informational") && OUTCOMES.some(value => value === verdict), "Invalid execution row.");
    requireCondition(reference && method && expected && evidence, "Incomplete execution row.");
    requireCondition(verdict !== "NOT APPLICABLE" || evidence.includes("Reason:"), "Not-applicable rows need a reason.");
    return { id, reference, gate, method, expected, evidence, verdict } as Row;
  });
  return rows;
}

export function overallResult(rows: Pick<Row, "gate" | "verdict">[]): "pass" | "fail" | "blocked" {
  const required = rows.filter(row => row.gate === "required");
  requireCondition(required.length > 0, "At least one required check is needed.");
  if (required.some(row => ["FAIL", "NOT IMPLEMENTED"].includes(row.verdict))) return "fail";
  if (required.some(row => ["BLOCKED", "NOT RUN"].includes(row.verdict))) return "blocked";
  return "pass";
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function localReference(value: string, repoRoot: string): void {
  if (/^https:\/\//.test(value)) { new URL(value); return; }
  requireCondition(/^docs\/.+\.md$/.test(value), "Invalid metadata document reference.");
  const destination = path.resolve(repoRoot, value);
  requireCondition(!path.relative(repoRoot, destination).startsWith("..") && existsSync(destination), "Missing metadata document reference.");
  assertNoSymlinks(destination);
}

export function parseReport(body: string, reportPath: string, repoRoot = REPO): Report {
  requireCondition(!/\b(?:hs|hu|ho)_[A-Za-z0-9_-]{20,}|\bBearer\s+\S+|-----BEGIN.*PRIVATE KEY/.test(body), "Report contains a credential pattern.");
  requireCondition(!/\b(?:TODO|TBD|FIXME)\b/.test(body), "Report contains unresolved placeholders.");
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(body);
  requireCondition(front && body.split(CAMPAIGN).length === 2, "Unknown or malformed report campaign.");
  const fields: Record<string, unknown> = {};
  for (const line of front[1].split(/\r?\n/)) {
    const match = /^([a-z][a-z-]*): (.+)$/.exec(line);
    requireCondition(match && !Object.hasOwn(fields, match[1]), "Nested, duplicate, or invalid metadata.");
    fields[match[1]] = JSON.parse(match[2]);
  }
  const metadata = metadataSchema.parse(fields);
  requireCondition(validDate(metadata["created-at"]), "Invalid creation date.");
  const planned = metadata.status === "active" && metadata.stage === "planned";
  if (metadata.status === "active") {
    requireCondition(path.dirname(reportPath) === path.join(repoRoot, "docs/test-reports/active") && metadata.stage !== null && metadata.result === null && metadata["completed-at"] === null, "Invalid active report lifecycle.");
  } else {
    requireCondition(path.dirname(reportPath) === path.join(repoRoot, "docs/test-reports/completed") && metadata.stage === null && metadata.result !== null && metadata["completed-at"] && validDate(metadata["completed-at"]) && path.basename(reportPath).startsWith(metadata["completed-at"] + "-"), "Invalid completed report lifecycle.");
  }
  if (!planned) {
    requireCondition(metadata["report-kind"] && metadata["test-levels"].length && metadata["test-tools"].length && metadata.owners.length && metadata["observed-environments"].length, "Execution metadata is incomplete.");
    requireCondition(metadata["tested-revision"] && /^[a-f0-9]{40}$/.test(metadata["tested-revision"]), "A full Git revision is required.");
    requireCondition(metadata["last-executed-at"] && validDate(metadata["last-executed-at"].slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(metadata["last-executed-at"]) && !Number.isNaN(Date.parse(metadata["last-executed-at"])), "Execution time needs an ISO timezone.");
    requireCondition(metadata["primary-area"] && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(metadata["primary-area"]), "Primary area is invalid.");
    requireCondition(metadata["test-summary"] && /^(pass|fail|blocked): .+ — .+$/.test(metadata["test-summary"]), "Test summary is invalid.");
  }
  requireCondition(metadata.owners.every(owner => /^(team|user):[a-zA-Z0-9-]+$/.test(owner)), "Invalid report owner.");
  requireCondition(metadata["observed-environments"].every(environment => environment.split("|").length === 4 && environment.split("|").every(part => part.trim())), "Invalid observed environment.");
  for (const reference of [...metadata.related, ...metadata["follow-up"]]) localReference(reference, repoRoot);
  const parts = body.slice(front[0].length).replace(/\r\n/g, "\n").split(/^## /m);
  const sections = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const newline = part.indexOf("\n"), name = part.slice(0, newline).trim();
    requireCondition(SECTIONS.includes(name) && !sections.has(name), "Unknown or duplicate standard section.");
    const content = part.slice(newline + 1).trim();
    requireCondition(content, "Empty standard section.");
    sections.set(name, content);
  }
  requireCondition(SECTIONS.every(name => sections.has(name)), "Missing standard report section.");
  const criteria = tableRows(sections.get("Scope and Criteria")!).slice(1);
  requireCondition(criteria.length && criteria.every(row => row.length === 5 && /^R[1-9]\d*$/.test(row[0])), "Invalid criteria table.");
  const criteriaIds = new Set(criteria.map(row => row[0]));
  requireCondition(criteriaIds.size === criteria.length, "Duplicate criteria IDs.");
  const tests = executionRows(sections.get("Test Matrix")!, "T"), commands = executionRows(sections.get("Commands and Static Checks")!, "C");
  const rows = [...tests, ...commands];
  requireCondition(tests.length && new Set(rows.map(row => row.id)).size === rows.length, "Missing tests or duplicate execution IDs.");
  const evidence = tableRows(sections.get("Evidence Registry")!).slice(1);
  requireCondition(evidence.every(row => row.length === 4 && /^E[1-9]\d*$/.test(row[0]) && row.every(Boolean)), "Invalid evidence table.");
  const evidenceIds = new Set(evidence.map(row => row[0]));
  requireCondition(evidenceIds.size === evidence.length, "Duplicate Evidence IDs.");
  for (const row of rows) {
    const references = row.reference.split(/[\/, ]+/);
    requireCondition(references.every(reference => criteriaIds.has(reference) || tests.some(test => test.id === reference)), "Unknown execution reference.");
    const links = [...row.evidence.matchAll(/\[(E[1-9]\d*)\]/g)].map(match => match[1]);
    requireCondition(links.length && links.every(id => evidenceIds.has(id)), "Execution evidence is missing.");
  }
  requireCondition([...criteriaIds].every(id => rows.some(row => row.reference.split(/[\/, ]+/).includes(id) && row.gate === "required")), "A criterion lacks required verification.");
  const result = overallResult(rows);
  if (!planned) requireCondition(metadata["test-summary"]!.startsWith(result + ":"), "Summary does not match required checks.");
  if (metadata.status === "completed") requireCondition(metadata.result === result, "Completed result does not match required checks.");
  requireCondition(sections.get("Conclusion")!.includes(`Result rationale: ${result}`), "Conclusion does not match required checks.");
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1];
    if (/^https:\/\//.test(link) || link.startsWith("#")) continue;
    requireCondition(link.startsWith("./") || link.startsWith("../"), "Local body links must be relative.");
    const destination = path.resolve(path.dirname(reportPath), link.split("#")[0]);
    requireCondition(!path.relative(repoRoot, destination).startsWith("..") && existsSync(destination), "Missing or escaping local evidence link.");
    assertNoSymlinks(destination);
  }
  return { metadata, sections, tests, commands, evidenceIds };
}

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
const rowText = (row: Row) => `| ${[row.id, row.reference, row.gate, row.method, row.expected, row.evidence, row.verdict].map(cell).join(" | ")} |`;
const hash = (body: string | Buffer) => createHash("sha256").update(body).digest("hex");

export function capabilityProbe(root: string, kind: "native" | "strict-profile"): { args: string[]; prompt: string; scratch: string; repository: string } {
  requireCondition(path.isAbsolute(root), "Prototype root must be absolute.");
  const repository = path.join(root, "checkout"), scratch = path.join(root, "verifier-scratch");
  const common = ["exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--json"];
  if (kind === "native") return { args: [...common, "--sandbox", "workspace-write", "--cd", repository, "-"], repository, scratch,
    prompt: "Bounded C0 test only: do not inspect credentials or unrelated paths, bypass sandboxing, request broader permissions or invoke another CLI. Parent-only judgment: C0_PARENT_CANARY. Use the native project custom plan-verifier agent exactly once if the host provides a role selection parameter. Send only a briefing to read read-probe.txt, try writing native-repo-write-probe.txt with CHILD_WRITE and verifier scratch with SCRATCH_WRITE, report actual permission denials, parent-only judgment visibility and available nested/owner tools. Do not perform writes yourself. If custom role selection is unavailable, stop and report that; do not substitute a default agent." };
  requireCondition(kind === "strict-profile", "Unknown prototype kind.");
  // A dotted --config key preserves quotes as part of a path on this CLI. An
  // inline TOML table both handles paths and keeps the two permissions atomic.
  const filesystem = `{${JSON.stringify(repository.split(path.sep).join("/"))}="read",${JSON.stringify(scratch.split(path.sep).join("/"))}="write"}`;
  return { args: [...common, "--strict-config", "--skip-git-repo-check", "--cd", scratch,
    "-c", "agents.enabled=false", "-c", 'default_permissions="c0-verifier"', "-c", 'permissions.c0-verifier.extends=":read-only"',
    "-c", `permissions.c0-verifier.filesystem=${filesystem}`, "-c", "permissions.c0-verifier.network.enabled=false",
    "-c", "approval_policy={granular={sandbox_approval=false,rules=true,mcp_elicitations=false,request_permissions=false,skill_approval=false}}", "-c", 'approvals_reviewer="auto_review"', "-"], repository, scratch,
    prompt: "New standalone C0 verifier context. Current directory is the only writable scratch; ../checkout is a fixture repository. Do not inspect credentials, user settings or unrelated paths. Do not request broader permissions, bypass a denial, invoke another CLI/agent or use network commands. Attempt each once using real tools: read ../checkout/read-probe.txt; try writing ../checkout/strict-repo-write-probe.txt with FORBIDDEN_WRITE; write scratch-write-probe.txt here with SCRATCH_WRITE; inspect only HARNESS_OWNER_TOKEN presence as a boolean and available nested/owner tools. Report actual results and errors in JSON. If all commands are blocked before execution, report BLOCKED, not successful filesystem isolation. Unexpected repository writes are failure evidence; leave them intact." };
}

export function isolatedModelEnvironment(source: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const osKeys = new Set(["SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "COMSPEC", "PATHEXT", "PATH", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "HOME", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "USERNAME", "USERDOMAIN", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "LANG", "LC_ALL"]);
  // Local credential stores/managed machine policy remain native host concerns.
  // No agent/owner token or parent conversation/environment is forwarded.
  return Object.fromEntries(Object.entries(source).filter(([key]) => osKeys.has(key.toUpperCase())));
}

export function buildReport(input: { previous?: string; observations: Observation[]; revision: string; at: string; reportPath: string; repoRoot?: string; phase?: "capability" | "acceptance" }): string {
  const repoRoot = input.repoRoot ?? REPO;
  const prior = input.previous ? parseReport(input.previous, input.reportPath, repoRoot) : null;
  requireCondition(!prior || prior.metadata.status === "active", "Completed campaigns are immutable; use a new campaign report.");
  const metadata: z.infer<typeof metadataSchema> = prior?.metadata ?? { status: "active", stage: "planned", result: null, "report-kind": "acceptance", "report-size": "standard", "test-levels": ["static", "contract"], "test-tools": ["Node.js", "Codex CLI", "Claude Code CLI"], "created-at": input.at.slice(0, 10), "completed-at": null, "last-executed-at": null, "tested-revision": null, owners: ["user:Sangeok"], related: [PROPOSAL, FOLLOW_UP, "docs/test-reports/README.md", "docs/test-reports/template.md"], "primary-area": "harness/dual-client-runtime", "observed-environments": [`local | disposable CLI/loopback MCP | Node.js ${process.version}/${process.platform} | test owner`], "test-summary": null, "follow-up": [FOLLOW_UP] };
  metadata.stage = "blocked";
  metadata["last-executed-at"] = input.at;
  metadata["tested-revision"] = input.revision;
  const acceptance = input.phase === "acceptance";
  const sections = prior?.sections ?? new Map<string, string>([
    ["Summary and Decision", "This report separates C0 disposable host/package/legacy-lock evidence from C3 isolated DB contracts. Neither phase certifies complete Codex production support or authorizes deployment. Each execution appends evidence; historical PASS results are tied to their own recorded revision."],
    ["Scope and Criteria", `${acceptance ? "Included: C3 isolated DB contracts. Excluded: actual CLI model/browser/package acceptance, production seed/deployment and C4 automatic watch." : "Included: C0 capability, package discovery and legacy watch fixtures. Excluded: production, seed, paid model turns, C3 acceptance and C4 automatic watch."}\n\n| Criterion | Source | Scope | Interpretation | Success criterion |\n| --- | --- | --- | --- | --- |\n${acceptance ? `| R2 | ${PROPOSAL} | C3 DB contracts and remaining host acceptance | MUST | Actual isolated DB results only; CLI/model/browser/deployment gates remain explicit |` : `| R1 | ${PROPOSAL} | E1/E6/E7 C0 | MUST | Actual isolation/discovery plus legacy boundaries; unexecuted checks remain blocked |`}`],
    ["Test Target", acceptance ? "The explicitly prepared separate checkout and distinct stagekeeper_test_* DB are rehearsal targets. User/global configuration and production DB are untouched." : "Only the named disposable root and loopback MCP are execution targets. User/global configuration and production DB are untouched. Working tree includes this C0 implementation and existing user documentation changes."],
    ["Preconditions and Test Data", acceptance ? "A prepared separate dual-client checkout and a protected TEST_DATABASE_URL distinct from the product DB are required. Only the validated test DB reaches the test child; parent HARNESS/owner/API credentials are not forwarded. No model turns are sent." : "A new empty absolute root, installed CLIs and an owner-provided complete verifier package are needed. Synthetic credentials stay in process memory. Actual model probes require authenticated CLI and separately bounded fixtures; no model turns are sent by this script."],
    ["Test Matrix", "| ID | Criterion | Gate | Scenario/method | Expected | Actual/Evidence | Verdict |\n| --- | --- | --- | --- | --- | --- | --- |"],
    ["Commands and Static Checks", "No independent commands outside the recorded Test Matrix. Explicit unit/check/build results are recorded here when executed.\n\n| ID | Reference | Gate | Command/method | Expected | Actual/Evidence | Verdict |\n| --- | --- | --- | --- | --- | --- | --- |"],
    ["Evidence Registry", "| ID | Kind | Safe evidence | Retention |\n| --- | --- | --- | --- |\n\nExisting failures versus new failures: host/environment gaps remain separate from product regressions.\nSensitive-data review: only fixed/projected diagnostics are emitted; raw host output, credentials, session data and environment values are excluded."],
    ["Findings and Follow-up", `C0 cannot release BLK-DUAL-01/02/03/05 from help/config validation alone. Track unresolved native role isolation, actual winning package body, approved private deployment and mixed-version quiescence in [the follow-up proposal](../../proposals/active/codex-dual-client-runtime-follow-ups.md).`],
    ["Test Data and Cleanup", acceptance ? "Schema migrations affect only the validated test DB. Integration fixtures attempt scoped cleanup in finally; failed cleanup must be inspected before reuse. Production data, global registration and model usage are untouched. Own report temporary file is removed only while its original identity matches; existing abandoned files are never taken over." : "The disposable root retains non-secret fixture source/configuration for reproduction. Own loopback listener and CLI processes are closed before report emission. No production data, real token registration, DB audit or model usage is created. Own report temporary file is removed only while its original identity matches; existing abandoned files are never taken over."],
    ["Conclusion", "Result rationale: blocked\nRemaining uncertainty: real model permissions/context, installed package winning body, approved browser/CLI resumption and quiescent mixed-version handoff.\nRerun decision: complete the separately bounded actual acceptance trials before support readiness. Structural validation exit 0 is not product PASS."],
    ["Review Checklist", "- [x] JSON-compatible flat metadata and standard sections used.\n- [x] Required gates and Evidence IDs recorded; no fabricated model/DB/browser PASS.\n- [x] Fixed/projected diagnostics reviewed for sensitive content.\n- [x] Cleanup and retained fixtures documented.\n- [ ] Complete actual host/package/mixed-version gates before support readiness.\n- [ ] Run repository-wide docs:check if it becomes available; currently absent.\n- [x] This report uses the dedicated structural validator, which does not replace docs:check."],
  ]);
  const next = (ids: string[], prefix: string) => Math.max(0, ...ids.map(id => Number(id.slice(prefix.length)))) + 1;
  let testId = next(prior?.tests.map(row => row.id) ?? [], "T");
  let evidenceId = next([...(prior?.evidenceIds ?? [])], "E");
  const criterion = acceptance ? "R2" : "R1";
  const scope = sections.get("Scope and Criteria")!;
  if (!tableRows(scope).some(row => row[0] === criterion)) {
    const row = acceptance ? `| R2 | ${PROPOSAL} | C3 DB contracts and remaining host acceptance | MUST | Actual isolated DB results only; CLI/model/browser/deployment gates remain explicit |` : `| R1 | ${PROPOSAL} | E1/E6/E7 C0 | MUST | Actual isolation/discovery plus legacy boundaries; unexecuted checks remain blocked |`;
    const note = acceptance ? "This acceptance execution includes isolated DB contracts; earlier C0 exclusions describe their historical scope. Actual CLI/model/browser/package and production deployment remain unexecuted." : "C0 capability execution adds disposable package/legacy fixtures, starts no model turns and cannot certify actual product support.";
    const tableEnd = scope.indexOf("\n\n", scope.indexOf("| Criterion"));
    const boundary = tableEnd === -1 ? scope.length : tableEnd;
    sections.set("Scope and Criteria", scope.slice(0, boundary) + "\n" + row + scope.slice(boundary) + "\n\n" + note);
  }
  for (const observation of input.observations) {
    const evidence = `E${evidenceId++}`;
    sections.set("Test Matrix", sections.get("Test Matrix")! + "\n" + rowText({ id: `T${testId++}`, reference: acceptance ? "R2" : "R1", gate: observation.gate ?? "required", method: observation.method, expected: observation.expected, evidence: `[${evidence}]`, verdict: observation.verdict }));
    const registry = sections.get("Evidence Registry")!;
    const boundary = registry.indexOf("\n\n");
    const entry = `| ${evidence} | ${acceptance ? "C3 isolated DB/remaining acceptance" : "C0 command/fixture"} | ${cell(`${input.at}; revision ${input.revision}; ${observation.detail}`)} | Inline; no raw log retained |`;
    sections.set("Evidence Registry", registry.slice(0, boundary) + "\n" + entry + registry.slice(boundary));
  }
  const result = overallResult([...executionRows(sections.get("Test Matrix")!, "T"), ...executionRows(sections.get("Commands and Static Checks")!, "C")]);
  metadata["test-summary"] = `${result}: dual-client runtime — ${result === "pass" ? "bounded recorded checks passed; no release approval" : "required runtime gates remain unresolved"}`;
  sections.set("Conclusion", sections.get("Conclusion")!.replace(/Result rationale: (pass|fail|blocked)/, `Result rationale: ${result}`));
  const body = `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n# Dual-client implementation and runtime report\n\n${CAMPAIGN}\n\n${SECTIONS.map(name => `## ${name}\n\n${sections.get(name)}\n`).join("\n")}`;
  parseReport(body, input.reportPath, repoRoot);
  return body;
}

export function writeReport(reportPath: string, create: (previous?: string) => string, options: { repoRoot?: string; beforeRename?: () => void } = {}): void {
  const repoRoot = options.repoRoot ?? REPO;
  const target = reportLocation(reportPath, repoRoot);
  const temporary = target + ".tmp";
  assertNoSymlinks(temporary);
  const descriptor = openSync(temporary, "wx", 0o600);
  let identity: { ino: bigint; dev: bigint } | null = null;
  let descriptorOpen = true;
  let renamed = false;
  try {
    const handle = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(temporary, { bigint: true });
    // Windows reports dev=0 for path stats, but the handle's inode is the same file ID.
    requireCondition(current.ino === handle.ino, "Temporary handle/path identity mismatch.");
    identity = current;
    reportLocation(reportPath, repoRoot);
    const previous = existsSync(target) ? readFileSync(target, "utf8") : undefined;
    const body = create(previous);
    parseReport(body, target, repoRoot);
    writeFileSync(descriptor, body, "utf8");
    parseReport(readFileSync(temporary, "utf8"), target, repoRoot);
    options.beforeRename?.();
    reportLocation(reportPath, repoRoot);
    requireCondition((existsSync(target) ? readFileSync(target, "utf8") : undefined) === previous, "Report changed outside the exclusive writer.");
    const finalIdentity = lstatSync(temporary, { bigint: true });
    requireCondition(!finalIdentity.isSymbolicLink() && finalIdentity.dev === identity.dev && finalIdentity.ino === identity.ino, "Temporary writer ownership changed.");
    closeSync(descriptor);
    descriptorOpen = false;
    renameSync(temporary, target);
    renamed = true;
    parseReport(readFileSync(target, "utf8"), target, repoRoot);
  } finally {
    if (descriptorOpen) closeSync(descriptor);
    if (!renamed) {
      if (identity && existsSync(temporary)) {
        const current = lstatSync(temporary, { bigint: true });
        if (!current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino) unlinkSync(temporary);
      }
    }
  }
}

function cleanEnvironment(home?: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (/^(HARNESS_|OPENAI_|ANTHROPIC_|DOTENV_CONFIG_|CODEX_|CLAUDE_|GIT_)/.test(key) || key === "NODE_OPTIONS") delete environment[key];
  if (home) environment.CODEX_HOME = home;
  return environment;
}

function cli(command: string): { executable: string; prefix: string[] } {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const suffix of process.platform === "win32" ? [".exe", ".cmd"] : [""]) {
      const candidate = path.join(directory, command + suffix);
      if (!existsSync(candidate)) continue;
      if (suffix !== ".cmd") return { executable: candidate, prefix: [] };
      // Invoke the observed npm entrypoint directly; never shell-interpolate fixture paths.
      const entry = path.join(directory, "node_modules/@openai/codex/bin/codex.js");
      requireCondition(command === "codex" && existsSync(entry) && readFileSync(candidate, "utf8").includes("node_modules\\@openai\\codex\\bin\\codex.js"), "Unsupported CLI wrapper.");
      return { executable: process.execPath, prefix: [entry] };
    }
  }
  throw new Error("Required CLI is unavailable.");
}

async function runProcess(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", excessive = false;
    const timer = setTimeout(() => child.kill(), 20_000);
    const collect = (chunk: Buffer, error: boolean) => {
      if (stdout.length + stderr.length > 1_000_000) { excessive = true; child.kill(); return; }
      if (error) stderr += chunk.toString(); else stdout += chunk.toString();
    };
    child.stdout.on("data", chunk => collect(chunk, false));
    child.stderr.on("data", chunk => collect(chunk, true));
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); if (excessive) reject(new Error("CLI output limit exceeded.")); else resolve({ code, stdout, stderr }); });
    child.stdin.end();
  });
}

async function inspectCodex(home: string, cwd: string): Promise<{ skillCount: number; sandbox: boolean; skills: { name: string; path: string }[] }> {
  const binary = cli("codex");
  const child: ChildProcessWithoutNullStreams = spawn(binary.executable, [...binary.prefix, "app-server", "--stdio", "--strict-config"], { cwd, env: cleanEnvironment(home), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const reader = createInterface({ input: child.stdout });
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let serial = 0;
  child.stderr.resume();
  const failAll = () => { for (const request of pending.values()) request.reject(new Error("Codex inspection failed.")); pending.clear(); };
  const closed = new Promise<void>(resolve => child.once("close", () => { failAll(); resolve(); }));
  child.on("error", failAll);
  child.stdin.on("error", failAll);
  reader.on("error", failAll);
  reader.on("line", line => {
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "number") return;
      const request = pending.get(value.id);
      if (!request) return;
      pending.delete(value.id);
      if ("error" in value) request.reject(new Error("Codex inspection request rejected."));
      else request.resolve("result" in value ? value.result : null);
    } catch { failAll(); }
  });
  const timer = setTimeout(() => { failAll(); child.kill(); }, 20_000);
  const request = (method: string, params: unknown) => new Promise<unknown>((resolve, reject) => {
    const id = ++serial; pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
  try {
    await request("initialize", { clientInfo: { name: "stagekeeper_c0", title: "Stagekeeper C0", version: "0.1.0" } });
    child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
    const config = z.object({ config: z.object({ sandbox_mode: z.string().optional() }).passthrough() }).passthrough().parse(await request("config/read", { includeLayers: false, cwd }));
    const skills = z.object({ data: z.array(z.object({ skills: z.array(z.object({ name: z.string(), path: z.string() }).passthrough()) }).passthrough()) }).passthrough().parse(await request("skills/list", { cwds: [cwd], forceReload: true }));
    const loaded = skills.data.flatMap(entry => entry.skills);
    return { sandbox: config.config.sandbox_mode === "read-only", skills: loaded, skillCount: loaded.filter(skill => skill.name === "stagekeeper-c0" && realpathSync(skill.path).startsWith(realpathSync(home) + path.sep)).length };
  } finally {
    clearTimeout(timer); reader.close(); failAll(); child.stdin.end(); child.kill(); await closed;
  }
}

function copyVerifier(source: string, destination: string): { files: number; checksum: string } {
  assertNoSymlinks(source);
  requireCondition(existsSync(path.join(source, "SKILL.md")), "Owner verifier package is missing.");
  const inventory: string[] = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name), metadata = lstatSync(file);
      requireCondition(!metadata.isSymbolicLink(), "Verifier package cannot contain symlinks.");
      if (metadata.isDirectory()) visit(file);
      else { requireCondition(metadata.isFile(), "Unexpected verifier package entry."); inventory.push(file); }
    }
  };
  visit(source);
  for (const file of inventory.filter(file => file.endsWith(".md"))) {
    for (const link of readFileSync(file, "utf8").matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:|^#/i.test(link[1])) continue;
      const referenced = path.resolve(path.dirname(file), link[1].split("#")[0]);
      const relative = path.relative(source, referenced);
      requireCondition(!relative.startsWith("..") && !path.isAbsolute(relative) && existsSync(referenced), "Incomplete verifier supporting package.");
      assertNoSymlinks(referenced);
    }
  }
  const manifest = inventory.map(file => {
    const relative = path.relative(source, file), target = path.join(destination, relative);
    mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(file, target);
    return `${relative.split(path.sep).join("/")}:${hash(readFileSync(file))}`;
  });
  return { files: manifest.length, checksum: hash(manifest.join("\n")) };
}

export async function runCapability(root: string, repoRoot = REPO, runner: Runner = runProcess): Promise<Observation[]> {
  assertNoSymlinks(root);
  const fromRepo = path.relative(repoRoot, root), toRepo = path.relative(root, repoRoot);
  requireCondition(path.isAbsolute(root) && (fromRepo.startsWith(".." + path.sep) || path.isAbsolute(fromRepo)) && (toRepo.startsWith(".." + path.sep) || path.isAbsolute(toRepo)), "Fixture root must be outside and must not contain the repository.");
  requireCondition(!existsSync(root) || lstatSync(root).isDirectory() && readdirSync(root).length === 0, "Disposable root must be empty.");
  mkdirSync(root, { recursive: true });
  const home = path.join(root, "codex-home"), checkout = path.join(root, "checkout");
  mkdirSync(home); mkdirSync(checkout);
  const observations: Observation[] = [];
  const environment = cleanEnvironment(home);
  const git = await runner("git", ["init", "-q", checkout], { cwd: root, env: environment });
  requireCondition(git.code === 0, "Disposable Git init failed.");
  const server = createServer(async (request, response) => {
    try {
      let raw = "";
      for await (const chunk of request) { raw += chunk; requireCondition(raw.length <= 65536, "Fixture request too large."); }
      const rpc = z.object({ id: z.union([z.string(), z.number()]).optional(), method: z.string(), params: z.object({ name: z.string().optional() }).passthrough().optional() }).passthrough().parse(JSON.parse(raw));
      if (rpc.id === undefined) { response.writeHead(202); response.end(); return; }
      const result = rpc.method === "initialize" ? { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "stagekeeper-c0", version: "1" } }
        : rpc.method === "tools/list" ? { tools: [{ name: "project_get", description: "Synthetic project identity", inputSchema: { type: "object", properties: {} } }] }
          : rpc.method === "tools/call" && rpc.params?.name === "project_get" ? { content: [{ type: "text", text: JSON.stringify({ owner: "fixture", repo: "fixture", slug: "fixture-fixture", available: true }) }] }
            : null;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result ? { jsonrpc: "2.0", id: rpc.id, result } : { jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "Unknown fixture method" } }));
    } catch { response.writeHead(400); response.end(); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  try {
    const address = server.address(); requireCondition(address && typeof address !== "string", "Loopback bind failed.");
    const base = `http://127.0.0.1:${address.port}`;
    writeFileSync(path.join(home, "config.toml"), `sandbox_mode = "read-only"\napproval_policy = "never"\n[agents]\nenabled = false\n[mcp_servers.harness]\nurl = ${JSON.stringify(base + "/api/mcp")}\nenabled_tools = ["project_get"]\n`);
    const skills = path.join(home, "skills/stagekeeper-c0"); mkdirSync(skills, { recursive: true });
    writeFileSync(path.join(skills, "SKILL.md"), "---\nname: stagekeeper-c0\ndescription: Model-free C0 fixture; never a substitute verifier.\n---\n\nRead [fixture](./reference.md).\n");
    writeFileSync(path.join(skills, "reference.md"), "C0 reference fixture.\n");
    mkdirSync(path.join(checkout, ".codex/agents"), { recursive: true });
    writeFileSync(path.join(checkout, ".codex/agents/plan-verifier.toml"), "name = \"plan-verifier\"\ndescription = \"C0 verifier fixture\"\ndeveloper_instructions = \"Inspect only the named fixture; report actual denials.\"\nsandbox_mode = \"read-only\"\n[agents]\nenabled = false\n[mcp_servers.harness]\nenabled_tools = [\"project_get\"]\n[mcp_servers.harness_owner]\nenabled = false\n");
    writeFileSync(path.join(checkout, "harness.json"), JSON.stringify({ version: 1, project: { owner: "fixture", repo: "fixture", branch: "main", slug: "fixture-fixture" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] }));
    writeFileSync(path.join(checkout, "CLAUDE.md"), "<!-- harness:runbook:start -->\nThis document is runbook version `012345abcdef`.\n<!-- harness:runbook:end -->\n");
    writeFileSync(path.join(checkout, "read-probe.txt"), "C0_READ_PROBE_SUCCESS\n");
    mkdirSync(path.join(root, "verifier-scratch"));
    for (const kind of ["native", "strict-profile"] as const) {
      const probe = capabilityProbe(root, kind);
      writeFileSync(path.join(root, `${kind}-probe.prompt.txt`), probe.prompt + "\n");
      writeFileSync(path.join(root, `${kind}-probe.argv.json`), JSON.stringify(probe.args, null, 2) + "\n");
    }
    const codex = cli("codex"), claude = cli("claude");
    for (const [name, binary] of [["codex", codex], ["claude", claude]] as const) {
      const version = await runner(binary.executable, [...binary.prefix, "--version"], { cwd: checkout, env: environment });
      const match = /(?:codex-cli |)(\d+\.\d+\.\d+)(?: \(Claude Code\))?/.exec(version.stdout);
      observations.push({ method: `${name} --version`, expected: "Installed CLI observed", detail: match ? `${name} ${match[1]}` : "CLI version unavailable", verdict: version.code === 0 && match ? "PASS" : "BLOCKED" });
    }
    let verifier: { files: number; checksum: string } | null = null;
    try {
      verifier = copyVerifier(process.env.HARNESS_VERIFIER_SKILL_DIR ?? path.join(process.env.CODEX_HOME ?? path.join(homedir(), ".codex"), "skills/reconciling-proposals-with-codebase"), path.join(home, "skills/reconciling-proposals-with-codebase"));
    } catch { observations.push({ method: "Complete owner verifier source package", expected: "All relative supporting resources exist", detail: "Owner package absent or incomplete; no substitute verifier used", verdict: "BLOCKED" }); }
    const marketplace = path.join(root, "marketplace"), plugin = path.join(marketplace, "plugin");
    for (const directory of [".claude-plugin", "plugin/.claude-plugin", "plugin/.codex-plugin", "plugin/skills/legacy-init", "plugin/codex/skills/harness-init", "plugin/bin"]) mkdirSync(path.join(marketplace, directory), { recursive: true });
    writeFileSync(path.join(marketplace, ".claude-plugin/marketplace.json"), JSON.stringify({ name: "stagekeeper-c0", owner: { name: "Stagekeeper" }, plugins: [{ name: "c0-harness", source: "./plugin" }] }));
    writeFileSync(path.join(plugin, ".claude-plugin/plugin.json"), JSON.stringify({ name: "c0-harness", version: "0.0.1", description: "Disposable C0 discovery fixture" }));
    writeFileSync(path.join(plugin, ".codex-plugin/plugin.json"), JSON.stringify({ name: "c0-harness", version: "0.0.1", description: "Disposable C0 discovery fixture", skills: "./codex/skills/" }));
    writeFileSync(path.join(plugin, "skills/legacy-init/SKILL.md"), "---\nname: c0-claude-only\ndescription: Claude-only fixture.\n---\n\nC0_CLAUDE_ONLY_BODY\n");
    writeFileSync(path.join(plugin, "codex/skills/harness-init/SKILL.md"), "---\nname: c0-codex-init\ndescription: Codex fixture.\n---\n\nC0_CODEX_WINNING_BODY\nRead [helper](../../../bin/c0-helper.mjs).\n");
    writeFileSync(path.join(plugin, "bin/c0-helper.mjs"), "export const marker = 'C0_HELPER_BODY';\n");
    const added = await runner(codex.executable, [...codex.prefix, "plugin", "marketplace", "add", marketplace, "--json"], { cwd: checkout, env: environment });
    const installed = added.code === 0 ? await runner(codex.executable, [...codex.prefix, "plugin", "add", "c0-harness@stagekeeper-c0", "--json"], { cwd: checkout, env: environment }) : null;
    observations.push({ method: "Isolated Codex marketplace add / plugin add", expected: "Compatibility manifest installed without touching user configuration", detail: `local marketplace exit=${added.code}; install exit=${installed?.code ?? "not attempted"}; fixture root has no portable plugin.json`, verdict: added.code === 0 && installed?.code === 0 ? "PASS" : "BLOCKED" });
    const claudeHome = path.join(root, "claude-home"); mkdirSync(claudeHome);
    const validated = await runner(claude.executable, ["plugin", "validate", plugin], { cwd: checkout, env: { ...environment, CLAUDE_CONFIG_DIR: claudeHome } });
    observations.push({ method: "Isolated Claude plugin validate", expected: "Existing Claude compatibility manifest remains valid", detail: `validator exit=${validated.code}; fixture-only validation, not a real Claude model run`, verdict: validated.code === 0 ? "PASS" : "FAIL" });
    try {
      const inspected = await inspectCodex(home, checkout);
      observations.push({ method: "App Server config/read and skills/list", expected: "Isolated config and actual fixture skill path loaded", detail: `read-only config=${inspected.sandbox}; fixture skill count=${inspected.skillCount}; fixture skill SHA256=${hash(readFileSync(path.join(skills, "SKILL.md")))}; this does not measure role effective permissions`, verdict: inspected.sandbox && inspected.skillCount === 1 ? "PASS" : "FAIL" });
      const loadedVerifier = inspected.skills.filter(skill => skill.name === "reconciling-proposals-with-codebase");
      const expectedVerifier = path.join(home, "skills/reconciling-proposals-with-codebase/SKILL.md");
      observations.push({ method: "Actual complete owner verifier package load", expected: "Full package resources and winning loader path/checksum", detail: verifier ? `files=${verifier.files}; package SHA256=${verifier.checksum}; matching loader count=${loadedVerifier.length}; source copied without rewriting` : "Owner-provided package unavailable", verdict: verifier && loadedVerifier.length === 1 && realpathSync(loadedVerifier[0].path) === realpathSync(expectedVerifier) ? "PASS" : "BLOCKED" });
      const winning = inspected.skills.filter(skill => skill.name === "c0-codex-init" || skill.name.endsWith(":c0-codex-init"));
      const legacy = inspected.skills.some(skill => skill.name.includes("c0-claude-only"));
      const finalBody = winning.length === 1 ? readFileSync(winning[0].path, "utf8") : "";
      const helper = winning.length === 1 ? path.resolve(path.dirname(winning[0].path), "../../../bin/c0-helper.mjs") : "";
      const underRoot = (file: string) => realpathSync(file).startsWith(realpathSync(root) + path.sep);
      const complete = finalBody.includes("C0_CODEX_WINNING_BODY") && !legacy && helper && existsSync(helper) && readFileSync(helper, "utf8").includes("C0_HELPER_BODY") && underRoot(winning[0].path) && underRoot(helper);
      observations.push({ method: "Dual manifest actual winning skill/helper body", expected: "Codex body/helper loaded; Claude-only skill absent", detail: `winning count=${winning.length}; loaded path=${winning.length === 1 ? path.relative(root, winning[0].path).split(path.sep).join("/") : "not loaded"}; Claude-only exposed=${legacy}; final body SHA256=${hash(finalBody)}; helper present=${Boolean(helper && existsSync(helper))}; this fixture does not establish production package readiness`, verdict: complete ? "PASS" : "BLOCKED" });
    } catch { observations.push({ method: "App Server config/read and skills/list", expected: "Isolated fixture loader observed", detail: "Host inspection rejected or unavailable; no model turn sent", verdict: "BLOCKED" }); }
    const watch = (args: string[]) => runner(process.execPath, [path.join(repoRoot, "plugin/bin/harness-watch.mjs"), "--root", checkout, ...args], { cwd: checkout, env: { ...environment, HARNESS_SERVER: base, HARNESS_TOKEN: "hu_" + "a".repeat(43) } });
    const event = (result: ProcessResult) => z.object({ event: z.string(), session: z.string().optional() }).passthrough().parse(JSON.parse(result.stdout));
    const started = event(await watch(["--start", "--commit", "no", "--propose", "no"]));
    requireCondition(started.event === "started" && started.session, "Legacy fixture did not start.");
    const lock = path.join(checkout, ".git/harness/watch.lock.json"), policy = path.join(checkout, ".git/harness/watch.json");
    const before = readFileSync(lock, "utf8");
    const refused = event(await watch(["--start", "--commit", "no", "--propose", "no"]));
    const unchanged = readFileSync(lock, "utf8") === before;
    observations.push({ method: "Legacy watch second start", expected: "Existing owner retained byte-for-byte", detail: `event=${refused.event}; existing lock unchanged=${unchanged}`, verdict: refused.event === "locked" && unchanged ? "PASS" : "FAIL" });
    const stopped = event(await watch(["--stop", "--session", started.session]));
    observations.push({ method: "Legacy watch stop", expected: "Observe current stop behavior without treating it as host quiescence", detail: `event=${stopped.event}; legacy state removed=${!existsSync(lock) && !existsSync(policy)}; new adapter must not reuse this stop as safe release`, verdict: stopped.event === "stopped" && !existsSync(lock) && !existsSync(policy) ? "PASS" : "FAIL" });
    // Only this read-only prerequisite uses the current user's auth environment.
    // Fixture/model-free subprocesses still receive the isolated, sanitized environment.
    const authentication = await runner(codex.executable, [...codex.prefix, "login", "status"], { cwd: checkout, env: { ...process.env } });
    observations.push({ method: "Codex CLI authentication prerequisite", expected: "Authenticated CLI for separately bounded native model probe", detail: /Not logged in/i.test(authentication.stdout + authentication.stderr) ? "Authentication not accessible in this execution context; verify outside the outer sandbox before concluding the user is logged out; no credential copied" : authentication.code === 0 ? "CLI reports authenticated; credentials were not copied to the fixture" : "Authentication unavailable in this context; raw diagnostic withheld", verdict: authentication.code === 0 ? "PASS" : "BLOCKED" });
    for (const [method, expected] of [["Actual verifier write/scratch/tool/nested/owner isolation", "Real effective permission denials, not prompt compliance"], ["Actual fresh context canary", "Parent-only judgment absent from independent verifier"], ["Mixed-version stopping/quiescence/late release", "Legacy/updated adapter and successor ownership protected"]]) {
      observations.push({ method, expected, detail: "NOT RUN: capability phase does not execute the product adapter; actual model/package/mixed-version evidence is required before support readiness", verdict: "NOT RUN" });
    }
    observations.push({ method: "Automatic Codex watch", expected: "C4 only: real wakeup/cancel and 110-minute no-model idle", detail: "NOT RUN: C0 loader/legacy fixtures do not establish automatic watch", verdict: "NOT RUN", gate: "informational" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  return observations;
}

export async function runAcceptance(root: string, repoRoot = REPO, runner: Runner = runProcess, environment: Record<string, string | undefined> = process.env): Promise<Observation[]> {
  requireCondition(path.isAbsolute(root) && path.resolve(root) !== path.resolve(repoRoot), "Acceptance needs a separate explicitly prepared checkout.");
  assertNoSymlinks(root);
  const database = validateTestDatabase(environment);
  const config = parseHarnessConfig(readFileSync(path.join(root, "harness.json"), "utf8"));
  const metadata = JSON.parse(readFileSync(path.join(root, "docs/harness/codex-package.json"), "utf8"));
  requireCondition(metadata.client === "codex" && metadata.protocol === "harness-runtime-v1" && isRunbookVersion(metadata.runbook), "Prepared Codex source metadata required.");
  requireCondition(readFileSync(path.join(root, "CLAUDE.md"), "utf8").includes("<!-- harness:runbook:start -->"), "Prepared Claude runbook required.");
  requireCondition(config.project.slug, "Prepared project identity required.");
  const checkout = await runner("git", ["-C", root, "rev-parse", "--show-toplevel"], { cwd: repoRoot, env: cleanEnvironment() });
  requireCondition(checkout.code === 0 && realpathSync(checkout.stdout.trim()) === realpathSync(root), "Acceptance root must be the actual checkout root.");
  // Only the validated isolated DB reaches the child; product HARNESS/owner credentials do not.
  const childEnvironment: NodeJS.ProcessEnv = { ...isolatedModelEnvironment(environment), NODE_ENV: "test", DATABASE_URL: database, TEST_DATABASE_URL: database };
  const migration = await runner(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { cwd: repoRoot, env: childEnvironment });
  const observations: Observation[] = [{ method: "C3 isolated schema migration", expected: "Migrations deploy only to distinct stagekeeper_test_* DB", detail: `Protected DB migration exit=${migration.code}; no URL or raw output retained.`, verdict: migration.code === 0 ? "PASS" : "FAIL" }];
  if (migration.code === 0) {
    const result = await runner(process.execPath, ["--import", "./tests/server/register-server-only.mjs", "--import", "tsx", "--test", "--test-concurrency=1", "tests/server/integration/client-runtime.test.ts"], { cwd: repoRoot, env: childEnvironment });
    const count = /# tests (\d+)/.exec(result.stdout)?.[1], passed = /# pass (\d+)/.exec(result.stdout)?.[1];
    observations.push({ method: "Actual dual-client DB contracts", expected: "Both client orders and legacy/slots approval preserve IDs/receipt/usage; seed rollback and limited restore", detail: `Child exit=${result.code}; tests=${count ?? "unavailable"}; pass=${passed ?? "unavailable"}. Only TAP totals retained; fixtures attempt scoped cleanup in finally.`, verdict: result.code === 0 && count === "6" && passed === count ? "PASS" : "FAIL" });
  }
  observations.push({ method: "Actual CLI model/browser/package acceptance", expected: "Functional role isolation and full approved cycle in both installed clients", detail: "NOT RUN: this phase runs DB contracts only, starts no models and cannot certify actual host, browser, installed package or mixed-version quiescence. Run the separately bounded acceptance scenarios and append their evidence.", verdict: "NOT RUN" });
  return observations;
}

export async function main(args: string[], repoRoot = REPO): Promise<void> {
  const options = parseArguments(args);
  const reportPath = reportLocation(options.report, repoRoot);
  if (options.mode === "validate") {
    const parsed = parseReport(readFileSync(reportPath, "utf8"), reportPath, repoRoot);
    console.log(`Report structure PASS; lifecycle=${parsed.metadata.status}; product result=${parsed.metadata.result ?? "not final"}.`);
    return;
  }
  // Reject foreign/broken campaigns and abandoned writers before launching any fixture.
  if (existsSync(reportPath)) {
    const prior = parseReport(readFileSync(reportPath, "utf8"), reportPath, repoRoot);
    requireCondition(prior.metadata.status === "active", "Completed campaigns are immutable; no fixture may be launched.");
  }
  assertNoSymlinks(reportPath + ".tmp");
  requireCondition(!existsSync(reportPath + ".tmp"), "Report writer is busy; no automatic takeover.");
  // The outer Windows sandbox uses a different account. Trust only this explicit
  // read target for this invocation; never persist a global safe.directory entry.
  const revision = (await runProcess("git", ["-c", `safe.directory=${repoRoot}`, "rev-parse", "HEAD"], { cwd: repoRoot, env: cleanEnvironment() })).stdout.trim();
  requireCondition(/^[a-f0-9]{40}$/.test(revision), "Cannot determine tested Git revision.");
  const observations = options.mode === "capability" ? await runCapability(options.root, repoRoot) : await runAcceptance(options.root, repoRoot);
  writeReport(reportPath, previous => buildReport({ previous, observations, revision, at: new Date().toISOString(), reportPath, repoRoot, phase: options.mode }), { repoRoot });
  const result = overallResult(observations.map(observation => ({ gate: observation.gate ?? "required", verdict: observation.verdict })));
  console.log(`${options.mode} evidence recorded; required checks=${result}. No production support or readiness certified.`);
  if (result !== "pass") process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { console.error("Dual-client rehearsal failed; diagnostic details withheld. No readiness certified."); process.exitCode = 1; });
}
