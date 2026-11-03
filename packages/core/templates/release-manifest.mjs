import { createHash } from "node:crypto";
import { deliverable } from "./deliver.mjs";
import { COMMON_DOCS, validateCodexBundle } from "./codex-bundle.mjs";

export const TEMPLATE_PROTOCOL = "template-release-v1";
export const TEMPLATE_CONTRACT = Object.freeze({ schemaVersion: 1, parser: 1, runtime: "harness-runtime-v1", aliases: 1, clients: Object.freeze(["claude", "codex"]) });

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

export function installationFor({ releaseId, rows, language, plan, client, contractHash }) {
  if (contractHash !== manifestHash(TEMPLATE_CONTRACT)) throw new Error("Unsupported template interpretation contract");
  const { templates } = deliverable(rows.filter(row => row.lang === language), plan, client);
  return { releaseId, language, protocol: TEMPLATE_PROTOCOL,
    clientSurfaceHash: manifestHash({ client, language, contractHash, templates }) };
}

export function compatibleInstallation(installed, required) {
  return !!installed && installed.protocol === TEMPLATE_PROTOCOL && installed.language === required.language
    && installed.clientSurfaceHash === required.clientSurfaceHash;
}
