const ROLE_LOGS = Object.freeze({ "doc-auditor": "docs/agents/doc-auditor/audit-log.md", "feature-scout": "docs/agents/feature-scout/scouting-log.md" });
export const residentRoleReportPath = agent => ROLE_LOGS[agent] ?? null;
export const verifierWorkflowFile = (name, key) => ["harness.json", "harness.lock.json", "CLAUDE.md", ".mcp.json", `docs/agents/qa-verifier/${key}.md`, `docs/agents/impl-verifier/${key}.md`, `docs/agents/main-loop/${key}.md`, ...Object.values(ROLE_LOGS)].includes(name)
  || [".codex/", ".claude/", "docs/harness/"].some(prefix => name.startsWith(prefix));
