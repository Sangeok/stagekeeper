import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { testDatabaseUrl } from "../integration/support";

export type SqlConnection = { connect(): Promise<void>; end(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
const { Client }: { Client: new (options: { connectionString: string }) => SqlConnection } = createRequire(import.meta.url)("pg");
export const boundary = "20261015000000_multiple_pipelines";
const migrations = new URL("../../../prisma/migrations/", import.meta.url);
export const migrationA = readFileSync(new URL(`${boundary}/migration.sql`, migrations), "utf8");

// Each rehearsal owns one random schema on the guarded test database. Historical
// SQL, rather than today's generated client, creates the actual predecessor.
export async function withPredecessor(work: (db: SqlConnection) => Promise<void>) {
  const db = new Client({ connectionString: testDatabaseUrl() });
  const schema = `pipelines_${randomUUID().replace(/-/g, "")}`;
  await db.connect();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET search_path TO "${schema}"`);
    const previous = readdirSync(migrations, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name < boundary).map(entry => entry.name).sort();
    for (const name of previous) await db.query(readFileSync(new URL(`${name}/migration.sql`, migrations), "utf8"));
    await db.query(`
      INSERT INTO "User" (id,"githubId",login) VALUES ('u',-9001,'pipeline-owner');
      INSERT INTO "Project" (id,slug,name,"repoOwner",repo,branch,"ownerUserId")
        SELECT id,id,id,'owner','repo','main','u' FROM unnest(ARRAY['empty','legacy','slots','off']) AS id;
      INSERT INTO "PipelineVersion" (id,"projectId",version,nodes,gates,format,"createdBy","createdAt") VALUES
        ('old','legacy',1,ARRAY['plan','dev'],ARRAY['before-plan'],NULL,'old-author','2026-01-01'),
        ('latest','legacy',2,ARRAY['propose','plan','implement','accept'],ARRAY['before-plan'],NULL,'latest-author','2026-02-01'),
        ('slots-v','slots',1,ARRAY['plan','implement','accept'],ARRAY['before-implement'],'slots-v1','slot-author','2026-03-01'),
        ('off-v','off',1,ARRAY['plan','implement','accept'],ARRAY['before-plan'],NULL,'off-author','2026-04-01');
      INSERT INTO "BacklogItem" (id,"projectId",key,title,area,source) VALUES ('b','legacy','K-1','Keep me','.','test');
      INSERT INTO "BoardItem" (id,"projectId","backlogItemId",agent,status,reason,"updatedAt") VALUES ('i','legacy','b','dev','proposed','Keep me',CURRENT_TIMESTAMP);
      INSERT INTO "PipelineRun" (id,"boardItemId","versionId",node,"entryId") VALUES ('run','i','old','plan','old-entry');
      INSERT INTO "TransitionEvent" (id,"boardItemId",actor,"from","to",note) VALUES ('event','i','human','proposed','proposed','Keep me');
      INSERT INTO "AgentRun" (id,"projectId",agent,key,"tokenId","stepId","pipelineRunId","pipelineEntryId") VALUES ('agent','legacy','dev','K-1','test','plan','run','old-entry');
      INSERT INTO "AgentRunStep" (id,"runId","stepId",outcome,accepted) VALUES ('step','agent','plan','ok',true);
      INSERT INTO "Report" (id,"boardItemId",actor,path,commit,"agentRunId","isAcceptance") VALUES ('report','i','dev','report.md','abc','agent',false);
    `);
    await work(db);
  } finally {
    await db.query("ROLLBACK"); await db.query("SET search_path TO public");
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.end();
  }
}

export async function executionSnapshot(db: SqlConnection) {
  const result: Record<string, unknown> = {};
  for (const table of ["BacklogItem", "BoardItem", "PipelineRun", "TransitionEvent", "AgentRun", "AgentRunStep", "Report"]) {
    result[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`)).rows;
  }
  return result;
}
