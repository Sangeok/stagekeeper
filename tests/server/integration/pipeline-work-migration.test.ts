import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { testDatabaseUrl } from "./support";

type PgConnection = { connect(): Promise<void>; end(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
const { Client }: { Client: new (options: { connectionString: string }) => PgConnection } = createRequire(import.meta.url)("pg");

it("migrates each legacy automation combination to explicit nodes while preserving pinned versions", async () => {
  const db = new Client({ connectionString: testDatabaseUrl() });
  const schema = `work_nodes_${randomUUID().replaceAll("-", "")}`;
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    const directory = new URL("../../../prisma/migrations/", import.meta.url);
    const migration = "20261031120000_pipeline_work_nodes";
    for (const entry of readdirSync(directory).filter(name => name < migration && /^\d/.test(name)).sort()) await db.query(readFileSync(new URL(`${entry}/migration.sql`, directory), "utf8"));
    await db.query(`INSERT INTO "User" (id,"githubId",login) VALUES ('u',-2,'owner')`);
    const cases = [[true, true], [false, true], [true, false], [false, false]];
    for (const [index, [discover, assign]] of cases.entries()) {
      const id = `p${index}`;
      await db.query(`INSERT INTO "Project" (id,slug,name,"repoOwner",repo,branch,"ownerUserId","autoScoutEnabled","autoProposeEnabled") VALUES ($1,$1,$1,'owner','repo','main','u',$2,$3)`, [id, discover, assign]);
      await db.query(`INSERT INTO "Pipeline" (id,"projectId",name,"createdBy") VALUES ($1,$1,'Default','u')`, [id]);
      await db.query(`UPDATE "Project" SET "defaultPipelineId"=$1 WHERE id=$1`, [id]);
      await db.query(`INSERT INTO "PipelineDefinition" (id,"pipelineId",version,steps,gates,"createdBy") VALUES ($1,$1,1,ARRAY['plan','implement','accept'],ARRAY['before-plan'],'u')`, [id]);
      await db.query(`INSERT INTO "PipelineVersion" (id,"projectId","pipelineId",version,nodes,gates,format,"createdBy") VALUES ($1,$1,$1,1,ARRAY['plan','implement','accept'],ARRAY['before-plan'],'slots-v1','u')`, [id]);
    }
    const before = (await db.query(`SELECT id,nodes,gates,format FROM "PipelineVersion" ORDER BY id`)).rows;
    await db.query(readFileSync(new URL(`${migration}/migration.sql`, directory), "utf8"));
    assert.deepEqual((await db.query(`SELECT id,nodes,gates,format FROM "PipelineVersion" WHERE version=1 ORDER BY id`)).rows, before);
    for (const [index, [discover, assign]] of cases.entries()) {
      const latest = (await db.query(`SELECT nodes,gates FROM "PipelineVersion" WHERE "projectId"=$1 ORDER BY version DESC LIMIT 1`, [`p${index}`])).rows[0];
      assert.deepEqual(latest.nodes, [...(discover ? ["discover-work"] : []), ...(assign ? ["assign-work"] : []), "plan", "implement", "accept"]);
      assert.deepEqual(latest.gates, ["before-plan"]);
    }
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM "PipelineWorkRun"`)).rows[0].count, 0);
  } finally {
    await db.query("SET search_path TO public");
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
});
