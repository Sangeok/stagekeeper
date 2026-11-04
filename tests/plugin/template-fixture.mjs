import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashOf } from "../../packages/core/templates/manifest.mjs";
import { TEMPLATE_CONTRACT, TEMPLATE_PROTOCOL, deliverySurfaceHash, manifestHash } from "../../packages/core/templates/release-manifest.mjs";
import { installationConfigHash, managedRunbookBlock } from "../../plugin/runtime/template-installation.mjs";

export const fixtureInstallation = { releaseId: "fixture-release", language: "en", clientSurfaceHash: "a".repeat(64), protocol: TEMPLATE_PROTOCOL };
export function versionedDelivery(body, client = "claude") {
  if (!body?.templates || Array.isArray(body.templates)) return body;
  const templates = Object.fromEntries(Object.entries(body.templates).filter(([, value]) => value !== undefined).map(([name, value]) => [name,
    typeof value === "string" && (name.startsWith("agents/") || name.endsWith(".runbook.md")) && !value.includes(TEMPLATE_CONTRACT.installationGuide)
      ? `${value.replaceAll("\r\n", "\n")}\n\n${TEMPLATE_CONTRACT.installationGuide}\n` : value]));
  return { ...body, templates, templateContract: TEMPLATE_CONTRACT, templateRelease: { id: "fixture-release", schemaVersion: 1, protocol: TEMPLATE_PROTOCOL,
    language: "en", clientSurfaceHash: deliverySurfaceHash({ templates, language: "en", client, contractHash: manifestHash(TEMPLATE_CONTRACT) }) } };
}

export function claudeFixtureExecutable() {
  const root = mkdtempSync(path.join(tmpdir(), "template-claude-version-")), executable = path.join(root, "claude.mjs");
  writeFileSync(executable, 'console.log("2.1.295 (Claude Code)");\n');
  return executable;
}

export function installReadyFixture(root, client = "claude") {
  const config = readFileSync(path.join(root, "harness.json"), "utf8");
  const files = {};
  const names = ["docs/plans/template.md"];
  for (const agent of ["pm", "work-assigner", "work-discoverer", "feature-scout", "doc-auditor", "plan-verifier", "qa-verifier", "impl-verifier", ...(JSON.parse(config).workspaces ?? []).map(ws => ws.agent)]) {
    names.push(`${client === "claude" ? ".claude" : ".codex"}/agents/${agent}.${client === "claude" ? "md" : "toml"}`);
  }
  for (const name of names) {
    const target = path.join(root, name); mkdirSync(path.dirname(target), { recursive: true });
    if (!existsSync(target)) writeFileSync(target, "Fixture managed instructions\n");
    files[name] = { template: "fixture/" + name, hash: hashOf(readFileSync(target, "utf8")) };
  }
  if (client === "codex") {
    const name = "docs/harness/codex-package.json", target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    const metadata = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : { client, protocol: "harness-runtime-v1", runbook: "a".repeat(12) };
    writeFileSync(target, JSON.stringify({ ...metadata, language: "en", installation: fixtureInstallation }));
    files[name] = { template: "fixture/package", hash: hashOf(readFileSync(target, "utf8")) };
  }
  let managedBlockHash;
  if (client === "claude") {
    try { managedBlockHash = hashOf(managedRunbookBlock(readFileSync(path.join(root, "CLAUDE.md"), "utf8"))); }
    catch { managedBlockHash = "invalid-fixture-block"; }
  }
  writeFileSync(path.join(root, "harness.lock.json"), JSON.stringify({ version: 2, files, clients: { [client]: {
    state: "ready", installation: fixtureInstallation, configHash: installationConfigHash(config), files: Object.keys(files),
    ...(client === "claude" ? { managedBlockHash, minimumClaudeVersion: "2.1.295" } : {}),
  } } }));
  return fixtureInstallation;
}
