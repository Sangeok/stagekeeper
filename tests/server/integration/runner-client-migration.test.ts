import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { Client } from "pg";
import { testDatabaseUrl } from "./support";

const migration = (name: string) => readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");

it("applies the shipped migration to original Runner schemas without changing any legacy row", async () => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  const schema = "runner_migration_" + randomUUID().replaceAll("-", "");
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query('CREATE TABLE "Project" ("id" TEXT PRIMARY KEY)');
    await client.query(migration("20261020000000_runner"));
    await client.query(migration("20261022000000_runner_signin_stop"));
    const rows = [
      ["session", null, null, false, "idle", null],
      ["resident", "fixture", "auto", false, "idle", null],
      ["resident", "fixture", "allowlist", false, "working", null],
      ["resident", "fixture", null, true, "stopped", "owner"],
      ["resident", "fixture", null, true, "stopped", "signin"],
      ["resident", "fixture", "auto", false, "stopped", "error"],
    ];
    for (const [index, row] of rows.entries()) {
      await client.query('INSERT INTO "Project" ("id") VALUES ($1)', [String(index)]);
      await client.query('INSERT INTO "Runner" ("projectId", "session", "tokenId", "host", "startedAt", "seenAt", "mode", "branch", "permission", "autostart", "state", "stopReason") VALUES ($1, $1, $1, \'fixture\', \'2026-10-01\', \'2026-10-02\', $2, $3, $4, $5, $6, $7)', [String(index), ...row]);
    }
    const before = (await client.query('SELECT * FROM "Runner" ORDER BY "projectId"')).rows;
    await client.query(migration("20261024020000_runner_client"));
    const after = (await client.query('SELECT * FROM "Runner" ORDER BY "projectId"')).rows;
    assert.deepEqual(after, before.map(row => ({ ...row, client: "claude" })));
    await assert.rejects(client.query('UPDATE "Runner" SET "client" = \'codex\' WHERE "projectId" = \'3\''));
    assert.deepEqual((await client.query('SELECT * FROM "Runner" ORDER BY "projectId"')).rows, after);
  } finally {
    await client.query("ROLLBACK");
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

it("rolls the migration back on an invalid legacy state before adding client metadata", async () => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  const schema = "runner_migration_" + randomUUID().replaceAll("-", "");
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`); await client.query(`SET search_path TO "${schema}"`);
    await client.query('CREATE TABLE "Project" ("id" TEXT PRIMARY KEY)');
    await client.query(migration("20261020000000_runner")); await client.query(migration("20261022000000_runner_signin_stop"));
    await client.query('ALTER TABLE "Runner" DROP CONSTRAINT "Runner_mode_check"');
    await client.query('INSERT INTO "Project" ("id") VALUES (\'bad\')');
    await client.query('INSERT INTO "Runner" ("projectId", "session", "tokenId", "host", "startedAt", "seenAt", "mode", "state") VALUES (\'bad\', \'bad\', \'bad\', \'fixture\', now(), now(), \'unknown\', \'idle\')');
    await assert.rejects(client.query(migration("20261024020000_runner_client")), /legacy client contract/);
    await client.query("ROLLBACK");
    const columns = await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = \'Runner\'', [schema]);
    assert.equal(columns.rows.some(row => row.column_name === "client"), false);
    assert.equal((await client.query('SELECT "mode" FROM "Runner"')).rows[0].mode, "unknown");
  } finally {
    await client.query("ROLLBACK"); await client.query("SET search_path TO public"); await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await client.end();
  }
});
