import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { it } from "node:test";
import pg from "pg";
import { testDatabaseUrl } from "./support";

it("replays the previous schema and preserves active/revoked tokens, relations, indexes and foreign keys", async () => {
  const db = new pg.Client({ connectionString: testDatabaseUrl() });
  const schema = `tokenux_${randomUUID().replaceAll("-", "")}`;
  await db.connect(); const previous = (await db.query("SHOW search_path")).rows[0].search_path;
  try {
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET search_path TO "${schema}"`);
    const directory = new URL("../../../prisma/migrations/", import.meta.url);
    const migration = "20261002000000_token_usage_tracking";
    const old = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name < migration).map((entry) => entry.name).sort();
    assert.equal(old.length, 19); assert.equal(old.at(-1), "20261001000000_automatic_scout_control");
    for (const name of old) await db.query(readFileSync(new URL(`${name}/migration.sql`, directory), "utf8"));
    await db.query(`
      INSERT INTO "User" (id,"githubId",login) VALUES ('u',-1,'owner');
      INSERT INTO "Project" (id,slug,name,"repoOwner",repo,branch,"ownerUserId") VALUES ('p','mine','preserved','owner','repo','main','u');
      INSERT INTO "ProjectToken" (id,"projectId",hash,label,"revokedAt") VALUES ('a','p','a-hash','duplicate',NULL),('ar','p','ar-hash','duplicate',CURRENT_TIMESTAMP);
      INSERT INTO "OwnerToken" (id,"projectId","userId",hash,label,"revokedAt") VALUES ('o','p','u','o-hash','duplicate',NULL),('or','p','u','or-hash','duplicate',CURRENT_TIMESTAMP);
      INSERT INTO "UserToken" (id,"userId",hash,label,"revokedAt") VALUES ('u1','u','u-hash','duplicate',NULL),('ur','u','ur-hash','duplicate',CURRENT_TIMESTAMP);
    `);
    const tables = ["User", "Project", "ProjectToken", "OwnerToken", "UserToken"];
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of tables) result[table] = (await db.query(`SELECT to_jsonb(t) - 'lastUsedAt' - 'usageTrackingStartedAt' - 'expiresAt' - 'usageWindowStartedAt' - 'usageRunCount' AS row FROM "${table}" t ORDER BY id`)).rows;
      return result;
    };
    const catalog = async () => ({
      indexes: (await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() ORDER BY indexname")).rows,
      fks: (await db.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND contype='f' ORDER BY conname")).rows,
    });
    const before = await snapshot(); const catalogBefore = await catalog();
    const columnsBefore = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() ORDER BY table_name,column_name")).rows;
    await db.query(readFileSync(new URL(`${migration}/migration.sql`, directory), "utf8"));
    assert.deepEqual(await snapshot(), before); assert.deepEqual(await catalog(), catalogBefore);
    const columnsAfter = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() ORDER BY table_name,column_name")).rows;
    assert.equal(columnsAfter.length, columnsBefore.length + 6);
    const added = (await db.query("SELECT table_name,column_name,is_nullable,column_default,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND column_name IN ('lastUsedAt','usageTrackingStartedAt') ORDER BY table_name,column_name")).rows;
    assert.deepEqual(added, ["OwnerToken", "ProjectToken", "UserToken"].flatMap((table_name) => ["lastUsedAt", "usageTrackingStartedAt"].map((column_name) => ({ table_name, column_name, is_nullable: "YES", column_default: null, data_type: "timestamp without time zone" }))));
    for (const table of ["ProjectToken", "OwnerToken", "UserToken"]) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "lastUsedAt" IS NULL AND "usageTrackingStartedAt" IS NULL`)).rows[0].n, 2);
    }
    // A legacy writer that omits the added columns remains compatible after migration.
    await db.query(`INSERT INTO "ProjectToken" (id,"projectId",hash,label) VALUES ('legacy-a','p','legacy-a-hash','legacy'); INSERT INTO "OwnerToken" (id,"projectId","userId",hash,label) VALUES ('legacy-o','p','u','legacy-o-hash','legacy'); INSERT INTO "UserToken" (id,"userId",hash,label) VALUES ('legacy-u','u','legacy-u-hash','legacy')`);
    for (const table of ["ProjectToken", "OwnerToken", "UserToken"]) assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "lastUsedAt" IS NULL AND "usageTrackingStartedAt" IS NULL`)).rows[0].n, 3);
    await db.query(`INSERT INTO "AgentRun" (id,"projectId",agent,"tokenId","stepId") VALUES ('old-run','p','pm','old-token','start')`);
    const legacyRun = (await db.query(`SELECT * FROM "AgentRun" WHERE id='old-run'`)).rows;
    const beforeUsage = await snapshot();
    await db.query(readFileSync(new URL("20261002010000_account_usage_window/migration.sql", directory), "utf8"));
    await db.query(readFileSync(new URL("20261002020000_token_management_metadata/migration.sql", directory), "utf8"));
    assert.deepEqual(await snapshot(), beforeUsage); assert.deepEqual(await catalog(), catalogBefore);
    assert.deepEqual((await db.query(`SELECT * FROM "AgentRun" WHERE id='old-run'`)).rows, legacyRun);
    assert.deepEqual((await db.query(`SELECT "usageWindowStartedAt","usageRunCount" FROM "User"`)).rows, [{ usageWindowStartedAt: null, usageRunCount: 0 }]);
    for (const table of ["ProjectToken", "OwnerToken", "UserToken"]) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "expiresAt" IS NULL`)).rows[0].n, 3);
    }
  } finally {
    await db.query("ROLLBACK"); await db.query("SELECT set_config('search_path',$1,false)", [previous]);
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.end();
  }
});
