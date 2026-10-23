export const CLIENTS = ["claude", "codex"];
export const RUNTIME_PROTOCOL = "harness-runtime-v1";
export const RUNTIME_MARKER = `<!-- harness-runtime:${RUNTIME_PROTOCOL} -->`;

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
