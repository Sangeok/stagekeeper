import assert from "node:assert/strict";
import { it } from "node:test";
import { clientTarget, evidenceDigest, evaluateClientCandidate, normalizeClientEvidence } from "./client-ci-contract.mjs";

const sha = digit => digit.repeat(40);
const hash = digit => digit.repeat(64);
const resources = ["client", "workspace", "server", "database", "fixture"];
const execution = (attempt = 1, leg = "windows_codex_init") => ({
  repository: "Sangeok/stagekeeper-codex-ci", workflow: ".github/workflows/codex-ci.yml", workflowCommit: sha("a"), runId: "42975322701", attempt, job: "codex", leg,
});
const target = () => ({
  client: "codex", os: "win32", architecture: "x64", phase: "init", scenario: "new-user", installChannel: "bundle",
  identity: { pluginCommit: sha("b"), pluginVersion: "0.6.14", serverCommit: sha("c"), templatesCommit: sha("d"), payloadSha256: hash("1"), packageSha256: hash("2"), runtimeSha256: hash("3"), verifierSha256: hash("4") },
});
const evidence = () => ({
  schema: 2, target: target(), execution: execution(), clientVersion: "0.167.1", osVersion: "10.0.26100", result: "pass",
  checks: ["loader", "inventory", "empty-cache", "dry-run", "connected", "preserved-files", "no-global-node"].map(name => ({ name, result: "pass" })),
  cleanup: resources.map(resource => ({ resource, result: "pass" })),
  measurement: { seconds: 40, modelCalls: 0, costUsd: 0, models: [] },
  diagnostics: { harnessErrors: {}, stepRefusals: 0, roleDispatches: {}, additionalRoleStarts: {}, mainLoopStarts: 0, roleToolFailures: 0, mainLoopToolRefusals: 0, reviewRequired: false },
});
function input(value = evidence()) {
  const { repository, workflow, workflowCommit, job, leg } = value.execution;
  return {
    expected: [{ target: structuredClone(value.target), source: { repository, workflow, workflowCommit, job, leg }, resources: value.cleanup.map(entry => entry.resource) }],
    records: [{ publication: { ...execution(), job: "record", leg: "record" }, evidence: value }],
    executions: [{ execution: value.execution, target: value.target, sequence: 1, conclusion: "success", evidenceSha256: evidenceDigest(value) }],
  };
}
function refresh(candidate) {
  for (const record of candidate.records) {
    const origin = candidate.executions.find(entry => JSON.stringify(entry.execution) === JSON.stringify(record.evidence.execution));
    if (origin) origin.evidenceSha256 = evidenceDigest(record.evidence);
  }
  return candidate;
}
function rejected(candidate, code) {
  const verdict = evaluateClientCandidate(candidate);
  assert.equal(verdict.result, "fail");
  assert.ok(verdict.findings.some(finding => finding.code === code), JSON.stringify(verdict.findings));
}

it("requires an explicit expected set and independently collected execution evidence", () => {
  assert.equal(evaluateClientCandidate(input()).result, "pass");
  rejected({ ...input(), expected: [] }, "expected-set");
  rejected({ ...input(), executions: [] }, "trusted-executions");
  rejected({ ...input(), records: [] }, "missing-evidence");
  rejected({ ...input(), records: [{ publication: execution(), evidence: { result: "pass" } }] }, "evidence-schema");
  assert.throws(() => normalizeClientEvidence({ result: "fail", phase: "init", platform: "win32" }), /evidence-schema/);
});

it("requires every OS/client/architecture/channel/scenario combination", () => {
  const candidate = input();
  candidate.expected.push({ ...structuredClone(candidate.expected[0]), target: { ...target(), os: "darwin", architecture: "arm64" }, source: { ...candidate.expected[0].source, leg: "macos_codex_init" } });
  rejected(candidate, "missing-leg");
  rejected({ ...input(), expected: [input().expected[0], input().expected[0]] }, "duplicate-expected-leg");
  for (const field of ["architecture", "os", "client", "installChannel"]) {
    const record = evidence();
    delete record.target[field];
    assert.throws(() => normalizeClientEvidence(record));
  }
});

