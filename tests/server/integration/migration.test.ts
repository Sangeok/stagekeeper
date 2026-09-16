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
