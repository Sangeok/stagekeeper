import { limitsFor } from "./entitlement.mjs";

export const CLIENTS = ["claude", "codex"];
export const RUNTIME_PROTOCOL = "harness-runtime-v1";
export const RUNTIME_MARKER = `<!-- harness-runtime:${RUNTIME_PROTOCOL} -->`;
export const COMMON_DOCS = ["docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md", "docs/agents/README.md"];

/** @typedef {"claude" | "codex"} Client */
/** @param {unknown} value @returns {Client} */
export function parseClient(value) {
  if (value === undefined || value === null || value === "claude") return "claude";
  if (value === "codex") return "codex";
  throw new Error("client must be claude or codex");
}

/** @param {Client} client */
export function clientRuntime(client = "claude") {
  parseClient(client);
  return client === "codex"
    ? { client, protocol: RUNTIME_PROTOCOL, runbook_source: "CODEX.runbook.md", runbook_path: "docs/harness/codex-runbook.md", init_command: "$harness-init", resume_command: "$harness-resume", role_call: "Use the installed harness-codex helper to dispatch a fresh role thread; never substitute the parent conversation.", session_call: "Use the installed harness-session helper. Check owned and active before dispatch or outcome submission." }
    : { client, protocol: RUNTIME_PROTOCOL, runbook_source: "CLAUDE.runbook.md", runbook_path: "CLAUDE.md", init_command: "/harness:init", resume_command: "/harness:watch", role_call: "Invoke the named Claude Code subagent with a fresh context.", session_call: "Use the installed harness-session helper when available; a dual checkout requires the updated helper." };
}

export function runtimeEcho() { return { client: "codex", protocol: RUNTIME_PROTOCOL }; }

/** Checks the raw bundle before stub delivery. Does not perform language fallback. */
export function validateCodexBundle(rows, plan) {
  const templates = Object.fromEntries(rows.map(({ path, body }) => [path, body]));
  const roles = ["dev", ...limitsFor(plan).agents];
  const required = ["CODEX.runbook.md", ...COMMON_DOCS, ...roles.map(role => `agents/${role}.md`)];
  for (const file of required) {
    if (typeof templates[file] !== "string" || !templates[file].trim()) throw new Error(`Codex bundle missing: ${file}`);
  }
  for (const file of ["CODEX.runbook.md", ...roles.map(role => `agents/${role}.md`)]) {
    const stub = templates[file].split(/^## step:/m)[0];
    const markers = stub.match(/<!-- harness-runtime:[^>]+ -->/g) ?? [];
    if (markers.length !== 1 || markers[0] !== RUNTIME_MARKER) throw new Error(`Codex bundle protocol mismatch: ${file}`);
  }
  return templates;
}
