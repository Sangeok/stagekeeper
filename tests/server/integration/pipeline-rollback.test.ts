import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { executionSnapshot, migrationA, migrationB, withPredecessor } from "../fixtures/pipeline-migration";

const proposal = readFileSync(new URL("../../../docs/proposals/completed/2026-10-16-multiple-pipelines.md", import.meta.url), "utf8");
const rollback = [...proposal.matchAll(/```sql\r?\n([\s\S]*?)```/g)].map(match => match[1]).find(sql => sql.includes("rollback_"));
assert.ok(rollback, "The proposal must retain its executable rollback procedure");

for (const stage of ["before B", "after B"] as const) it(`${stage}, rollback uses each default even when another pipeline owns the maximum version, preserves runs and permits old writers`, async () => {
  await withPredecessor(async db => {
    await db.query(migrationA);
    if (stage === "after B") await db.query(migrationB);
    await db.query(`
      INSERT INTO "Pipeline" (id,"projectId",name,"createdBy") VALUES ('other','legacy','Other','u');
      INSERT INTO "PipelineVersion" (id,"projectId","pipelineId",version,nodes,gates,format,"createdBy") VALUES
        ('other-v','legacy','other',8,ARRAY['plan','verify','implement','accept'],ARRAY[]::text[],'slots-v1','u'),
        ('off-old-propose','off','default_off',2,ARRAY['propose','plan','implement','accept'],ARRAY['before-plan'],NULL,'u');
    `);
    const before = await executionSnapshot(db);
    await db.query(rollback);
    assert.equal((await db.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='PipelineVersion' AND column_name='pipelineId'`)).rows[0].is_nullable, "YES");
    assert.deepEqual(await executionSnapshot(db), before);
    const rows = (await db.query(`SELECT "projectId","pipelineId",version,nodes,format FROM "PipelineVersion" WHERE id LIKE 'rollback_%' ORDER BY "projectId"`)).rows;
    assert.deepEqual(rows, [
      { projectId: "legacy", pipelineId: "default_legacy", version: 9, nodes: ["propose", "plan", "implement", "accept"], format: null },
      { projectId: "off", pipelineId: "default_off", version: 3, nodes: ["plan", "implement", "accept"], format: null },
      { projectId: "slots", pipelineId: "default_slots", version: 2, nodes: ["plan", "implement", "accept"], format: "slots-v1" },
    ]);
    await db.query(`
      INSERT INTO "Project" (id,slug,name,"repoOwner",repo,branch,"ownerUserId") VALUES ('new','new','new','owner','repo','main','u');
      INSERT INTO "PipelineVersion" (id,"projectId",version,nodes,gates,"createdBy") VALUES
        ('old-save','legacy',10,ARRAY['propose','plan','implement','accept'],ARRAY['before-plan'],'u'),
        ('old-lazy','new',1,ARRAY['propose','plan','implement','accept'],ARRAY['before-plan'],'pipeline');
    `);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "PipelineVersion" WHERE "pipelineId" IS NULL')).rows[0].count, 2, "A compensating migration must repair old-writer nulls before NOT NULL can return");
    await assert.rejects(db.query(migrationB), /old or invalid pipeline writer remains; stop cutover/, "Even rerunning the B SQL cannot repair old-writer data");
    await db.query("ROLLBACK");
  });
});

for (const stage of ["before B", "after B"] as const) it(`${stage}, rollback refuses exhausted project version counters without touching data or ownership constraints`, async () => {
  await withPredecessor(async db => {
    await db.query(migrationA);
    if (stage === "after B") await db.query(migrationB);
    await db.query('UPDATE "PipelineVersion" SET version=2147483647 WHERE id=\'latest\'');
    const before = (await db.query('SELECT to_jsonb(v) AS row FROM "PipelineVersion" v ORDER BY id')).rows;
    await assert.rejects(db.query(rollback), /pipeline version limit reached/);
    await db.query("ROLLBACK");
    assert.deepEqual((await db.query('SELECT to_jsonb(v) AS row FROM "PipelineVersion" v ORDER BY id')).rows, before);
    assert.equal((await db.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='PipelineVersion' AND column_name='pipelineId'`)).rows[0].is_nullable, stage === "after B" ? "NO" : "YES");
  });
});
