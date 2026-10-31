import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CLIENTS = ["claude", "codex"];
const SCENARIOS = ["new-user", "update"];
const SOURCES = ["github-branch", "export", "bundle"];
const RESULTS = ["pass", "fail", "skip"];
const NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const TOKEN = /\b(?:hu|hs|ho)_[A-Za-z0-9_-]{43}\b/;

export async function assertGeneratedAgents(pluginRoot, repo, plan, workspaceAgents) {
  const { limitsFor } = await import(pathToFileURL(join(pluginRoot, "lib", "plans", "entitlement.mjs")).href);
  const expected = [...workspaceAgents, ...limitsFor(plan).agents].map(agent => `${agent}.md`).sort();
  const directory = join(repo, ".claude", "agents");
  const actual = existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith(".md")).sort() : [];
  const missing = expected.filter(name => !actual.includes(name));
  const unexpected = actual.filter(name => !expected.includes(name));
  if (missing.length || unexpected.length) throw new Error(`generated agents differ from the installed plugin's ${plan} entitlement: missing [${missing.join(", ")}], unexpected [${unexpected.join(", ")}]`);
}

export function helperCommand(platform, pluginRoot, task, args = []) {
  if (platform === "win32") {
    return { file: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(pluginRoot, "bin", "harness.ps1"), task, ...args] };
  }
  return { file: "node", args: [join(pluginRoot, "bin", `harness-${task}.mjs`), ...args] };
}

export function containsSecret(text, token) {
  if (typeof text !== "string") return false;
  return (typeof token === "string" && token.length > 0 && text.includes(token)) || TOKEN.test(text);
}

export function summarize(record) {
  const summary = {};
  if (CLIENTS.includes(record.client)) summary.client = record.client;
  if (typeof record.os === "string" && NAME.test(record.os)) summary.os = record.os;
  if (SCENARIOS.includes(record.scenario)) summary.scenario = record.scenario;
  if (SOURCES.includes(record.pluginSource)) summary.pluginSource = record.pluginSource;
  if (COMMIT.test(record.pluginCommit ?? "")) summary.pluginCommit = record.pluginCommit;
  if (COMMIT.test(record.previousCommit ?? "")) summary.previousCommit = record.previousCommit;
  if (COMMIT.test(record.templatesCommit ?? "")) summary.templatesCommit = record.templatesCommit;
  if (Array.isArray(record.steps)) {
    summary.steps = record.steps.filter(entry => NAME.test(entry?.step ?? "") && RESULTS.includes(entry?.result)).map(entry => ({ step: entry.step, result: entry.result }));
  }
  if (typeof record.failure === "string" && NAME.test(record.failure)) summary.failure = record.failure;
  if (Number.isInteger(record.seconds) && record.seconds >= 0) summary.seconds = record.seconds;
  summary.result = record.failure ? "fail" : "pass";
  return summary;
}
