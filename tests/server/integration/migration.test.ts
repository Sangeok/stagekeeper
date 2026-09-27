import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";

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
