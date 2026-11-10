import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export const PIPELINE_STEPS = Object.freeze(["assign-work", "plan", "verify", "implement", "impl-verify", "accept", "doc-audit"]);
export const PIPELINE_ROLES = Object.freeze(["work-assigner", "app-dev", "plan-verifier", "impl-verifier", "doc-auditor"]);

export const FIXTURE_FILES = Object.freeze({
  "README.md": "# slug fixture\n\nA small module that the Stagekeeper pipeline smoke changes. Run `npm test`.\n",
  "src/slug.mjs": "export function slugify(text) {\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, \"-\").replace(/^-+|-+$/g, \"\");\n}\n",
  "test/slug.test.mjs": "import assert from \"node:assert/strict\";\nimport { it } from \"node:test\";\nimport { slugify } from \"../src/slug.mjs\";\n\nit(\"joins lowercase words with single hyphens\", () => {\n  assert.equal(slugify(\"  Hello, World!  \"), \"hello-world\");\n});\n",
});

export const BACKLOG_ITEM = Object.freeze({
  title: "Add slugWords(text, maxWords) to src/slug.mjs",
  area: "src",
  type: "feat",
  source: "Pipeline smoke request. Add and export slugWords(text, maxWords) in src/slug.mjs. Callers always pass a string as text. Check maxWords first: when it is not a positive integer (for example 0, -1, 1.5 or \"2\"), throw a RangeError (any message), even when text is empty. Otherwise trim text, split it on runs of whitespace, keep the first maxWords words (all of them when there are fewer) and return slugify of those words joined with single spaces. Empty or whitespace-only text returns an empty string. Cover these cases in test/slug.test.mjs and keep slugify unchanged.",
});

export const INDEPENDENT_CASES = Object.freeze([
  { args: ["One two three", 2], returns: "one-two" },
  { args: ["  Hello   big World ", 5], returns: "hello-big-world" },
  { args: ["   ", 3], returns: "" },
  { args: ["a b", 0], throws: "RangeError" },
  { args: ["a b", 1.5], throws: "RangeError" },
  { args: ["", 0], throws: "RangeError" },
]);

const TRUNCATE_FILES = Object.freeze({
  "README.md": "# stagekeeper-macos-e2e\n\nDisposable repository for a macOS end-to-end acceptance run of the Stagekeeper Claude Code plugin.\n",
  "src/text.mjs": "export function capitalize(value) {\n  if (typeof value !== \"string\") throw new TypeError(\"value must be a string\");\n  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);\n}\n\nexport function wordCount(value) {\n  if (typeof value !== \"string\") throw new TypeError(\"value must be a string\");\n  const trimmed = value.trim();\n  return trimmed.length === 0 ? 0 : trimmed.split(/\\s+/).length;\n}\n",
  "src/text.test.mjs": "import assert from \"node:assert/strict\";\nimport { test } from \"node:test\";\nimport { capitalize, wordCount } from \"./text.mjs\";\n\ntest(\"capitalize uppercases the first character\", () => {\n  assert.equal(capitalize(\"hello\"), \"Hello\");\n  assert.equal(capitalize(\"\"), \"\");\n});\n\ntest(\"wordCount counts whitespace-separated words\", () => {\n  assert.equal(wordCount(\"  one two   three \"), 3);\n  assert.equal(wordCount(\"   \"), 0);\n});\n\ntest(\"text helpers reject non-strings\", () => {\n  assert.throws(() => capitalize(1), TypeError);\n  assert.throws(() => wordCount(null), TypeError);\n});\n",
});

const TRUNCATE_ITEM = Object.freeze({
  title: "Add a truncate helper for long text",
  area: "src/text.mjs",
  type: "feat",
  source: "Callers need to shorten long strings for one-line previews. Add truncate(value, maxLength) to src/text.mjs: return the string unchanged when it fits; otherwise cut it so the result including a trailing ellipsis character (U+2026) is exactly maxLength characters. Reject non-string values and maxLength values that are not positive integers with TypeError, like the existing helpers. Cover the fitting, cut, and invalid-input cases in src/text.test.mjs.",
});

const TRUNCATE_CASES = Object.freeze([
  { args: ["hello", 10], returns: "hello" },
  { args: ["hello", 5], returns: "hello" },
  { args: ["hello world", 8], returns: "hello w…" },
  { args: ["hello", 1], returns: "…" },
  { args: ["hello", 0], throws: "TypeError" },
  { args: ["hello", 1.5], throws: "TypeError" },
  { args: [42, 5], throws: "TypeError" },
]);

export const SMOKE_SCENARIOS = Object.freeze({
  slug: Object.freeze({ files: FIXTURE_FILES, item: BACKLOG_ITEM, cases: INDEPENDENT_CASES, module: "src/slug.mjs", exportName: "slugWords" }),
  truncate: Object.freeze({ files: TRUNCATE_FILES, item: TRUNCATE_ITEM, cases: TRUNCATE_CASES, module: "src/text.mjs", exportName: "truncate" }),
});

