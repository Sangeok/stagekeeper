import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, dirname, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { RUNTIME_MARKER } from "../lib/client-runtime.mjs";
import { QA_BROWSER_TOOLS } from "../lib/qa.mjs";

export const ROLE_TOOLS = {
  pm: ["agent_next", "backlog_list", "board_list", "board_propose"],
  "feature-scout": ["agent_next", "backlog_list", "backlog_add"],
  "doc-auditor": ["agent_next", "backlog_list"],
  "plan-verifier": ["agent_next", "board_get"],
  "qa-verifier": ["agent_next", "board_get", "backlog_get", "report_submit"],
  "impl-verifier": ["agent_next", "board_get", "backlog_get", "report_submit"],
  dev: ["agent_next", "backlog_get", "board_get", "board_transition", "plan_submit", "report_submit"],
};
export const ROLE_FILE_TOOLS = {
  pm: [], "feature-scout": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"], "doc-auditor": ["Read", "Glob", "Grep"],
  "plan-verifier": ["Read", "Glob", "Grep", "Bash", "Skill"], "qa-verifier": ["Read", "Glob", "Grep", "Write"], "impl-verifier": ["Read", "Glob", "Grep", "Bash", "Write"], dev: ["Read", "Glob", "Grep", "Bash", "Write", "Edit", "MultiEdit"],
};
const FILE_TOOLS = new Set(Object.values(ROLE_FILE_TOOLS).flat());

export function parseRole(body) {
  const front = /^---\r?\n([\s\S]+?)\r?\n---\r?\n/.exec(body);
  if (!front) throw new Error("Role frontmatter required");
  const fields = {};
  for (const line of front[1].split(/\r?\n/).filter(line => line.trim())) {
    const match = /^(name|description|tools|model):\s*(.+)$/.exec(line);
    if (!match || Object.hasOwn(fields, match[1])) throw new Error("Unsupported or duplicate role frontmatter");
    fields[match[1]] = match[2].trim();
  }
  if (!/^[a-z][a-z0-9-]*$/.test(fields.name ?? "") || !fields.description || !fields.tools) throw new Error("Invalid role name, description or tools");
  const tools = fields.tools.split(",").map(value => value.trim());
  if (tools.some(tool => !FILE_TOOLS.has(tool) && !/^mcp__harness__[a-z_]+$/.test(tool) && !QA_BROWSER_TOOLS.some(name => tool === `mcp__harness_qa_browser__${name}`))) throw new Error("Unsupported role tool");
  return { ...fields, tools, instruction: body.slice(front[0].length).trim() };
}

export function renderCodexRole(body, logicalRole) {
  const parsed = parseRole(body), allowed = ROLE_TOOLS[logicalRole] ?? ROLE_TOOLS.dev;
  const fileTools = ROLE_FILE_TOOLS[logicalRole] ?? ROLE_FILE_TOOLS.dev;
  if (parsed.tools.some(tool => FILE_TOOLS.has(tool) && !fileTools.includes(tool))) throw new Error(`Role file tool allowlist differs: ${parsed.name}`);
  const supplied = parsed.tools.filter(tool => tool.startsWith("mcp__harness__")).map(tool => tool.slice("mcp__harness__".length));
  if (new Set(supplied).size !== allowed.length || supplied.length !== allowed.length || supplied.some(tool => !allowed.includes(tool))) throw new Error(`Role MCP allowlist differs: ${parsed.name}`);
  if (!parsed.instruction.includes(RUNTIME_MARKER)) throw new Error(`Role protocol marker missing: ${parsed.name}`);
  const browserTools = parsed.tools.filter(tool => tool.startsWith("mcp__harness_qa_browser__"));
  if (logicalRole === "qa-verifier" ? browserTools.length !== QA_BROWSER_TOOLS.length || new Set(browserTools).size !== browserTools.length : browserTools.length !== 0) throw new Error("Role browser allowlist differs");
  parsed.instruction = parsed.instruction.replaceAll("mcp__harness_qa_browser__", "mcp__harness__");
  const write = logicalRole === "dev" || logicalRole === "qa-verifier" || logicalRole === "impl-verifier";
  if (!write && parsed.tools.some(tool => ["Write", "Edit", "MultiEdit"].includes(tool))) throw new Error("Read-only role declares write tools");
  const entry = "Execute only through the installed harness-codex fresh-thread helper, never through a parent-history subagent. Include client: codex on every agent_next; the helper enforces project, key, entry and role binding. " + (logicalRole === "pm" ? "Use only the MCP tools; no repository read or file tools." : "Use the absolute repository and scratch paths in the briefing; cwd is scratch. Read docs/harness/codex-runbook.md relative to repository.") + " Translate legacy /harness:init recovery advice to $harness-init. Stop after done:true. Owner tools and nested agents are unavailable. Permission refusal is failed/blocked, never verification success. Git metadata stays protected: prepare permitted files, submit handoff, and let the main loop or owner commit with actual permission.";
  return `name = ${JSON.stringify(parsed.name)}\ndescription = ${JSON.stringify(parsed.description)}\ndeveloper_instructions = ${JSON.stringify(entry + "\n\n" + parsed.instruction)}\nsandbox_mode = ${JSON.stringify(write ? "workspace-write" : "read-only")}\n[agents]\nenabled = false\n[mcp_servers.harness]\nenabled_tools = ${JSON.stringify(allowed)}\n[mcp_servers.harness_owner]\nenabled = false\n`;
}

