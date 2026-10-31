import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { Client } from "pg";
import { testDatabaseUrl } from "./support";

it("backfills current runs without changing work, reports or approval evidence and permits later runs", async () => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  const schema = `migration_${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`CREATE TABLE "BoardItem" (id TEXT PRIMARY KEY, status TEXT, "acceptedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3));
      CREATE TABLE "PipelineRun" (id TEXT PRIMARY KEY, "boardItemId" TEXT REFERENCES "BoardItem"(id), "enteredAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3));
      CREATE UNIQUE INDEX "PipelineRun_boardItemId_key" ON "PipelineRun"("boardItemId");
      CREATE TABLE "Report" (id TEXT PRIMARY KEY, "pipelineRunId" TEXT REFERENCES "PipelineRun"(id), path TEXT);
      INSERT INTO "BoardItem" VALUES ('accepted', 'done', '2026-10-01', '2026-10-02'), ('active', 'implementing', NULL, '2026-10-03'), ('empty', 'proposed', NULL, '2026-10-04');
      INSERT INTO "PipelineRun" VALUES ('old-completed', 'accepted', '2026-10-01', '2026-10-02'), ('old-active', 'active', '2026-10-03', NULL);
      INSERT INTO "Report" VALUES ('evidence', 'old-completed', 'docs/report.md');`);
    const before = (await client.query('SELECT id, status, "acceptedAt", "updatedAt" FROM "BoardItem" ORDER BY id')).rows;
    const migration = await readFile("prisma/migrations/20261031090000_contextual_pipeline_runs/migration.sql", "utf8");
    await client.query(migration);
    assert.deepEqual((await client.query('SELECT id, status, "acceptedAt", "updatedAt" FROM "BoardItem" ORDER BY id')).rows, before);
    assert.deepEqual((await client.query('SELECT id, "currentRunId" FROM "BoardItem" ORDER BY id')).rows, [
      { id: "accepted", currentRunId: "old-completed" }, { id: "active", currentRunId: "old-active" }, { id: "empty", currentRunId: null },
    ]);
    assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "PipelineRun" WHERE "createdAt" = "enteredAt"')).rows[0].count, 2);
    await client.query(`INSERT INTO "PipelineRun" (id, "boardItemId", "enteredAt", "inputReportId") VALUES ('check', 'accepted', CURRENT_TIMESTAMP, 'evidence');
      UPDATE "BoardItem" SET "currentRunId" = 'check' WHERE id = 'accepted';`);
    assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM "PipelineRun"')).rows[0].count, 3);
    assert.deepEqual((await client.query('SELECT * FROM "Report"')).rows, [{ id: "evidence", pipelineRunId: "old-completed", path: "docs/report.md" }]);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
