import { createHash } from "node:crypto";

const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const NAME = /^[a-z][a-z0-9_-]{0,39}$/;
const RESULTS = ["pass", "fail", "cancelled", "skipped", "running"];
const RESOURCES = ["client", "workspace", "runner", "processes", "locks", "browser", "server", "database", "fixture"];
const CHECKS = ["loader", "inventory", "empty-cache", "dry-run", "connected", "preserved-files", "no-global-node", "previous-connected", "pins-preserved", "control", "required-cases", "accepted-roles", "plan-report-commit", "independent-cases", "tests", "owner-gate", "stop-resume", "no-duplicate-results", "model-completed", "auth-boundary"];
const ROLES = ["work-assigner", "app-dev", "plan-verifier", "impl-verifier", "doc-auditor", "qa-verifier", "feature-scout"];
const NA_SOURCE = "not-applicable:source-channel";
const NA_EVAL = "not-applicable:source-copy-eval";
const NA_AUTH = "not-applicable:auth-only";
const EVAL_CASES = {
  claude: ["first-connection-asks-before-register", "first-connection-asks-before-writing", "rerun-asks-first"],
  codex: ["dry-run-only", "modified-file", "incomplete-package"],
};

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}

function text(value, expression, code) {
  requireValue(typeof value === "string" && expression.test(value), code);
  return value;
}

function member(value, values, code) {
  requireValue(values.includes(value), code);
  return value;
}

function count(value, code) {
  requireValue(Number.isSafeInteger(value) && value >= 0, code);
  return value;
}

function amount(value, code) {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= 0, code);
  return value;
}

function list(value, parse, code, empty = false) {
  requireValue(Array.isArray(value) && (empty || value.length > 0), code);
  return value.map(parse);
}