export function readCodexRole(body, logicalRole, agent) {
  const fields = {}, allowedSections = new Set(["agents", "mcp_servers.harness", "mcp_servers.harness_owner"]);
  let section = ""; const seen = new Set();
  for (const line of body.split(/\r?\n/).filter(line => line.trim())) {
    const heading = /^\[([^\]]+)\]$/.exec(line);
    if (heading) { if (!allowedSections.has(heading[1]) || seen.has(heading[1])) throw new Error("Unsupported or duplicate role section"); section = heading[1]; seen.add(section); continue; }
    const pair = /^(\w+) = (.+)$/.exec(line), name = pair ? `${section ? section + "." : ""}${pair[1]}` : "";
    if (!pair || Object.hasOwn(fields, name)) throw new Error("Malformed or duplicate role TOML");
    fields[name] = JSON.parse(pair[2]);
  }
  const required = ["name", "description", "developer_instructions", "sandbox_mode", "agents.enabled", "mcp_servers.harness.enabled_tools", "mcp_servers.harness_owner.enabled"];
  const tools = fields["mcp_servers.harness.enabled_tools"], allowed = ROLE_TOOLS[logicalRole];
  if (Object.keys(fields).length !== required.length || required.some(name => !Object.hasOwn(fields, name)) || fields.name !== agent
    || typeof fields.description !== "string" || typeof fields.developer_instructions !== "string" || !fields.developer_instructions.includes(RUNTIME_MARKER)
    || fields.sandbox_mode !== (["dev", "qa-verifier", "impl-verifier"].includes(logicalRole) ? "workspace-write" : "read-only") || fields["agents.enabled"] !== false
    || fields["mcp_servers.harness_owner.enabled"] !== false || !Array.isArray(tools) || new Set(tools).size !== allowed.length || tools.length !== allowed.length || tools.some(tool => !allowed.includes(tool))) throw new Error("Role policy differs from managed contract");
  return fields;
}

function defaultVerifierDirectory() {
  const bundled = fileURLToPath(new URL("../codex/skills/reconciling-proposals-with-codebase/", import.meta.url));
  if (existsSync(bundled)) return bundled;
  return process.env.HARNESS_VERIFIER_SKILL_DIR ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills/reconciling-proposals-with-codebase");
}

export function verifierPackage(source = defaultVerifierDirectory()) {
  const root = realpathSync(source), files = [];
  if (lstatSync(source).isSymbolicLink() || !existsSync(join(root, "SKILL.md"))) throw new Error("Complete owner verifier package required");
  const visit = directory => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name), stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw new Error("Verifier package symlink refused");
      if (stat.isDirectory()) visit(full);
      else if (stat.isFile()) files.push(full);
      else throw new Error("Unexpected verifier package file");
    }
  };
  visit(root);
  const skill = readFileSync(join(root, "SKILL.md"), "utf8");
  if (!/^name:\s*["']?reconciling-proposals-with-codebase["']?\s*$/m.test(skill)) throw new Error("Wrong verifier package identity");
  for (const file of files.filter(file => file.endsWith(".md"))) {
    for (const link of readFileSync(file, "utf8").matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:|^#/i.test(link[1])) continue;
      const target = resolve(dirname(file), link[1].split("#")[0]), rel = relative(root, target);
      if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(target) || lstatSync(target).isSymbolicLink()) throw new Error("Incomplete verifier relative resource");
    }
  }
  const sha = value => createHash("sha256").update(value).digest("hex");
  const inventory = files.map(file => `${relative(root, file).replaceAll("\\", "/")}:${sha(readFileSync(file))}`);
  return { path: join(root, "SKILL.md"), files: files.length, checksum: sha(inventory.join("\n")) };
}
