import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { validateCodexBundle } from "@harness/core/client-runtime.mjs";
import { splitTemplate } from "../../src/server/agents/steps";

export type TemplateSource = { lang: string; path: string; body: string };
type TemplateStore = {
  findUnique(args: { where: { lang_path: { lang: string; path: string } } }): Promise<{ body: string } | null>;
  upsert(args: { where: { lang_path: { lang: string; path: string } }; create: TemplateSource; update: { body: string } }): Promise<unknown>;
  delete(args: { where: { lang_path: { lang: string; path: string } } }): Promise<unknown>;
};
export type SeedSnapshot = { version: 1; sourceRevision: string; sourceHash: string; rows: (TemplateSource & { previous: string | null })[] };

export function validateTemplateSources(rows: TemplateSource[]): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = `${row.lang}/${row.path}`;
    if (!row.lang || !row.body.trim() || keys.has(key) || !/^(?:agents\/[a-z][a-z0-9-]*\.md|docs\/(?:plans|agents)\/(?:README|[a-z-]+)\.md|(?:CLAUDE|CODEX)\.runbook\.md)$/.test(row.path)) throw new Error(`Invalid or duplicate template: ${key}`);
    keys.add(key);
    if (row.path.startsWith("agents/") && splitTemplate(row.body).steps.length === 0) throw new Error(`Empty agent steps: ${key}`);
  }
  for (const lang of new Set(rows.map(row => row.lang))) {
    const bundle = rows.filter(row => row.lang === lang);
    if (bundle.some(row => row.path === "CODEX.runbook.md")) validateCodexBundle(bundle, "max");
  }
}

export function readTemplateSources(directory: string): TemplateSource[] {
  const rows: TemplateSource[] = [];
  const walk = (root: string, current: string, lang: string) => {
    for (const name of readdirSync(current).sort()) {
      if (name.startsWith(".")) continue;
      const file = join(current, name), stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("Template symlink refused");
      if (stat.isDirectory()) walk(root, file, lang);
      else if (stat.isFile() && name.endsWith(".md")) rows.push({ lang, path: relative(root, file).split(sep).join("/"), body: readFileSync(file, "utf8").replace(/\r\n/g, "\n") });
    }
  };
  for (const lang of readdirSync(directory).filter(name => !name.startsWith("."))) {
    const root = join(directory, lang), stat = lstatSync(root);
    if (stat.isSymbolicLink()) throw new Error("Template language symlink refused");
    if (stat.isDirectory()) walk(root, root, lang);
  }
  validateTemplateSources(rows);
  return rows;
}

export function templateSourceHash(rows: TemplateSource[]): string {
  return createHash("sha256").update(JSON.stringify(rows.map(({ lang, path, body }) => ({ lang, path, body })))).digest("hex");
}

export async function snapshotTemplates(store: TemplateStore, rows: TemplateSource[], sourceRevision: string): Promise<SeedSnapshot> {
  validateTemplateSources(rows);
  const previous = await Promise.all(rows.map(async row => ({ ...row, previous: (await store.findUnique({ where: { lang_path: { lang: row.lang, path: row.path } } }))?.body ?? null })));
  return { version: 1, sourceRevision, sourceHash: templateSourceHash(rows), rows: previous };
}

export async function seedTemplates(store: TemplateStore, rows: TemplateSource[]): Promise<number> {
  // 모든 검증을 첫 upsert보다 앞에서 마친다. 호출자는 단일 DB transaction을 제공한다.
  validateTemplateSources(rows);
  for (const row of rows) await store.upsert({ where: { lang_path: { lang: row.lang, path: row.path } }, create: row, update: { body: row.body } });
  return rows.length;
}

export async function restoreTemplates(store: TemplateStore, snapshot: SeedSnapshot): Promise<number> {
  if (snapshot.version !== 1 || !snapshot.sourceRevision || templateSourceHash(snapshot.rows) !== snapshot.sourceHash) throw new Error("Snapshot identity/hash mismatch");
  validateTemplateSources(snapshot.rows);
  for (const row of snapshot.rows) {
    if (row.previous !== null && typeof row.previous !== "string") throw new Error("Invalid snapshot previous body");
    if (row.previous === null && row.path !== "CODEX.runbook.md") throw new Error("Restore refuses deletion outside introduced Codex runbook rows");
    const current = await store.findUnique({ where: { lang_path: { lang: row.lang, path: row.path } } });
    if (current?.body !== row.body) throw new Error(`Current template changed since seed: ${row.lang}/${row.path}`);
  }
  for (const row of snapshot.rows) {
    const where = { lang_path: { lang: row.lang, path: row.path } };
    if (row.previous === null) await store.delete({ where });
    else await store.upsert({ where, create: { lang: row.lang, path: row.path, body: row.previous }, update: { body: row.previous } });
  }
  return snapshot.rows.length;
}
