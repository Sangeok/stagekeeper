import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PRESERVED_TABLES, readCleanupFactsIn } from "../../../scripts/lib/project-ownership-cleanup";
import { testDatabaseUrl } from "./support";

type PgConnection = { connect(): Promise<void>; end(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
const { Client }: { Client: new (options: { connectionString: string }) => PgConnection } = createRequire(import.meta.url)("pg");

it("replays all 17 prior SQL files whole on one connection and adds RDC without changing populated rows", async () => {
  const db = new Client({ connectionString: testDatabaseUrl() });
  const schema = `rdc_migration_${randomUUID().replace(/-/g, "")}`;
  const catalog = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl(), options: `-c search_path=${schema}` }) });
  const capability = async () => (await catalog.$transaction((tx) => readCleanupFactsIn(tx, "pre"))).connectionCapability;
  await db.connect();
  const previousPath = (await db.query("SHOW search_path")).rows[0].search_path;
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    const directory = new URL("../../../prisma/migrations/", import.meta.url);
    const names = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const old = names.filter((name) => name < "20260927000000_repository_disconnection");
    assert.equal(old.length, 17);
    for (const name of old) await db.query(readFileSync(new URL(`${name}/migration.sql`, directory), "utf8"));
    assert.equal(await capability(), "legacy");
    assert.equal((await db.query("SELECT current_schema() AS name")).rows[0].name, schema);
    // Insert only after replaying them. Latest Prisma queries would ask for the new
    // columns before they exist; SQL describes the actual previous schema.
    await db.query(`
      INSERT INTO "User" (id,"githubId",login,"projectAvailabilityVersion") VALUES ('u',-1,'owner',1);
      INSERT INTO "Subscription" (id,"userId",plan,"updatedAt") VALUES ('s','u','pro',CURRENT_TIMESTAMP);
      INSERT INTO "Project" (id,slug,name,"repoOwner",repo,branch,"ownerUserId") VALUES ('p','p','preserved','owner','repo','main','u');
      INSERT INTO "ProjectAvailabilityEvent" (id,"ownerUserId",version,actor,reason,"toPlan","addedProjectIds","removedProjectIds","availableProjectIds") VALUES ('e','u',1,'user','registration','pro',ARRAY['p'],ARRAY[]::text[],ARRAY['p']);
      INSERT INTO "ProjectToken" (id,"projectId",hash,label) VALUES ('hs','p','hs-hash','agent');
      INSERT INTO "OwnerToken" (id,"projectId","userId",hash,label) VALUES ('ho','p','u','ho-hash','owner');
      INSERT INTO "UserToken" (id,"userId",hash,label) VALUES ('hu','u','hu-hash','account');
      INSERT INTO "Workspace" (id,"projectId","wsId",path,agent,verify,"readOnly") VALUES ('w','p','app','.','dev',ARRAY['npm test'],ARRAY[]::text[]);
      INSERT INTO "BacklogItem" (id,"projectId",key,title,area,source) VALUES ('b','p','K-1','preserved','app','test');
      INSERT INTO "BoardItem" (id,"projectId","backlogItemId",agent,status,reason,results,"updatedAt") VALUES ('i','p','b','dev','in_review','preserved',ARRAY['result'],CURRENT_TIMESTAMP);
      INSERT INTO "TransitionEvent" (id,"boardItemId",actor,"to",note) VALUES ('te','i','human','in_review','preserved');
      INSERT INTO "PipelineVersion" (id,"projectId",version,nodes,gates,"createdBy") VALUES ('v','p',1,ARRAY['plan','dev'],ARRAY['before-plan'],'u');
      INSERT INTO "PipelineRun" (id,"boardItemId","versionId",node) VALUES ('pr','i','v','plan');
      INSERT INTO "AgentRun" (id,"projectId",agent,key,"tokenId","stepId","pipelineRunId","pipelineEntryId") VALUES ('ar','p','dev','K-1','hs','verify','pr','entry');
      INSERT INTO "AgentRunStep" (id,"runId","stepId",outcome,note,"callerTokenId","receiptRevision",accepted) VALUES ('as','ar','verify','ok','preserved','hs',0,true);
      INSERT INTO "Report" (id,"boardItemId",actor,path,commit,"agentRunId","isAcceptance") VALUES ('r','i','dev','r.md','1234567','ar',false);
      INSERT INTO "Command" (id,"projectId",kind,body) VALUES ('c','p','test','preserved');
      INSERT INTO "Template" (lang,path,body,"updatedAt") VALUES ('en','test.md','preserved',CURRENT_TIMESTAMP);
    `);
    const tables = [...PRESERVED_TABLES, "UserToken"];
    assert.equal(new Set(tables).size, 18);
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of tables) {
        const expression = table === "Project" ? "to_jsonb(t) - 'disconnectedAt'" : table === "ProjectAvailabilityEvent" ? "to_jsonb(t) - 'targetProjectId'" : "to_jsonb(t)";
        result[table] = (await db.query(`SELECT ${expression} AS row FROM "${table}" t ORDER BY (${expression})::text`)).rows;
      }
      return result;
    };
    const before = await snapshot();
    for (const table of tables) assert.ok((before[table] as unknown[]).length > 0, `${table} must be populated`);
    const indexesBefore = (await db.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() ORDER BY indexname`)).rows;
    const fksBefore = (await db.query(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND contype = 'f' ORDER BY conname`)).rows;
    await db.query(readFileSync(new URL("20260927000000_repository_disconnection/migration.sql", directory), "utf8"));
    assert.equal(await capability(), "complete");
    assert.deepEqual(await snapshot(), before);
    assert.equal((await db.query('SELECT "disconnectedAt" FROM "Project"')).rows[0].disconnectedAt, null);
    assert.equal((await db.query('SELECT "targetProjectId" FROM "ProjectAvailabilityEvent"')).rows[0].targetProjectId, null);
    const columns = (await db.query(`SELECT table_name, column_name, is_nullable, column_default, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND column_name IN ('disconnectedAt','targetProjectId') ORDER BY column_name`)).rows;
    assert.deepEqual(columns.map((row) => [row.column_name, row.is_nullable, row.column_default, row.data_type]), [["disconnectedAt", "YES", null, "timestamp without time zone"], ["targetProjectId", "YES", null, "text"]]);
    const indexesAfter = (await db.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() ORDER BY indexname`)).rows;
    assert.deepEqual(indexesAfter.filter((row) => row.indexname !== "Project_ownerUserId_disconnectedAt_idx"), indexesBefore);
    assert.equal(indexesAfter.length, indexesBefore.length + 1);
    assert.deepEqual((await db.query(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND contype = 'f' ORDER BY conname`)).rows, fksBefore);
    await db.query("BEGIN"); await db.query("SAVEPOINT bad_connection");
    await assert.rejects(db.query('UPDATE "Project" SET "disconnectedAt" = CURRENT_TIMESTAMP WHERE id=\'p\''), /Project_disconnected_available_check/);
    await db.query("ROLLBACK TO SAVEPOINT bad_connection"); await db.query("RELEASE SAVEPOINT bad_connection");
    await db.query('UPDATE "Project" SET "disconnectedAt" = CURRENT_TIMESTAMP, available = false WHERE id=\'p\'');
    await db.query("ROLLBACK");
    assert.deepEqual(await snapshot(), before);
    await db.query('DROP INDEX "Project_ownerUserId_disconnectedAt_idx"');
    assert.equal(await capability(), "partial");
    await db.query('CREATE INDEX "Project_ownerUserId_disconnectedAt_idx" ON "Project" ("repoOwner", "disconnectedAt")');
    assert.equal(await capability(), "partial", "index name alone is insufficient");
    await db.query('DROP INDEX "Project_ownerUserId_disconnectedAt_idx"; CREATE INDEX "Project_ownerUserId_disconnectedAt_idx" ON "Project" ("ownerUserId", "disconnectedAt")');
    await db.query('ALTER TABLE "Project" DROP CONSTRAINT "Project_disconnected_available_check"; ALTER TABLE "Project" ADD CONSTRAINT "Project_disconnected_available_check" CHECK ("disconnectedAt" IS NULL OR available = false) NOT VALID');
    assert.equal(await capability(), "partial", "unvalidated checks must fail closed");
    await db.query('ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_disconnected_available_check"');
    assert.equal(await capability(), "complete");
    await db.query('ALTER TABLE "ProjectAvailabilityEvent" DROP COLUMN "targetProjectId"');
    assert.equal(await capability(), "partial");
    await db.query('ALTER TABLE "ProjectAvailabilityEvent" ADD COLUMN "targetProjectId" TEXT DEFAULT \'wrong\'');
    assert.equal(await capability(), "partial", "incorrect defaults must fail closed");
    await db.query('ALTER TABLE "ProjectAvailabilityEvent" ALTER COLUMN "targetProjectId" DROP DEFAULT; UPDATE "ProjectAvailabilityEvent" SET "targetProjectId" = NULL');
    assert.equal(await capability(), "complete");
  } finally {
    await catalog.$disconnect();
    await db.query("ROLLBACK");
    await db.query("SELECT set_config('search_path', $1, false)", [previousPath]);
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
});