it("does not exchange server/plugin/template/package identity or accept a different workflow", () => {
  for (const field of ["serverCommit", "pluginCommit", "templatesCommit", "payloadSha256", "packageSha256", "runtimeSha256", "verifierSha256"]) {
    const candidate = input();
    candidate.expected[0].target.identity[field] = field.endsWith("Commit") ? sha("f") : hash("f");
    rejected(candidate, "identity-mismatch");
  }
  const candidate = input();
  candidate.expected[0].source.workflowCommit = sha("f");
  rejected(candidate, "missing-leg");
  const forged = input();
  forged.records[0].evidence.target.identity.serverCommit = sha("f");
  rejected(forged, "unverified-evidence");
});

it("fails closed for unfinished jobs, failed legs, missing checks and cleanup", () => {
  for (const conclusion of ["failure", "cancelled", "skipped", "running"]) rejected({ ...input(), executions: [{ ...input().executions[0], conclusion }] }, "job-not-successful");
  for (const result of ["fail", "cancelled", "skipped", "running"]) {
    const value = evidence(); value.result = result;
    rejected(input(value), "leg-not-successful");
  }
  const value = evidence(); value.checks.pop();
  rejected(input(value), "incomplete-checks");
  const cleanup = input(); cleanup.records[0].evidence.cleanup[0].result = "preserved";
  rejected(refresh(cleanup), "cleanup-incomplete");
  const omitted = input(); omitted.records[0].evidence.cleanup.pop();
  rejected(refresh(omitted), "cleanup-incomplete");
  const concealed = input(); concealed.expected[0].resources = ["workspace"];
  rejected(concealed, "expected-resource-coverage");
});

it("requires explicit previous installation provenance and distinguishes rebuilt and released payloads", () => {
  const value = evidence(); value.target.scenario = "update";
  assert.throws(() => normalizeClientEvidence(value), /plugin-commit/);
  value.target.identity.previous = { ...value.target.identity, pluginCommit: sha("e"), kind: "rebuilt-fixture" };
  value.checks = value.checks.filter(entry => entry.name !== "empty-cache");
  value.checks.push({ name: "previous-connected", result: "pass" }, { name: "pins-preserved", result: "pass" });
  const candidate = input(value);
  assert.equal(evaluateClientCandidate(candidate).result, "pass");
  candidate.expected[0].target.identity.previous.kind = "release-artifact";
  rejected(candidate, "identity-mismatch");
});

it("does not require generated bundle fields from Claude source installs", () => {
  const value = evidence(); value.target.client = "claude"; value.target.installChannel = "github-branch";
  for (const field of ["packageSha256", "runtimeSha256", "verifierSha256"]) value.target.identity[field] = "not-applicable:source-channel";
  value.checks = value.checks.filter(entry => entry.name !== "no-global-node");
  assert.equal(evaluateClientCandidate(input(value)).result, "pass");
  value.target.client = "codex";
  assert.throws(() => normalizeClientEvidence(value), /codex-bundle-required/);
});

function evaluation() {
  const value = evidence();
  value.target = { client: "claude", os: "darwin", architecture: "arm64", phase: "eval", scenario: "init-skill", installChannel: "source-copy", identity: { pluginCommit: sha("b"), pluginVersion: "0.6.14", fixtureCommit: sha("b"), copySha256: hash("1"), serverCommit: "not-applicable:source-copy-eval", templatesCommit: "not-applicable:source-copy-eval" } };
  value.checks = ["control", "required-cases"].map(name => ({ name, result: "pass" }));
  value.cleanup = ["client", "workspace"].map(resource => ({ resource, result: "pass" }));
  value.evaluation = { controlPassed: true, selection: "gate", cases: ["first-connection-asks-before-register", "first-connection-asks-before-writing", "rerun-asks-first"].map(name => ({ name, runs: 3, failedRuns: 0 })) };
  value.measurement = { seconds: 600, modelCalls: 10, models: ["claude-opus-5-5", "claude-haiku-5-5"], costUsd: null };
  return value;
}

