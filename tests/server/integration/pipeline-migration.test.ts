import assert from "node:assert/strict";
import { it } from "node:test";
import { cleanupBoundary, executionSnapshot, migrationA, migrationB, withPredecessor, type SqlConnection } from "../fixtures/pipeline-migration";

async function catalog(db: SqlConnection) {
  return {
    columns: (await db.query("SELECT table_name,column_name,is_nullable,data_type,column_default FROM information_schema.columns WHERE table_schema=current_schema() ORDER BY table_name,ordinal_position")).rows,
    constraints: (await db.query("SELECT conrelid::regclass::text AS table_name,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND contype <> 'n' ORDER BY conname")).rows,
    indexes: (await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() ORDER BY indexname")).rows,
  };
}

async function pipelineSnapshot(db: SqlConnection) {
  const rows: Record<string, unknown> = {};
  for (const table of ["Project", "Pipeline", "PipelineDefinition", "PipelineRule", "PipelineVersion"]) {
    rows[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows;
  }
  return { ...rows, execution: await executionSnapshot(db) };
}

it("migration A replays every predecessor and backfills empty, legacy and slots projects while preserving executable history", async () => {
  await withPredecessor(async db => {
    const before = await executionSnapshot(db);
    const oldVersions = (await db.query('SELECT to_jsonb(v) AS row FROM "PipelineVersion" v ORDER BY id')).rows;
    const indexesSql = "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() ORDER BY indexname";
    const fksSql = "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND contype='f' ORDER BY conname";
    const indexes = (await db.query(indexesSql)).rows, fks = (await db.query(fksSql)).rows;
    await db.query(migrationA);
    assert.deepEqual(await executionSnapshot(db), before);
    assert.deepEqual((await db.query(`SELECT to_jsonb(v)-'pipelineId' AS row FROM "PipelineVersion" v ORDER BY id`)).rows, oldVersions);
    assert.deepEqual((await db.query('SELECT id,"defaultPipelineId","autoProposeEnabled" FROM "Project" ORDER BY id')).rows, [
      { id: "empty", defaultPipelineId: "default_empty", autoProposeEnabled: true },
      { id: "legacy", defaultPipelineId: "default_legacy", autoProposeEnabled: true },
      { id: "off", defaultPipelineId: "default_off", autoProposeEnabled: false },
      { id: "slots", defaultPipelineId: "default_slots", autoProposeEnabled: false },
    ]);
    const definitions = (await db.query('SELECT "pipelineId",version,steps,gates,"createdBy","createdAt" FROM "PipelineDefinition" ORDER BY "pipelineId"')).rows;
    assert.equal(definitions.length, 3);
    const originalDate = (await db.query('SELECT "createdAt" FROM "PipelineVersion" WHERE id=\'latest\'')).rows[0].createdAt;
    assert.deepEqual(definitions[0], { pipelineId: "default_legacy", version: 1, steps: ["plan", "implement", "accept"], gates: ["before-plan"], createdBy: "latest-author", createdAt: originalDate });
    assert.equal(definitions[1].createdBy, "off-author"); assert.equal(definitions[2].createdBy, "slot-author");
    assert.deepEqual((await db.query('SELECT DISTINCT "pipelineId" FROM "PipelineVersion" ORDER BY "pipelineId"')).rows.map(row => row.pipelineId), ["default_legacy", "default_off", "default_slots"]);
    const newIndexes = (await db.query(indexesSql)).rows;
    assert.deepEqual(newIndexes.filter(row => indexes.some(old => old.indexname === row.indexname)), indexes);
    assert.deepEqual(newIndexes.filter(row => !indexes.some(old => old.indexname === row.indexname)).map(row => row.indexname), [
      "PipelineDefinition_pipelineId_version_key", "PipelineDefinition_pkey", "PipelineRule_pkey", "PipelineVersion_pipelineId_version_idx", "Pipeline_pkey", "Pipeline_projectId_archivedAt_idx",
    ]);
    const newFks = (await db.query(fksSql)).rows;
    assert.deepEqual(newFks.filter(row => fks.some(old => old.conname === row.conname)), fks); assert.equal(newFks.length, fks.length + 6);
    assert.equal((await db.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='PipelineVersion' AND column_name='pipelineId'`)).rows[0].is_nullable, "YES");
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "PipelineRule"')).rows[0].count, 0);
  });
});

it("migration B rejects old-writer nulls without changing data or constraints", async () => {
  await withPredecessor(async db => {
    await db.query(`INSERT INTO "PipelineVersion" (id,"projectId",version,nodes,gates,"createdBy")
      VALUES ('old-writer','empty',1,ARRAY['propose','plan','implement','accept'],ARRAY[]::text[],'old')`);
    const before = await pipelineSnapshot(db), structure = await catalog(db);
    await assert.rejects(db.query(migrationB), /old or invalid pipeline writer remains; stop cutover/);
    await db.query("ROLLBACK");
    assert.deepEqual(await pipelineSnapshot(db), before);
    assert.deepEqual(await catalog(db), structure);
  }, cleanupBoundary);
});

it("migration B requires ownership, retains all foreign keys and indexes, and preserves existing execution history", async () => {
  await withPredecessor(async db => {
    const before = await pipelineSnapshot(db), structure = await catalog(db);
    await db.query(migrationB);
    assert.deepEqual(await pipelineSnapshot(db), before);
    assert.deepEqual(await catalog(db), {
      ...structure,
      columns: structure.columns.map(column => column.table_name === "PipelineVersion" && column.column_name === "pipelineId" ? { ...column, is_nullable: "NO" } : column),
    });
    await assert.rejects(db.query(`INSERT INTO "PipelineVersion" (id,"projectId",version,nodes,gates,"createdBy")
      VALUES ('missing-owner','empty',1,ARRAY['plan','implement','accept'],ARRAY[]::text[],'old')`), { code: "23502" });
    await assert.rejects(db.query(`UPDATE "PipelineVersion" SET "pipelineId"=NULL WHERE id='latest'`), { code: "23502" });
    await assert.rejects(db.query(`UPDATE "PipelineVersion" SET "pipelineId"='missing' WHERE id='latest'`), { code: "23503" });
    assert.deepEqual(await pipelineSnapshot(db), before, "Rejected writers leave both pipeline and execution ledgers intact");
    await db.query(`INSERT INTO "PipelineVersion" (id,"projectId","pipelineId",version,nodes,gates,format,"createdBy")
      VALUES ('new-writer','empty','default_empty',1,ARRAY['plan','implement','accept'],ARRAY[]::text[],'slots-v1','pipeline')`);
    assert.equal((await db.query(`SELECT "pipelineId" FROM "PipelineVersion" WHERE id='new-writer'`)).rows[0].pipelineId, "default_empty");
    await db.query(`INSERT INTO "Project" (id,slug,name,"repoOwner",repo,branch,"ownerUserId") VALUES ('lazy','lazy','lazy','owner','repo','main','u')`);
    assert.equal((await db.query(`SELECT "defaultPipelineId" FROM "Project" WHERE id='lazy'`)).rows[0].defaultPipelineId, null, "Project defaults remain lazy after B");
  }, cleanupBoundary);
});