function unique(entries, key, code) {
  requireValue(new Set(entries.map(key)).size === entries.length, code);
  return entries;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function executionIdentity(input) {
  return {
    repository: text(input?.repository, /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, "execution-repository"),
    workflow: text(input?.workflow, /^\.github\/workflows\/[a-z0-9-]+\.yml$/, "execution-workflow"),
    workflowCommit: text(input?.workflowCommit, SHA, "execution-commit"),
    runId: text(input?.runId, /^[1-9]\d{0,15}$/, "execution-run"),
    attempt: count(input?.attempt, "execution-attempt"),
    job: text(input?.job, NAME, "execution-job"),
    leg: text(input?.leg, NAME, "execution-leg"),
  };
}

function executionKey(input) {
  const identity = executionIdentity(input);
  requireValue(identity.attempt > 0, "execution-attempt");
  return JSON.stringify(identity);
}

function packageIdentity(input, channel) {
  const bundle = channel === "bundle";
  return Object.fromEntries(["packageSha256", "runtimeSha256", "verifierSha256"].map(field => [field,
    bundle ? text(input?.[field], HASH, "package-identity") : member(input?.[field], [NA_SOURCE], "source-package-identity"),
  ]));
}

function installedIdentity(input, channel) {
  return {
    pluginCommit: text(input?.pluginCommit, SHA, "plugin-commit"),
    pluginVersion: text(input?.pluginVersion, VERSION, "plugin-version"),
    payloadSha256: text(input?.payloadSha256, HASH, "payload-identity"),
    ...packageIdentity(input, channel),
  };
}

export function clientTarget(input) {
  const target = {
    client: member(input?.client, ["claude", "codex"], "target-client"),
    os: member(input?.os, ["win32", "darwin"], "target-os"),
    architecture: member(input?.architecture, ["x64", "arm64"], "target-architecture"),
    phase: member(input?.phase, ["init", "eval", "pipeline", "auth"], "target-phase"),
    scenario: member(input?.scenario, ["new-user", "update", "slug", "truncate", "init-skill", "auth"], "target-scenario"),
    installChannel: member(input?.installChannel, ["github-branch", "export", "bundle", "source-copy", "none"], "target-channel"),
  };
  requireValue(target.os !== "win32" || target.architecture === "x64", "unsupported-architecture");
  const expectedScenarios = { init: ["new-user", "update"], eval: ["init-skill"], pipeline: ["slug", "truncate"], auth: ["auth"] };
  requireValue(expectedScenarios[target.phase].includes(target.scenario), "phase-scenario");
  requireValue(target.phase !== "eval" || target.os === "darwin", "eval-host");
  const identity = input.identity;
  if (target.phase === "auth") {
    requireValue(target.installChannel === "none", "auth-channel");
    target.identity = { executableSha256: text(identity?.executableSha256, HASH, "executable-identity") };
    for (const field of ["serverCommit", "templatesCommit", "pluginCommit"]) target.identity[field] = member(identity?.[field], [NA_AUTH], "auth-product-identity");
  } else if (target.client === "claude" && target.phase === "eval") {
    requireValue(target.installChannel === "source-copy", "eval-channel");
    target.identity = {
      pluginCommit: text(identity?.pluginCommit, SHA, "plugin-commit"),
      pluginVersion: text(identity?.pluginVersion, VERSION, "plugin-version"),
      fixtureCommit: text(identity?.fixtureCommit, SHA, "fixture-commit"),
      copySha256: text(identity?.copySha256, HASH, "copy-identity"),
      serverCommit: member(identity?.serverCommit, [NA_EVAL], "eval-server-identity"),
      templatesCommit: member(identity?.templatesCommit, [NA_EVAL], "eval-template-identity"),
    };
  } else {
    requireValue(["github-branch", "export", "bundle"].includes(target.installChannel), "installed-channel");
    requireValue(target.client !== "codex" || target.installChannel === "bundle", "codex-bundle-required");
    target.identity = {
      ...installedIdentity(identity, target.installChannel),
      serverCommit: text(identity?.serverCommit, SHA, "server-commit"),
      templatesCommit: text(identity?.templatesCommit, SHA, "templates-commit"),
    };
    if (target.scenario === "update") {
      target.identity.previous = {
        ...installedIdentity(identity?.previous, target.installChannel),
        templatesCommit: text(identity?.previous?.templatesCommit, SHA, "previous-templates"),
        kind: member(identity?.previous?.kind, ["rebuilt-fixture", "release-artifact"], "previous-kind"),
      };
    }
  }
  return target;
}

function dimensionKey(target) {
  return JSON.stringify([target.client, target.os, target.architecture, target.installChannel, target.phase, target.scenario]);
}

function counters(input, roles = false) {
  requireValue(input !== null && typeof input === "object" && !Array.isArray(input), "diagnostic-counters");
  return Object.fromEntries(Object.keys(input).sort().map(name => {
    if (roles) member(name, ROLES, "diagnostic-role");
    else text(name, /^[a-z_]{1,40}$/, "diagnostic-tool");
    return [name, count(input[name], "diagnostic-count")];
  }));
}

export function normalizeClientEvidence(input) {
  requireValue(input?.schema === 2, "evidence-schema");
  const target = clientTarget(input.target);
  const execution = executionIdentity(input.execution);
  executionKey(execution);
  const diagnostics = {
    harnessErrors: counters(input.diagnostics?.harnessErrors),
    stepRefusals: count(input.diagnostics?.stepRefusals, "step-refusals"),
    roleDispatches: counters(input.diagnostics?.roleDispatches, true),
    additionalRoleStarts: counters(input.diagnostics?.additionalRoleStarts, true),
    mainLoopStarts: count(input.diagnostics?.mainLoopStarts, "main-loop-starts"),
    roleToolFailures: count(input.diagnostics?.roleToolFailures, "role-tool-failures"),
    mainLoopToolRefusals: count(input.diagnostics?.mainLoopToolRefusals, "main-loop-refusals"),
  };
  requireValue(typeof input.diagnostics?.reviewRequired === "boolean", "review-required");
  diagnostics.reviewRequired = input.diagnostics.reviewRequired || diagnostics.stepRefusals + diagnostics.roleToolFailures + diagnostics.mainLoopToolRefusals > 0
    || [...Object.values(diagnostics.harnessErrors), ...Object.values(diagnostics.additionalRoleStarts)].some(value => value > 0);
  const measurement = input.measurement;
  const evidence = {
    schema: 2, target, execution,
    clientVersion: text(input.clientVersion, VERSION, "client-version"),
    osVersion: text(input.osVersion, /^\d+(?:\.\d+){1,3}$/, "os-version"),
    result: member(input.result, RESULTS, "evidence-result"),
    checks: unique(list(input.checks, check => ({ name: member(check?.name, CHECKS, "check-name"), result: member(check?.result, ["pass", "fail"], "check-result") }), "checks"), check => check.name, "duplicate-check").sort((a, b) => a.name.localeCompare(b.name)),
    cleanup: unique(list(input.cleanup, entry => ({ resource: member(entry?.resource, RESOURCES, "cleanup-resource"), result: member(entry?.result, ["pass", "fail", "preserved"], "cleanup-result") }), "cleanup"), entry => entry.resource, "duplicate-resource").sort((a, b) => a.resource.localeCompare(b.resource)),
    measurement: {
      seconds: amount(measurement?.seconds, "duration"),
      modelCalls: measurement?.modelCalls === null ? null : count(measurement?.modelCalls, "model-calls"),
      costUsd: measurement?.costUsd === null ? null : amount(measurement?.costUsd, "model-cost"),
      models: unique(list(measurement?.models, name => text(name, /^(?:claude-|gpt-|o[1-9])[a-z0-9.-]{1,60}$/, "model-name"), "models", true), name => name, "duplicate-model").sort(),
    },
    diagnostics,
  };
  if (target.phase === "eval") {
    requireValue(typeof input.evaluation?.controlPassed === "boolean", "evaluation-control");
    evidence.evaluation = {
      controlPassed: input.evaluation.controlPassed,
      selection: member(input.evaluation.selection, ["gate", "case"], "evaluation-selection"),
      cases: unique(list(input.evaluation.cases, entry => ({
        name: member(entry?.name, EVAL_CASES[target.client], "evaluation-case"),
        runs: count(entry?.runs, "evaluation-runs"),
        failedRuns: count(entry?.failedRuns, "evaluation-failures"),
      }), "evaluation-cases"), entry => entry.name, "duplicate-evaluation-case").sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  if (target.phase === "pipeline") {
    evidence.pipeline = {
      planCommit: text(input.pipeline?.planCommit, SHA, "pipeline-plan"),
      implementationCommit: text(input.pipeline?.implementationCommit, SHA, "pipeline-implementation"),
      reportCommit: text(input.pipeline?.reportCommit, SHA, "pipeline-report"),
      testedCommit: text(input.pipeline?.testedCommit, SHA, "pipeline-tested"),
      roles: unique(list(input.pipeline?.roles, role => ({
        name: member(role?.name, ROLES, "pipeline-role"),
        outcome: member(role?.outcome, ["accepted", "failed", "blocked", "running"], "pipeline-outcome"),
      }), "pipeline-roles"), role => role.name, "duplicate-pipeline-role").sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  return evidence;
}

export function evidenceDigest(input) {
  return digest(normalizeClientEvidence(input));
}

function requiredChecks(target) {
  if (target.phase === "auth") return ["model-completed", "auth-boundary"];
  if (target.phase === "eval") return target.client === "claude" ? ["control", "required-cases"] : ["loader", "inventory", "connected", "no-global-node", "control", "required-cases"];
  const checks = ["loader", "inventory", "dry-run", "connected", "preserved-files"];
  if (target.installChannel === "bundle") checks.push("no-global-node");
  if (target.phase === "init") checks.push(...(target.scenario === "update" ? ["previous-connected", "pins-preserved"] : ["empty-cache"]));
  if (target.phase === "pipeline") checks.push("accepted-roles", "plan-report-commit", "independent-cases", "tests", "owner-gate", "stop-resume", "no-duplicate-results");
  return checks;
}

function expectedLeg(input) {
  const target = clientTarget(input?.target);
  const source = input?.source;
  const resources = unique(list(input?.resources, name => member(name, RESOURCES, "expected-resource"), "expected-resources"), name => name, "duplicate-expected-resource").sort();
  const requiredResources = target.phase === "auth" ? ["client"] : target.installChannel === "source-copy" ? ["client", "workspace"] : ["client", "workspace", "server", "database", "fixture"];
  if (target.phase === "pipeline") requiredResources.push("runner", "processes", "locks");
  requireValue(requiredResources.every(resource => resources.includes(resource)), "expected-resource-coverage");
  return {
    target,
    source: {
      repository: text(source?.repository, /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, "expected-repository"),
      workflow: text(source?.workflow, /^\.github\/workflows\/[a-z0-9-]+\.yml$/, "expected-workflow"),
      workflowCommit: text(source?.workflowCommit, SHA, "expected-workflow-commit"),
      job: text(source?.job, NAME, "expected-job"), leg: text(source?.leg, NAME, "expected-leg"),
    },
    resources,
  };
}

function matchesSource(execution, source) {
  return Object.entries(source).every(([key, value]) => execution[key] === value);
}

export function evaluateClientCandidate({ expected, records, executions, reviews = [], retries = [] } = {}) {
  const findings = [];
  const selected = [];
  try {
    const requirements = unique(list(expected, expectedLeg, "expected-set"), entry => dimensionKey(entry.target), "duplicate-expected-leg");
    const known = unique(list(executions, entry => {
      const execution = executionIdentity(entry?.execution);
      executionKey(execution);
      return {
        execution,
        target: clientTarget(entry?.target),
        sequence: count(entry?.sequence, "execution-sequence"),
        conclusion: member(entry?.conclusion, ["success", "failure", "cancelled", "skipped", "running"], "execution-conclusion"),
        evidenceSha256: entry?.evidenceSha256 === null ? null : text(entry?.evidenceSha256, HASH, "execution-digest"),
      };
    }, "trusted-executions"), entry => executionKey(entry.execution), "duplicate-execution");
    const byExecution = new Map();
    for (const publication of list(records, entry => entry, "records", true)) {
      const recorder = executionIdentity(publication?.publication);
      executionKey(recorder);
      const evidence = normalizeClientEvidence(publication?.evidence);
      const key = executionKey(evidence.execution), hash = digest(evidence);
      const origin = known.find(entry => executionKey(entry.execution) === key);
      requireValue(origin && origin.evidenceSha256 === hash && JSON.stringify(origin.target) === JSON.stringify(evidence.target), "unverified-evidence");
      const prior = byExecution.get(key);
      requireValue(!prior || prior.hash === hash, "conflicting-publication");
      byExecution.set(key, { evidence, hash, publications: (prior?.publications ?? 0) + 1 });
    }
    for (const requirement of requirements) {
      const dimensions = dimensionKey(requirement.target);
      const attempts = known.filter(entry => dimensionKey(entry.target) === dimensions && matchesSource(entry.execution, requirement.source));
      unique(attempts, entry => entry.sequence, "ambiguous-execution-order");
      attempts.sort((a, b) => a.sequence - b.sequence);
      const latest = attempts.at(-1);
      if (!latest) { findings.push({ leg: requirement.source.leg, code: "missing-leg" }); continue; }
      const key = executionKey(latest.execution), record = byExecution.get(key);
      if (JSON.stringify(latest.target) !== JSON.stringify(requirement.target)) findings.push({ leg: requirement.source.leg, code: "identity-mismatch" });
      if (latest.conclusion !== "success" || !record) {
        findings.push({ leg: requirement.source.leg, code: record ? "job-not-successful" : "missing-evidence" });
        continue;
      }
      const { evidence, hash } = record;
      const reject = code => findings.push({ leg: requirement.source.leg, code });
      if (evidence.result !== "pass") reject("leg-not-successful");
      if (requiredChecks(evidence.target).some(name => !evidence.checks.some(check => check.name === name && check.result === "pass")) || evidence.checks.some(check => check.result !== "pass")) reject("incomplete-checks");
      if (JSON.stringify(evidence.cleanup.map(entry => entry.resource).sort()) !== JSON.stringify(requirement.resources) || evidence.cleanup.some(entry => entry.result !== "pass")) reject("cleanup-incomplete");
      if (evidence.target.phase === "init" && (evidence.measurement.modelCalls !== 0 || evidence.measurement.models.length !== 0 || evidence.measurement.costUsd !== 0)) reject("init-used-models");
      if (evidence.target.phase !== "init" && (evidence.measurement.modelCalls === 0 || evidence.measurement.models.length === 0)) reject("missing-model-evidence");
      if (evidence.evaluation && (!evidence.evaluation.controlPassed || evidence.evaluation.selection !== "gate" || evidence.evaluation.cases.length !== 3 || evidence.evaluation.cases.some(entry => entry.runs !== 3 || entry.failedRuns !== 0))) reject("incomplete-evaluation");
      if (evidence.pipeline) {
        const requiredRoles = evidence.target.client === "codex" ? ROLES : ROLES.slice(0, 5);
        if (requiredRoles.some(name => !evidence.pipeline.roles.some(role => role.name === name && role.outcome === "accepted") || !(evidence.diagnostics.roleDispatches[name] > 0)) || evidence.pipeline.roles.some(role => role.outcome !== "accepted")) reject("incomplete-roles");
        if (evidence.pipeline.implementationCommit !== evidence.pipeline.reportCommit || evidence.pipeline.implementationCommit !== evidence.pipeline.testedCommit) reject("pipeline-commit-mismatch");
      }
      const reviewed = entry => reviews.some(review => review?.evidenceSha256 === entry.hash && executionKey(review.execution) === executionKey(entry.evidence.execution) && review.decision === "accepted" && /^[A-Za-z0-9_-]{1,39}$/.test(review.reviewer ?? "") && /^[1-9]\d{0,15}$/.test(review.recordId ?? ""));
      if (evidence.diagnostics.reviewRequired && !reviewed(record)) reject("review-unresolved");
      const earlier = attempts.slice(0, -1);
      for (const prior of earlier) {
        const priorRecord = byExecution.get(executionKey(prior.execution));
        if (priorRecord?.evidence.diagnostics.reviewRequired && !reviewed(priorRecord)) reject("prior-review-unresolved");
      }
      const failed = earlier.filter(entry => entry.conclusion !== "success" || byExecution.get(executionKey(entry.execution))?.evidence.result !== "pass");
      if (failed.length > 1) reject("retry-limit");
      if (failed.length === 1 && !retries.some(retry => retry?.reason === "external-cause" && executionKey(retry.previous) === executionKey(failed[0].execution) && executionKey(retry.selected) === key && /^[A-Za-z0-9_-]{1,39}$/.test(retry.reviewer ?? "") && /^[1-9]\d{0,15}$/.test(retry.recordId ?? ""))) reject("retry-unreviewed");
      selected.push({ execution: evidence.execution, evidenceSha256: hash, publications: record.publications, measurement: evidence.measurement });
    }
  } catch (error) {
    findings.push({ code: error instanceof Error && /^[a-z-]+$/.test(error.message) ? error.message : "invalid-evidence" });
  }
  return { schema: 2, result: findings.length === 0 ? "pass" : "fail", findings, selected };
}
