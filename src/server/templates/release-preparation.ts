import { validateCodexBundle, COMMON_DOCS } from "@harness/shared/templates/codex-bundle.mjs";

import { deliverable } from "@harness/shared/templates/deliver.mjs";

import { manifestHash, deliverySurfaceHash } from "@harness/shared/templates/manifest-hash.mjs";

import { TEMPLATE_CONTRACT, readTemplateContract, TEMPLATE_PROTOCOL } from "@harness/shared/templates/release-contract.mjs";

import type { TemplateContract, Installation } from "@harness/shared/templates/release-contract.mjs";

export type TemplateRow = { lang: string; path: string; body: string };

export type TemplateSource = { kind: "git"; repository: "Sangeok/harness-templates"; commit: string } | { kind: "legacy-snapshot"; snapshotHash: string };

export function releaseDeliverable(rows: { path: string; body: string }[], plan: "free" | "pro" | "max", client: "claude" | "codex", contract: TemplateContract = TEMPLATE_CONTRACT): { templates: Record<string, string>; entitlement: { plan: "free" | "pro" | "max"; agents: string[] }; runtime?: { client: "codex"; protocol: string } } {
  const bundle = deliverable(rows, plan, client);
  return { ...bundle, templates: Object.fromEntries(Object.entries(bundle.templates).map(([path, body]) => [path,
    path.startsWith("agents/") || path.endsWith(".runbook.md") ? `${body}\n\n${contract.installationGuide}\n` : body])) };
}

export function normalizeTemplateRows(rows: unknown): TemplateRow[] {
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

export function sourceKey(input: unknown): string {
  const source = input as { kind?: string; repository?: string; commit: string; snapshotHash: string } | null;
  if (source?.kind === "git" && source.repository === "Sangeok/harness-templates" && /^[a-f0-9]{40}$/.test(source.commit)) return `git:${source.repository}@${source.commit}`;
  if (source?.kind === "legacy-snapshot" && /^[a-f0-9]{64}$/.test(source.snapshotHash)) return `legacy:${source.snapshotHash}`;
  throw new Error("An approved immutable template source is required");
}

export function prepareTemplateRelease(rows: unknown, source: TemplateSource): { sourceKey: string; manifest: { schemaVersion: number; contract: typeof TEMPLATE_CONTRACT; languages: string[]; entryCount: number }; rows: TemplateRow[]; contentHash: string; contractHash: string; releaseIdentity: string } {
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

export function selectTemplateLanguage(languages: readonly string[], requested: string): string | null {
  if (languages.includes(requested)) return requested;
  return languages.includes("en") ? "en" : null;
}

export function installationFor({ releaseId, rows, language, plan, client, contractHash, contract = TEMPLATE_CONTRACT }: { releaseId: string; rows: TemplateRow[]; language: string; plan: "free" | "pro" | "max"; client: "claude" | "codex"; contractHash: string; contract?: TemplateContract }): Installation {
  readTemplateContract({ contract }, contractHash);
  const { templates } = releaseDeliverable(rows.filter(row => row.lang === language), plan, client, contract);
  return { releaseId, language, protocol: TEMPLATE_PROTOCOL,
    clientSurfaceHash: deliverySurfaceHash({ client, language, contractHash, templates }) };
}
