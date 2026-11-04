import { createHash } from "node:crypto";
import { deliverable } from "./deliver.mjs";
import { COMMON_DOCS, validateCodexBundle } from "./codex-bundle.mjs";

export const TEMPLATE_PROTOCOL = "template-release-v1";
const INSTALLATION_GUIDE = [
  "## Template installation contract",
  "On every pipeline_next and agent_next call, include the verified installation below, even where an older example omits it.",
  "installation = {{installation}}",
  "On every agent_next initial, resume and outcome call, repeat project, agent and the item key from the briefing. An entry, execution or receipt never replaces key. Only keyless project roles omit key.",
  "For agent_next preserve the exact entry or execution object from the fresh parent briefing and every returned receipt. Never invent or interchange parent run IDs and AgentRun receipt IDs.",
  "If pipeline_next has moved past your bound entry, stop this role and return to the parent for fresh advice; do not keep retrying the old entry.",
  "An allowed independent role without a parent uses execution: {kind: standalone}. Item roles and work assignment require their supplied pipeline binding.",
  "The server's templateRelease identifies the pinned instructions. It may differ from the installed release when the public surface is compatible; keep the verified local installation tuple.",
  "Before dispatch, recheck the installation with the installed template guard or session helper. On a pending, modified, incompatible or missing installation, stop and request init for the required release; do not adopt files automatically.",
].join("\n");
export const TEMPLATE_CONTRACT = Object.freeze({ schemaVersion: 1, parser: 1, runtime: "harness-runtime-v1", aliases: 1,
  minimumClaudeVersion: "2.1.295", installationGuide: INSTALLATION_GUIDE, clients: Object.freeze(["claude", "codex"]) });

export function installationGuide(installation) {
  return INSTALLATION_GUIDE.replace("{{installation}}", canonicalJson(installation));
}

export function readTemplateContract(manifest, expectedHash) {
  const contract = manifest?.contract;
  const fields = ["schemaVersion", "parser", "runtime", "aliases", "minimumClaudeVersion", "installationGuide", "clients"];
  if (!contract || typeof contract !== "object" || Array.isArray(contract) || Object.keys(contract).length !== fields.length
    || fields.some(field => !Object.hasOwn(contract, field)) || contract.schemaVersion !== 1 || contract.parser !== 1
    || contract.runtime !== "harness-runtime-v1" || contract.aliases !== 1 || !/^\d+\.\d+\.\d+$/.test(contract.minimumClaudeVersion ?? "")
    || JSON.stringify(contract.clients) !== '["claude","codex"]' || typeof contract.installationGuide !== "string"
    || contract.installationGuide.split("{{installation}}").length !== 2 || /^## step:/m.test(contract.installationGuide)
    || contract.installationGuide.includes("<!-- harness-runtime:") || manifestHash(contract) !== expectedHash) throw new Error("Unsupported template interpretation contract");
  return contract;
}

export function releaseDeliverable(rows, plan, client, contract = TEMPLATE_CONTRACT) {
  const bundle = deliverable(rows, plan, client);
  return { ...bundle, templates: Object.fromEntries(Object.entries(bundle.templates).map(([path, body]) => [path,
    path.startsWith("agents/") || path.endsWith(".runbook.md") ? `${body}\n\n${contract.installationGuide}\n` : body])) };
}

export function deliverySurfaceHash({ templates, language, client, contractHash }) {
  return manifestHash({ client, language, contractHash, templates });
}

export function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Unsupported canonical manifest value");
}

export function manifestHash(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function normalizeTemplateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Empty template release");
  const keys = new Set();
  const normalized = rows.map(row => {
    if (!row || typeof row.lang !== "string" || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(row.lang)
      || typeof row.path !== "string" || !/^(?:agents\/[a-z][a-z0-9-]*\.md|docs\/(?:plans|agents)\/(?:README|[a-z-]+)\.md|(?:CLAUDE|CODEX)\.runbook\.md)$/.test(row.path)
      || typeof row.body !== "string" || !row.body.trim()) throw new Error("Invalid template release entry");
    const key = `${row.lang}/${row.path}`;
    if (keys.has(key)) throw new Error("Duplicate template release entry");
    keys.add(key);
    return { lang: row.lang, path: row.path, body: row.body.replaceAll("\r\n", "\n") };
  });
  return normalized.sort((a, b) => a.lang < b.lang ? -1 : a.lang > b.lang ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function sourceKey(source) {
  if (source?.kind === "git" && source.repository === "Sangeok/harness-templates" && /^[a-f0-9]{40}$/.test(source.commit)) return `git:${source.repository}@${source.commit}`;
  if (source?.kind === "legacy-snapshot" && /^[a-f0-9]{64}$/.test(source.snapshotHash)) return `legacy:${source.snapshotHash}`;
  throw new Error("An approved immutable template source is required");
}

export function prepareTemplateRelease(rows, source) {
  const key = sourceKey(source);
  const normalized = normalizeTemplateRows(rows);
  const languages = [...new Set(normalized.map(row => row.lang))];
  for (const language of languages) {
    const entries = normalized.filter(row => row.lang === language);
    validateCodexBundle(entries, "max");
    for (const required of ["CLAUDE.runbook.md", ...COMMON_DOCS]) {
      if (!entries.some(row => row.path === required)) throw new Error("Incomplete template language");
    }
  }
  const manifest = { schemaVersion: 1, contract: TEMPLATE_CONTRACT, languages, entryCount: normalized.length };
  const contentHash = manifestHash(normalized), contractHash = manifestHash(TEMPLATE_CONTRACT);
  return { sourceKey: key, manifest, rows: normalized, contentHash, contractHash,
    releaseIdentity: manifestHash({ sourceKey: key, manifestVersion: 1, contentHash, contractHash }) };
}

export function selectTemplateLanguage(languages, requested) {
  if (languages.includes(requested)) return requested;
  return languages.includes("en") ? "en" : null;
}

export function installationFor({ releaseId, rows, language, plan, client, contractHash, contract = TEMPLATE_CONTRACT }) {
  readTemplateContract({ contract }, contractHash);
  const { templates } = releaseDeliverable(rows.filter(row => row.lang === language), plan, client, contract);
  return { releaseId, language, protocol: TEMPLATE_PROTOCOL,
    clientSurfaceHash: deliverySurfaceHash({ client, language, contractHash, templates }) };
}

export function compatibleInstallation(installed, required) {
  return !!installed && installed.protocol === TEMPLATE_PROTOCOL && installed.language === required.language
    && installed.clientSurfaceHash === required.clientSurfaceHash;
}