export const PLAN_VERIFIER_PASS_LIMIT = 3;

export function planVerificationBounded(passes) {
  return Number.isInteger(passes) && passes >= 1 && passes <= PLAN_VERIFIER_PASS_LIMIT;
}

export function caseResults(subject, cases = INDEPENDENT_CASES) {
  return cases.map(({ args, returns, throws }) => {
    try {
      const value = subject(...args);
      return throws === undefined && value === returns;
    } catch (error) {
      return throws !== undefined && error?.name === throws;
    }
  });
}

export const RUNNER_WAIT_LIMIT_MS = 2 * 60_000;
export const HANDOFF_LIMIT_MS = 5 * 60_000;
const WAIT_FAILURES = Object.freeze({ gate: "item-gated", acceptance: "acceptance-failed", "impl-verify": "impl-verify-failed", qa: "qa-failed", cap: "usage-cap" });

export function waitVerdict({ next, boardStatus, runner, waitingMs, handoffMs = 0, now, deadline, timeoutStep }) {
  if (next?.action === "done") return { verdict: "done" };
  if (boardStatus === "on_hold") return { verdict: "fail", step: "item-held" };
  if (next?.action === "wait" && Object.hasOwn(WAIT_FAILURES, next.on)) return { verdict: "fail", step: WAIT_FAILURES[next.on] };
  if (next?.action === "wait" && next.on === "handoff" && handoffMs >= HANDOFF_LIMIT_MS) return { verdict: "fail", step: "item-handoff" };
  if (runner?.running === false) return { verdict: "fail", step: "runner-ended" };
  if (runner?.limitedUntil) return { verdict: "fail", step: "claude-usage-limit" };
  if (runner?.state === "waiting" && waitingMs >= RUNNER_WAIT_LIMIT_MS) return { verdict: "fail", step: "runner-waiting" };
  if (now >= deadline) return { verdict: "fail", step: timeoutStep };
  return { verdict: "wait" };
}

const RESULTS = ["pass", "fail", "skip"];
const PERMISSIONS = ["auto", "allowlist"];
const RUNNER_STATES = ["starting", "idle", "working", "waiting", "stopping", "stopped"];
const WAIT_REASONS = ["dirty", "branch"];
const NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const MODEL = /^claude-[a-z0-9-]{1,60}$/;
const TOOL = /^[a-z_]{1,40}$/;
const HARNESS_TOOL = /^mcp__harness__([a-z_]{1,40})$/;
const AGENT_TOOLS = ["Agent", "Task"];
const RUN_LINE = /^(?:done: (?:\d+|\?) turns, \d+ denied|error: (?:[a-z_]{1,40}(?: \([a-z_]{1,40}\))?|no result|exit -?\d+)|ended: (?:the branch changed|time limit|runner stopping)|limited: Claude usage limit until \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z)$/;

