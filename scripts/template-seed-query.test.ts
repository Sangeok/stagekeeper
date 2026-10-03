import assert from "node:assert/strict";
import { it } from "node:test";
import { COMMON_DOCS, RUNTIME_MARKER } from "@harness/core/client-runtime.mjs";
import { seedTemplates, snapshotTemplates, restoreTemplates, type TemplateSource } from "./lib/template-seed-query";

const rows: TemplateSource[] = [
  { lang: "en", path: "CODEX.runbook.md", body: RUNTIME_MARKER + "\nsource" },
  ...COMMON_DOCS.map(path => ({ lang: "en", path, body: "shared" })),
  ...["dev", "pm", "feature-scout", "doc-auditor", "plan-verifier"].map(role => ({ lang: "en", path: `agents/${role}.md`, body: `${RUNTIME_MARKER}\n## step:read\nRead.\nnext: done\n` })),
];
function database() {
  const data = new Map<string, string>(), writes: string[] = [];
  const key = (where: { lang_path: { lang: string; path: string } }) => `${where.lang_path.lang}/${where.lang_path.path}`;
  const store = {
    findUnique: async ({ where }: { where: Parameters<typeof key>[0] }) => data.has(key(where)) ? { body: data.get(key(where))! } : null,
    upsert: async ({ where, update }: { where: Parameters<typeof key>[0]; update: { body: string } }) => { writes.push(`upsert:${key(where)}`); data.set(key(where), update.body); },
    delete: async ({ where }: { where: Parameters<typeof key>[0] }) => { writes.push(`delete:${key(where)}`); data.delete(key(where)); },
  };
  return { data, writes, store };
}
it("validates the entire source before even the first write", async () => {
  for (const invalid of [rows.slice(0, -1), [...rows, rows[0]], rows.map((row, index) => index === rows.length - 1 ? { ...row, body: `${RUNTIME_MARKER}\n## step:broken\nBad\nnext: missing` } : row)]) {
    const db = database(); await assert.rejects(() => seedTemplates(db.store, invalid)); assert.deepEqual(db.writes, []);
  }
});
it("restores only snapshotted bodies and deletes only introduced Codex rows", async () => {
  const db = database();
  for (const row of rows.filter(row => row.path !== "CODEX.runbook.md")) db.data.set(`${row.lang}/${row.path}`, "old");
  db.data.set("en/foreign.md", "foreign");
  const snapshot = await snapshotTemplates(db.store, rows, "approved-private-revision");
  await seedTemplates(db.store, rows); db.writes.length = 0;
  assert.equal(await restoreTemplates(db.store, snapshot), rows.length);
  assert.equal(db.data.has("en/CODEX.runbook.md"), false); assert.equal(db.data.get("en/foreign.md"), "foreign");
  assert.deepEqual(db.writes.filter(write => write.startsWith("delete:")), ["delete:en/CODEX.runbook.md"]);
  assert.equal(db.data.get("en/agents/dev.md"), "old");
});
it("rejects current-body drift or a new non-Codex row before any restoration", async () => {
  for (const changed of [true, false]) {
    const db = database(); for (const row of rows) db.data.set(`${row.lang}/${row.path}`, "old");
    if (!changed) db.data.delete("en/agents/dev.md");
    const snapshot = await snapshotTemplates(db.store, rows, "approved-private-revision"); await seedTemplates(db.store, rows);
    if (changed) db.data.set("en/agents/dev.md", "newer source");
    db.writes.length = 0; await assert.rejects(() => restoreTemplates(db.store, snapshot)); assert.deepEqual(db.writes, []);
  }
});