it("recognizes source-copy evaluation without fabricating server identity and rejects partial cases", () => {
  const value = evaluation();
  assert.equal(evaluateClientCandidate(input(value)).result, "pass");
  for (const mutate of [
    entry => { entry.controlPassed = false; }, entry => { entry.selection = "case"; },
    entry => { entry.cases.pop(); }, entry => { entry.cases[0].runs = 1; }, entry => { entry.cases[0].failedRuns = 1; },
  ]) {
    const partial = evaluation(); mutate(partial.evaluation);
    rejected(input(partial), "incomplete-evaluation");
  }
  value.target.identity.serverCommit = sha("c");
  assert.throws(() => clientTarget(value.target), /eval-server-identity/);
  const missing = evaluation(); delete missing.target.identity.templatesCommit;
  assert.throws(() => normalizeClientEvidence(missing), /eval-template-identity/);
});

it("never converts auth smoke workflow identity into product identity", () => {
  const value = evidence();
  value.target = { ...value.target, phase: "auth", scenario: "auth", installChannel: "none", identity: { executableSha256: hash("1"), serverCommit: "not-applicable:auth-only", templatesCommit: "not-applicable:auth-only", pluginCommit: "not-applicable:auth-only" } };
  value.checks = ["model-completed", "auth-boundary"].map(name => ({ name, result: "pass" }));
  value.cleanup = [{ resource: "client", result: "pass" }];
  value.measurement = { seconds: 20, modelCalls: 1, costUsd: null, models: ["gpt-6"] };
  assert.equal(evaluateClientCandidate(input(value)).result, "pass");
  value.target.identity.pluginCommit = value.execution.workflowCommit;
  assert.throws(() => normalizeClientEvidence(value), /auth-product-identity/);
});

it("deduplicates record-only reruns without changing the original execution or its usage", () => {
  const candidate = input(evaluation());
  candidate.records.push({ ...candidate.records[0], publication: { ...candidate.records[0].publication, attempt: 2 } });
  const verdict = evaluateClientCandidate(candidate);
  assert.equal(verdict.result, "pass");
  assert.equal(verdict.selected.length, 1);
  assert.equal(verdict.selected[0].execution.attempt, 1);
  assert.equal(verdict.selected[0].publications, 2);
  assert.equal(verdict.selected[0].measurement.modelCalls, 10);
  assert.equal(verdict.selected[0].measurement.costUsd, null);
  const duplicate = structuredClone(candidate.records[0]); duplicate.evidence.result = "fail";
  candidate.records.push(duplicate);
  rejected(candidate, "unverified-evidence");
});

it("rejects missing provenance, duplicate executions and fabricated attempt changes", () => {
  const candidate = input(); candidate.records[0].evidence.execution.attempt = 2;
  rejected(candidate, "unverified-evidence");
  rejected({ ...input(), executions: [input().executions[0], input().executions[0]] }, "duplicate-execution");
  const missing = input(); delete missing.records[0].publication;
  rejected(missing, "execution-repository");
});

it("cannot select an old green after a newer failed execution even if it left no output", () => {
  const candidate = input(evaluation());
  candidate.executions.push({ ...candidate.executions[0], execution: { ...candidate.executions[0].execution, attempt: 2 }, sequence: 2, conclusion: "failure", evidenceSha256: null });
  rejected(candidate, "missing-evidence");
});

it("ties diagnostic review to the exact execution and result", () => {
  const value = evaluation(); value.diagnostics.stepRefusals = 1;
  const candidate = input(value);
  assert.equal(normalizeClientEvidence(value).diagnostics.reviewRequired, true);
  rejected(candidate, "review-unresolved");
  const review = { execution: value.execution, evidenceSha256: evidenceDigest(value), reviewer: "Sangeok", recordId: "319", decision: "accepted" };
  candidate.reviews = [{ ...review, evidenceSha256: hash("f") }];
  rejected(candidate, "review-unresolved");
  candidate.reviews = [review];
  assert.equal(evaluateClientCandidate(candidate).result, "pass");
  for (const diagnostics of [{ roleToolFailures: 1 }, { mainLoopToolRefusals: 1 }, { additionalRoleStarts: { "feature-scout": 1 } }]) {
    const extra = evaluation(); Object.assign(extra.diagnostics, diagnostics);
    const normalized = normalizeClientEvidence(extra);
    assert.equal(normalized.diagnostics.reviewRequired, true);
    for (const [name, expected] of Object.entries(diagnostics)) assert.deepEqual(normalized.diagnostics[name], expected);
    rejected(input(extra), "review-unresolved");
  }
});