export function runFindings(streams, transcripts = []) {
  const names = new Map();
  const failed = new Set();
  const costs = new Map();
  const denials = new Set();
  let unnamedResults = 0;
  const findings = { turns: 0, denials: 0, costUsd: 0, models: [], toolErrors: 0, agentCalls: 0, agentErrors: 0, harnessErrors: {} };
  const visit = (text, withResults) => {
    for (const line of text.split(/\r?\n/)) {
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      for (const block of Array.isArray(message?.message?.content) ? message.message.content : []) {
        if (block?.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") names.set(block.id, block.name);
        if (block?.type === "tool_result" && block.is_error === true && typeof block.tool_use_id === "string") failed.add(block.tool_use_id);
      }
      if (!withResults || message?.type !== "result") continue;
      const session = typeof message.session_id === "string" ? message.session_id : `result-${unnamedResults++}`;
      if (Number.isInteger(message.num_turns)) findings.turns += message.num_turns;
      for (const denial of Array.isArray(message.permission_denials) ? message.permission_denials : []) {
        denials.add(typeof denial?.tool_use_id === "string" ? `${session}:${denial.tool_use_id}` : `denial-${denials.size}`);
      }
      if (Number.isFinite(message.total_cost_usd)) costs.set(session, Math.max(costs.get(session) ?? 0, message.total_cost_usd));
      for (const model of Object.keys(message.modelUsage ?? {})) if (MODEL.test(model) && !findings.models.includes(model)) findings.models.push(model);
    }
  };
  for (const text of streams) visit(text, true);
  for (const text of transcripts) visit(text, false);
  findings.denials = denials.size;
  findings.costUsd = [...costs.values()].reduce((sum, cost) => sum + cost, 0);
  for (const name of names.values()) if (AGENT_TOOLS.includes(name)) findings.agentCalls++;
  for (const id of failed) {
    findings.toolErrors++;
    const name = names.get(id) ?? "";
    if (AGENT_TOOLS.includes(name)) findings.agentErrors++;
    const tool = HARNESS_TOOL.exec(name)?.[1];
    if (tool) findings.harnessErrors[tool] = (findings.harnessErrors[tool] ?? 0) + 1;
  }
  return findings;
}

export function summarizePipeline(record) {
  const summary = {};
  if (typeof record.os === "string" && NAME.test(record.os)) summary.os = record.os;
  if (Object.hasOwn(SMOKE_SCENARIOS, record.scenario ?? "")) summary.scenario = record.scenario;
  if (Number.isInteger(record.planVerifierPasses) && record.planVerifierPasses >= 0) summary.planVerifierPasses = record.planVerifierPasses;
  for (const field of ["pluginCommit", "templatesCommit"]) if (COMMIT.test(record[field] ?? "")) summary[field] = record[field];
  if (PERMISSIONS.includes(record.permission)) summary.permission = record.permission;
  if (RUNNER_STATES.includes(record.runnerState)) summary.runnerState = record.runnerState;
  if (WAIT_REASONS.includes(record.waitReason)) summary.waitReason = record.waitReason;
  if (Array.isArray(record.steps)) {
    summary.steps = record.steps.filter(entry => NAME.test(entry?.step ?? "") && RESULTS.includes(entry?.result)).map(entry => ({ step: entry.step, result: entry.result }));
  }
  if (Array.isArray(record.runs)) summary.runs = record.runs.filter(line => typeof line === "string" && RUN_LINE.test(line));
  const findings = record.findings;
  if (findings && typeof findings === "object") {
    for (const field of ["turns", "denials", "agentCalls", "agentErrors"]) if (Number.isInteger(findings[field]) && findings[field] >= 0) summary[field] = findings[field];
    if (Number.isFinite(findings.costUsd) && findings.costUsd >= 0) summary.costUsd = Math.round(findings.costUsd * 100) / 100;
    if (Array.isArray(findings.models)) summary.models = findings.models.filter(model => typeof model === "string" && MODEL.test(model));
    if (findings.harnessErrors && typeof findings.harnessErrors === "object") {
      summary.harnessErrors = Object.fromEntries(Object.entries(findings.harnessErrors).filter(([tool, count]) => TOOL.test(tool) && Number.isInteger(count) && count > 0));
    }
  }
  if (Number.isInteger(record.stepRefusals) && record.stepRefusals >= 0) summary.stepRefusals = record.stepRefusals;
  if (Number.isInteger(record.minutesToDone) && record.minutesToDone >= 0) summary.minutesToDone = record.minutesToDone;
  if (typeof record.sealed === "boolean") summary.sealed = record.sealed;
  if (typeof record.failure === "string" && NAME.test(record.failure)) summary.failure = record.failure;
  if (Number.isInteger(record.seconds) && record.seconds >= 0) summary.seconds = record.seconds;
  summary.result = record.failure ? "fail" : "pass";
  return summary;
}

const TRIGGER_COMMAND = /`git diff --name-only origin\/main origin\/dev -- ([^`]+)`/;

export function smokeTriggerPaths(agentsText) {
  const match = TRIGGER_COMMAND.exec(agentsText);
  return match ? match[1].trim().split(/\s+/) : [];
}

const BUNDLE_NAME = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const BUNDLE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function transcriptKey(text) {
  const key = Buffer.from(String(text ?? "").trim(), "base64");
  if (key.length !== KEY_BYTES) throw new Error("the transcript key must be 32 bytes of base64");
  return key;
}

function checkedFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("transcript files must be an object");
  for (const [name, text] of Object.entries(files)) {
    if (!BUNDLE_NAME.test(name) || name.split("/").some(part => part === "." || part === "..") || typeof text !== "string") {
      throw new Error("the transcript bundle has an unsafe entry");
    }
  }
  return files;
}

function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new Error("the transcript key must be 32 bytes");
  return key;
}

export function sealTranscripts(files, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", requireKey(key), iv);
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify({ version: BUNDLE_VERSION, files: checkedFiles(files) }))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function openTranscripts(sealed, key) {
  if (!Buffer.isBuffer(sealed) || sealed.length <= IV_BYTES + TAG_BYTES) throw new Error("the sealed transcripts are truncated");
  const decipher = createDecipheriv("aes-256-gcm", requireKey(key), sealed.subarray(0, IV_BYTES));
  decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  const opened = Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
  const bundle = JSON.parse(gunzipSync(opened).toString("utf8"));
  if (bundle?.version !== BUNDLE_VERSION) throw new Error("unsupported transcript bundle");
  return checkedFiles(bundle.files);
}

export function writeTranscripts(files, outDir) {
  const entries = Object.entries(checkedFiles(files));
  mkdirSync(outDir);
  for (const [name, text] of entries) {
    const target = path.join(outDir, ...name.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text, { flag: "wx" });
  }
}