// fixture는 실제 migration이 만든 표 그대로여야 한다. 최신 schema에 옛 모양 데이터를 넣는 시험으로 대체하지 않는다.
const statementsOf = (migration: string) =>
  readFileSync(new URL(`../../../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8")
    .split(";").map((statement) => statement.trim()).filter(Boolean);

it("the additive migration applies to the real agent_run tables and preserves legacy rows", async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !decodeURIComponent(new URL(url).pathname).startsWith("/stagekeeper_test_")) throw new Error("Run via test:server:integration");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  // 16진수만 남긴 이름이라 식별자로 안전하다. transaction 전용 schema이므로 rollback이 표·인덱스를 전부 지운다.
  const schema = `migration_fixture_${randomUUID().replace(/-/g, "")}`;
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe('CREATE TABLE "Project" (id TEXT PRIMARY KEY)');
      await tx.$executeRawUnsafe(`INSERT INTO "Project" VALUES ('p')`);
      for (const statement of statementsOf("20260903055754_agent_run")) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(`INSERT INTO "AgentRun" (id, "projectId", agent, key, "tokenId", "stepId") VALUES ('legacy', 'p', 'dev', 'K', 'opener', 'verify')`);
      await tx.$executeRawUnsafe(`INSERT INTO "AgentRunStep" (id, "runId", "stepId", outcome, note, at) VALUES ('step', 'legacy', 'verify', 'ok', 'preserved', '2026-01-01')`);

      for (const statement of statementsOf("20260915090000_agent_receipts_and_callers")) await tx.$executeRawUnsafe(statement);

      const runs = await tx.$queryRawUnsafe<{ revision: number; tokenId: string; refused: number }[]>('SELECT revision, "tokenId", refused FROM "AgentRun"');
      const steps = await tx.$queryRawUnsafe<{ note: string; accepted: boolean | null; callerTokenId: string | null; receiptRevision: number | null }[]>(
        'SELECT note, accepted, "callerTokenId", "receiptRevision" FROM "AgentRunStep"');
      assert.deepEqual(runs, [{ revision: 0, tokenId: "opener", refused: 0 }]);
      assert.deepEqual(steps, [{ note: "preserved", accepted: null, callerTokenId: null, receiptRevision: null }]);

      const columns = await tx.$queryRawUnsafe<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }[]>(
        `SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
         WHERE table_schema = '${schema}' AND column_name IN ('revision', 'callerTokenId', 'receiptRevision', 'accepted')`);
      const byName = Object.fromEntries(columns.map((column) => [column.column_name, column]));
      assert.deepEqual(Object.keys(byName).sort(), ["accepted", "callerTokenId", "receiptRevision", "revision"]);
      assert.equal(byName.revision.table_name, "AgentRun");
      assert.equal(byName.revision.is_nullable, "NO");
      assert.match(String(byName.revision.column_default), /^0/);
      for (const name of ["accepted", "callerTokenId", "receiptRevision"]) {
        assert.equal(byName[name].table_name, "AgentRunStep");
        assert.equal(byName[name].is_nullable, "YES");
        assert.equal(byName[name].column_default, null);
      }

      // 새 인덱스가 같은 표의 기존 인덱스와 이름이 겹치지 않아야 한다 — 3열짜리 임시 표로는 드러나지 않는 경계다.
      const indexes = (await tx.$queryRawUnsafe<{ indexname: string }[]>(`SELECT indexname FROM pg_indexes WHERE schemaname = '${schema}'`))
        .map((row) => row.indexname).sort();
      assert.deepEqual(indexes, [
        "AgentRunStep_at_idx", "AgentRunStep_callerTokenId_at_idx", "AgentRunStep_pkey", "AgentRunStep_runId_at_idx",
        "AgentRun_pkey", "AgentRun_projectId_agent_key_closedAt_idx", "AgentRun_tokenId_idx", "Project_pkey",
      ].sort());

      throw new Error("rollback migration fixtures");
    }, { maxWait: 10000, timeout: 60000 }), /rollback migration fixtures/);
  } finally { await db.$disconnect(); }
});


it("backlog authorship migrates the original tables and reconciles old-writer removals idempotently", async () => {
  const { connections } = await import("./support");
  const pool = connections(1); const [db] = pool.all;
  const schema = `backlog_migration_${randomUUID().replace(/-/g, "")}`;
  const migration = statementsOf("20260926134848_backlog_authorship").filter((sql) =>
    !/^(BEGIN|COMMIT)$/i.test(sql.replace(/--[^\n]*/g, "").trim()));
  const backfill = migration.find((sql) => /WITH latest AS/.test(sql)); assert.ok(backfill);
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const sql of statementsOf("20260829143353_init")) await tx.$executeRawUnsafe(sql);
      await tx.$executeRawUnsafe(`INSERT INTO "Project" (id, slug, name, owner, repo, branch) VALUES ('p','p','p','o','r','main')`);
      const keys = ["done", "owner", "live", "discarded", "reopen", "hold-remove", "owner-done", "latest-discarded"];
      for (const key of keys) {
        await tx.$executeRaw`INSERT INTO "BacklogItem" (id, "projectId", key, title, area, source, "removedAt")
          VALUES (${key}, 'p', ${key}, ${key}, '', '', ${key === "live" ? null : new Date("2026-01-01")})`;
        if (["done", "reopen", "hold-remove", "latest-discarded"].includes(key)) {
          await tx.$executeRaw`INSERT INTO "BoardItem" (id, "projectId", "backlogItemId", agent, status, reason, "updatedAt", "proposedOn")
            VALUES (${key}, 'p', ${key}, 'dev', 'done', '', ${new Date("2026-01-01")}, ${new Date("2026-01-01")})`;
        }
      }
      await tx.$executeRawUnsafe(`INSERT INTO "BoardItem" (id,"projectId","backlogItemId",agent,status,reason,"updatedAt","proposedOn","discardedAt")
        VALUES ('ignored','p','latest-discarded','dev','in_review','', '2026-02-01','2026-02-01','2026-02-01')`);
      for (const sql of migration) await tx.$executeRawUnsafe(sql);
      const rows = await tx.$queryRawUnsafe<{ id: string; addedBy: string; type: null; typeSetBy: null; addedByRunId: null; removedReason: string | null }[]>(
        'SELECT id,"addedBy",type,"typeSetBy","addedByRunId","removedReason" FROM "BacklogItem" ORDER BY id');
      for (const row of rows) {
        assert.equal(row.addedBy, "owner"); assert.equal(row.type, null); assert.equal(row.typeSetBy, null); assert.equal(row.addedByRunId, null);
        assert.equal(row.removedReason, row.id === "live" ? null : ["done", "reopen", "hold-remove", "latest-discarded"].includes(row.id) ? "done" : "owner");
      }
      await tx.$executeRawUnsafe(backfill);
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT id,"addedBy",type,"typeSetBy","addedByRunId","removedReason" FROM "BacklogItem" ORDER BY id'), rows);
      await tx.$executeRawUnsafe(`UPDATE "BacklogItem" SET "removedReason"='discarded' WHERE id='discarded'`);
      await tx.$executeRawUnsafe(`UPDATE "BacklogItem" SET "removedAt"=NULL WHERE id='reopen'`);
      await tx.$executeRawUnsafe(`UPDATE "BoardItem" SET status='on_hold' WHERE id='hold-remove'`);
      await tx.$executeRawUnsafe(`UPDATE "BacklogItem" SET "removedAt"='2026-02-01' WHERE id='hold-remove'`);
      await tx.$executeRawUnsafe(`INSERT INTO "BoardItem" (id,"projectId","backlogItemId",agent,status,reason,"updatedAt") VALUES ('new-done','p','owner-done','dev','done','', '2026-02-01')`);
      // Rehearse the post-drain lock order and normalize in the same transaction.
      const started = performance.now();
      await tx.$queryRawUnsafe('SELECT id FROM "User" ORDER BY id FOR UPDATE');
      await tx.$queryRawUnsafe('SELECT id FROM "Project" ORDER BY id FOR UPDATE');
      await tx.$executeRawUnsafe(backfill);
      const reasons = await tx.$queryRawUnsafe<{ id: string; removedReason: string | null }[]>('SELECT id,"removedReason" FROM "BacklogItem" ORDER BY id');
      assert.deepEqual(Object.fromEntries(reasons.map((row) => [row.id, row.removedReason])), {
        done: "done", owner: "owner", live: null, discarded: "discarded", reopen: null, "hold-remove": "owner", "owner-done": "done", "latest-discarded": "done",
      });
      await tx.$executeRawUnsafe(backfill);
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT id,"removedReason" FROM "BacklogItem" ORDER BY id'), reasons);
      console.log(`Backlog post-drain normalization rehearsal: ${(performance.now() - started).toFixed(1)}ms (8 fixture rows)`);
      throw new Error("rollback backlog migration fixtures");
    }, { maxWait: 10000, timeout: 60000 }), /rollback backlog migration fixtures/);
    const schemas = await db.$queryRaw<{ nspname: string }[]>`SELECT nspname FROM pg_namespace WHERE nspname = ${schema}`;
    assert.equal(schemas.length, 0, "fixture transaction must not leak a schema");
  } finally { await pool.disconnect(); }
});
