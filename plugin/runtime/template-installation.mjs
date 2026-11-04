import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashOf } from "../lib/templates/manifest.mjs";
import { TEMPLATE_CONTRACT, TEMPLATE_PROTOCOL } from "../lib/templates/release-manifest.mjs";
import { parseHarnessConfig } from "../lib/configuration/harness-config.mjs";
import { safeTarget } from "./file-ownership.mjs";
import { gitRoot, readState, stateFiles, withGuard } from "./local-session.mjs";

export class TemplateConfigurationChanged extends Error {}

const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => typeof value === "string" && value.length > 0;
export const installationConfigHash = text => createHash("sha256").update(text, "utf8").digest("hex");

function regularText(root, name) {
  const file = safeTarget(root, name), stat = lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 4 * 1024 * 1024) throw new Error("Invalid managed installation file");
  const value = readFileSync(file, "utf8"), after = lstatSync(file);
  if (after.isSymbolicLink() || after.ino !== stat.ino || after.dev !== stat.dev || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error("Installation file changed during validation");
  return value;
}

export function installationFromMetadata(value) {
  if (!record(value) || !nonempty(value.id) || value.schemaVersion !== 1 || value.protocol !== TEMPLATE_PROTOCOL || !nonempty(value.language)
    || typeof value.clientSurfaceHash !== "string" || !/^[a-f0-9]{64}$/.test(value.clientSurfaceHash)) throw new Error("Server does not support the template release installation protocol");
  return { releaseId: value.id, language: value.language, clientSurfaceHash: value.clientSurfaceHash, protocol: TEMPLATE_PROTOCOL };
}

export function readInstallationLock(root) {
  if (!existsSync(safeTarget(root, "harness.lock.json"))) return null;
  let lock;
  try { lock = JSON.parse(regularText(root, "harness.lock.json")); } catch { throw new Error("Installation lock is unreadable; preserve files and repair it before init"); }
  if (!record(lock) || ![1, 2].includes(lock.version) || !record(lock.files)
    || !Object.values(lock.files).every(file => record(file) && typeof file.hash === "string" && /^[a-f0-9]{16}$/.test(file.hash) && nonempty(file.template))
    || (lock.version === 2 && !record(lock.clients))) throw new Error("Unsupported harness.lock.json installation lock; preserve it and update the plugin");
  return lock;
}

export function managedRunbookBlock(text) {
  const start = "<!-- harness:runbook:start -->", end = "<!-- harness:runbook:end -->";
  if (text.split(start).length !== 2 || text.split(end).length !== 2 || text.indexOf(start) >= text.indexOf(end)) throw new Error("Claude managed runbook block is missing or ambiguous");
  return text.slice(text.indexOf(start), text.indexOf(end) + end.length);
}

export function validateInstallationFiles(root, client, lock, state = "ready", agent) {
  const selected = lock?.clients?.[client];
  if (lock?.version !== 2 || !record(selected) || selected.state !== state || !Array.isArray(selected.files) || !selected.files.length
    || new Set(selected.files).size !== selected.files.length || !selected.files.every(nonempty)) throw new Error("Template installation is pending or unavailable; run init before continuing");
  const configText = regularText(root, "harness.json");
  if (installationConfigHash(configText) !== selected.configHash) throw new TemplateConfigurationChanged("Configuration changed after template installation; run init");
  const config = parseHarnessConfig(configText);
  for (const name of selected.files) {
    const entry = lock.files[name];
    if (!entry || hashOf(regularText(root, name)) !== entry.hash) throw new Error("Managed template files changed; preserve edits and resolve init before continuing");
  }
  if (client === "claude" && hashOf(managedRunbookBlock(regularText(root, "CLAUDE.md"))) !== selected.managedBlockHash) throw new Error("Claude managed runbook changed; preserve edits and resolve init");
  const tuple = selected.installation;
  if (!record(tuple) || !nonempty(tuple.releaseId) || !nonempty(tuple.language) || tuple.protocol !== TEMPLATE_PROTOCOL || !/^[a-f0-9]{64}$/.test(tuple.clientSurfaceHash ?? "")) throw new Error("A server-approved template installation is required");
  if (agent !== undefined) {
    if (!/^[a-z][a-z0-9-]*$/.test(agent) || !selected.files.includes(`${client === "codex" ? ".codex" : ".claude"}/agents/${agent}.${client === "codex" ? "toml" : "md"}`)) throw new Error("Role is not part of this ready installation");
  }
  if (client === "codex") {
    let metadata;
    try { metadata = JSON.parse(regularText(root, "docs/harness/codex-package.json")); } catch { throw new Error("Codex installation package is unreadable"); }
    if (metadata.language !== tuple.language || Object.keys(tuple).some(key => metadata.installation?.[key] !== tuple[key])) throw new Error("Codex package and installation lock disagree");
  }
  return { installation: { releaseId: tuple.releaseId, language: tuple.language, clientSurfaceHash: tuple.clientSurfaceHash, protocol: TEMPLATE_PROTOCOL }, config };
}

export function readInstalledTemplate(root, client, agent) {
  if (existsSync(safeTarget(root, "harness.init.guard"))) throw new Error("Template init is in progress; wait for its installation commit");
  return validateInstallationFiles(root, client, readInstallationLock(root), "ready", agent);
}

export async function assertInitSessionQuiescent(root) {
  let location;
  try { location = gitRoot(root); } catch {
    if (existsSync(path.join(root, ".git"))) throw new Error("Cannot establish session ownership before init");
    return;
  }
  const files = stateFiles(location.directory);
  mkdirSync(safeTarget(path.dirname(location.directory), path.basename(location.directory)), { recursive: true });
  await withGuard(files, () => {
    if (readState(files)) throw new Error("Stop and release the existing session before template init");
  });
}

export function assertClaudeTemplateSupport(root, minimum = TEMPLATE_CONTRACT.minimumClaudeVersion) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(HARNESS_|OPENAI_|ANTHROPIC_|CODEX_|NODE_OPTIONS$|NODE_PATH$)/.test(name)));
  env.PATH = (process.env.PATH ?? "").split(path.delimiter).filter(directory => {
    if (!path.isAbsolute(directory)) return false;
    const relative = path.relative(root, directory);
    return relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative);
  }).join(path.delimiter);
  let version;
  try {
    const executable = process.env.HARNESS_CLAUDE_CLI ?? "claude";
    if (executable !== "claude" && (!path.isAbsolute(executable) || realpathSync(executable).startsWith(root + path.sep))) throw new Error("Untrusted CLI path");
    version = execFileSync(executable.endsWith(".mjs") ? process.execPath : executable, executable.endsWith(".mjs") ? [executable, "--version"] : ["--version"], { cwd: fileURLToPath(new URL("../", import.meta.url)), env, encoding: "utf8", timeout: 10000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch { throw new Error(`Claude Code ${minimum} or newer is required for template guards`); }
  const match = /^(\d+)\.(\d+)\.(\d+)\b/.exec(version);
  const required = minimum.split(".").map(Number);
  const actual = match?.slice(1).map(Number);
  const comparison = actual?.map((part, index) => Math.sign(part - required[index])).find(value => value !== 0) ?? 0;
  if (!match || comparison < 0) throw new Error(`Update and restart Claude Code to ${minimum} or newer`);
  return match[0];
}