it("allows one reviewed external model retry and preserves the original failed attempt", () => {
  const first = evaluation(); first.result = "fail";
  const candidate = input(first); candidate.executions[0].conclusion = "failure";
  const second = evaluation(); second.execution.attempt = 2;
  candidate.records.push({ publication: { ...execution(2), job: "record", leg: "record" }, evidence: second });
  candidate.executions.push({ execution: second.execution, target: second.target, sequence: 2, conclusion: "success", evidenceSha256: evidenceDigest(second) });
  rejected(candidate, "retry-unreviewed");
  candidate.retries = [{ previous: first.execution, selected: second.execution, reason: "external-cause", reviewer: "Sangeok", recordId: "320" }];
  assert.equal(evaluateClientCandidate(candidate).result, "pass");
  candidate.executions.push({ ...candidate.executions[0], execution: { ...execution(3) }, sequence: 0 });
  rejected(candidate, "retry-limit");
});

it("rejects model work in init and strips non-allowlisted data without echoing it in errors", () => {
  const value = evidence(); value.measurement.modelCalls = 1;
  rejected(input(value), "init-used-models");
  const clean = evidence(); clean.rawTranscript = "secret-canary"; clean.diagnostics.message = "secret-canary";
  assert.equal(JSON.stringify(normalizeClientEvidence(clean)).includes("secret-canary"), false);
  const candidate = input(); candidate.records[0].evidence.result = "secret-canary";
  const verdict = evaluateClientCandidate(candidate);
  assert.equal(verdict.result, "fail");
  assert.equal(JSON.stringify(verdict).includes("secret-canary"), false);
});

it("requires accepted pipeline roles, the tested implementation commit and lifecycle checks", () => {
  const value = evidence();
  value.target.phase = "pipeline"; value.target.scenario = "slug";
  value.checks = ["loader", "inventory", "dry-run", "connected", "preserved-files", "no-global-node", "accepted-roles", "plan-report-commit", "independent-cases", "tests", "owner-gate", "stop-resume", "no-duplicate-results"].map(name => ({ name, result: "pass" }));
  value.cleanup.push(...["runner", "processes", "locks", "browser"].map(resource => ({ resource, result: "pass" })));
  value.measurement = { seconds: 600, modelCalls: null, costUsd: null, models: ["gpt-6"] };
  value.pipeline = { planCommit: sha("e"), implementationCommit: sha("f"), reportCommit: sha("f"), testedCommit: sha("f"), roles: ["work-assigner", "app-dev", "plan-verifier", "impl-verifier", "doc-auditor", "qa-verifier", "feature-scout"].map(name => ({ name, outcome: "accepted" })) };
  value.diagnostics.roleDispatches = Object.fromEntries(value.pipeline.roles.map(role => [role.name, 1]));
  assert.equal(evaluateClientCandidate(input(value)).result, "pass");
  const incomplete = structuredClone(value); incomplete.pipeline.roles.pop();
  rejected(input(incomplete), "incomplete-roles");
  const failed = structuredClone(value); failed.pipeline.roles[0].outcome = "blocked";
  rejected(input(failed), "incomplete-roles");
  const unrelated = structuredClone(value); unrelated.pipeline.testedCommit = sha("b");
  rejected(input(unrelated), "pipeline-commit-mismatch");
  const noResume = structuredClone(value); noResume.checks = noResume.checks.filter(check => check.name !== "stop-resume");
  rejected(input(noResume), "incomplete-checks");
  const notDispatched = structuredClone(value); notDispatched.diagnostics.roleDispatches["feature-scout"] = 0;
  rejected(input(notDispatched), "incomplete-roles");
});

it("preserves different original attempts when only some legs were rerun", () => {
  const windows = input();
  const value = evidence();
  value.target.os = "darwin"; value.target.architecture = "arm64";
  value.execution = execution(2, "macos_codex_init");
  const macos = input(value);
  const verdict = evaluateClientCandidate({ expected: [...windows.expected, ...macos.expected], records: [...windows.records, ...macos.records], executions: [...windows.executions, ...macos.executions] });
  assert.equal(verdict.result, "pass");
  assert.deepEqual(verdict.selected.map(entry => entry.execution.attempt), [1, 2]);
});
