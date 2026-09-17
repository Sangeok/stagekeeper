import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createBoardQueries } from "../src/server/pipeline/board-query";
import { agentNext, type NextDeps } from "../src/server/agents/next";
import { cursorTransaction } from "../src/server/agents/run-query";

// Deliberately no dotenv import or DATABASE_URL fallback. Only a disposable,
// initially empty PostgreSQL database is accepted; all fixtures stay there.
async function main() {
  if (process.argv.slice(2).join(" ") !== "--allow-fixtures") throw new Error("Pass --allow-fixtures for an isolated, empty test database.");
  const connectionString = process.env.PIPELINE_SLOT_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("PIPELINE_SLOT_TEST_DATABASE_URL is required; ordinary DATABASE_URL is never used.");
  type Pool = { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; end(): Promise<void> };
  const { Pool: PgPool } = createRequire(import.meta.url)("pg") as { Pool: new (options: { connectionString: string }) => Pool };
  const pool = new PgPool({ connectionString });
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(tables.rows.length, 0, "Rehearsal refuses a database containing existing public tables");
    const directory = new URL("../prisma/migrations/", import.meta.url);
    for (const migration of (await readdir(directory)).filter((name) => /^\d/.test(name)).sort()) {
      if (migration === "20260917000000_pipeline_agent_slots") {
        await pool.query(`
          INSERT INTO "User" (id, "githubId", login) VALUES ('legacy-owner', 917260002, 'legacy');
          INSERT INTO "Project" (id, slug, name, repo, branch, "ownerUserId", "repoOwner") VALUES ('legacy-project', 'legacy-slot-fixture', 'legacy', 'legacy', 'main', 'legacy-owner', 'fixture');
          INSERT INTO "BacklogItem" (id, "projectId", key, title, area, source) VALUES ('legacy-backlog', 'legacy-project', 'LEGACY', 'legacy', 'web', 'fixture');
          INSERT INTO "BoardItem" (id, "projectId", "backlogItemId", agent, status, reason, results, "updatedAt") VALUES ('legacy-item', 'legacy-project', 'legacy-backlog', 'dev', 'done', 'fixture', ARRAY[]::text[], now());
          INSERT INTO "PipelineVersion" (id, "projectId", version, nodes, gates, "createdBy") VALUES ('legacy-version', 'legacy-project', 1, ARRAY['plan','implement','accept','doc-audit'], ARRAY['before-plan'], 'fixture');
          INSERT INTO "PipelineRun" (id, "boardItemId", "versionId", node) VALUES ('legacy-pipeline', 'legacy-item', 'legacy-version', 'accept');
          INSERT INTO "AgentRun" (id, "projectId", agent, key, "tokenId", "stepId") VALUES ('legacy-agent', 'legacy-project', 'dev', 'LEGACY', 'fixture', 'report');
          INSERT INTO "Report" (id, "boardItemId", actor, path, "commit") VALUES ('legacy-report', 'legacy-item', 'dev', 'legacy.md', 'legacy-commit');
        `);
      }
      const sql = await readFile(new URL(`${migration}/migration.sql`, directory), "utf8");
      await pool.query(sql);
    }
    const legacyVersion = await db.pipelineVersion.findUniqueOrThrow({ where: { id: "legacy-version" } });
    assert.equal(legacyVersion.format, null);
    assert.deepEqual(legacyVersion.nodes, ["plan", "implement", "accept", "doc-audit"]);
    assert.deepEqual(legacyVersion.gates, ["before-plan"]);
    assert.equal((await db.pipelineRun.findUniqueOrThrow({ where: { id: "legacy-pipeline" } })).entryId, null);
    const legacyAgent = await db.agentRun.findUniqueOrThrow({ where: { id: "legacy-agent" } });
    assert.equal(legacyAgent.pipelineRunId, null); assert.equal(legacyAgent.pipelineEntryId, null);
    const legacyReport = await db.report.findUniqueOrThrow({ where: { id: "legacy-report" } });
    assert.equal(legacyReport.agentRunId, null); assert.equal(legacyReport.path, "legacy.md"); assert.equal(legacyReport.commit, "legacy-commit");
    const owner = await db.user.create({ data: { githubId: 917260001, login: "pipeline-slot-rehearsal" } });
    const makeProject = (slug: string) => db.project.create({ data: { slug, name: slug, repo: slug, repoOwner: "fixture", branch: "main", ownerUserId: owner.id, workspaces: { create: { wsId: "web", path: ".", agent: "web-dev", verify: ["test"], readOnly: [] } } } });
    const p1 = await makeProject("slot-cap-one"), p2 = await makeProject("slot-cap-two");
    const unavailable = async (): Promise<never> => { throw new Error("A write escaped cursorTransaction"); };
    const base: NextDeps = {
      access: async () => ({ plan: "free", available: true }), roster: async () => ["web-dev"],
      template: async () => "## step:start\nRead.\nnext: done\n", vars: async () => ({}),
      recentSteps: async () => 0, recentRuns: async () => 0, openRun: unavailable, createRun: unavailable,
      boardStatus: unavailable, itemAgent: async () => "web-dev", openCount: async () => 0,
      verifyOk: unavailable, runByReceipt: unavailable, closeRun: unavailable, commitOutcome: unavailable,
    };
    base.withCursor = cursorTransaction(db, base);
    await db.agentRun.createMany({ data: Array.from({ length: 59 }, () => ({ projectId: p1.id, agent: "historical", tokenId: "fixture", stepId: "report", closedAt: new Date() })) });
    const scopes = [p1, p2].map((p) => ({ projectId: p.id, tokenId: "fixture" }));
    const openings = await Promise.all(scopes.map((scope) => agentNext(base, scope, { agent: "pm" })));
    assert.equal(openings.filter((result) => result.ok).length, 1, "only one concurrent opener may consume the last dispatch");
    assert.equal(await db.agentRun.count({ where: { project: { ownerUserId: owner.id } } }), 60);
    const winning = scopes[openings.findIndex((result) => result.ok)];
    assert.equal((await agentNext(base, winning, { agent: "pm" })).ok, true, "resume remains available at cap");
    assert.equal(await db.agentRun.count({ where: { project: { ownerUserId: owner.id } } }), 60);
    await db.subscription.create({ data: { userId: owner.id, plan: "max" } });

    const version = await db.pipelineVersion.create({ data: { projectId: p1.id, version: 1, format: "slots-v1", nodes: ["plan", "implement", "doc-auditor", "accept"], gates: ["before-accept"], createdBy: owner.id } });
    const backlog = await db.backlogItem.create({ data: { projectId: p1.id, key: "SLOT-1", title: "Slot fixture", area: "web", source: "rehearsal" } });
    const item = await db.boardItem.create({ data: { projectId: p1.id, backlogItemId: backlog.id, agent: "web-dev", status: "implementing", reason: "fixture", results: [] } });
    const pipeline = await db.pipelineRun.create({ data: { boardItemId: item.id, versionId: version.id, node: "implement", entryId: randomUUID() } });
    const board = createBoardQueries(db);
    const developer = await db.agentRun.create({ data: { projectId: p1.id, agent: "web-dev", key: "SLOT-1", tokenId: "fixture", stepId: "report", pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId, steps: { create: [{ stepId: "verify", outcome: "ok" }] } } });
    const reportInput = { key: "SLOT-1", actor: "web-dev", path: "fixture.md", commit: "fixture", runId: developer.id };
    assert.equal((await board.submitReport(p1.id, { ...reportInput, runId: "legacy-agent" }, "fixture")).ok, false);
    await pool.query(`
      CREATE FUNCTION slot_report_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."actorId" = 'fixture-fail' AND NEW.note = 'report' THEN RAISE EXCEPTION 'injected report audit failure'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER slot_report_failure AFTER INSERT ON "TransitionEvent" FOR EACH ROW EXECUTE FUNCTION slot_report_failure();
    `);
    await assert.rejects(board.submitReport(p1.id, reportInput, "fixture-fail"));
    assert.equal(await db.report.count({ where: { boardItemId: item.id } }), 0, "failure after Report insert must roll the report back");
    assert.equal(await db.transitionEvent.count({ where: { boardItemId: item.id } }), 0);
    await pool.query('DROP TRIGGER slot_report_failure ON "TransitionEvent"; DROP FUNCTION slot_report_failure();');
    const submitted = await board.submitReport(p1.id, reportInput, "fixture");
    assert.ok(submitted.ok);
    const report = submitted.item;
    await db.agentRunStep.create({ data: { runId: developer.id, stepId: "report", outcome: "ok" } });
    await db.agentRun.update({ where: { id: developer.id }, data: { closedAt: new Date() } });
    await board.advancePipeline(p1.id, "SLOT-1");
    let cursor = await db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } });
    assert.equal(cursor.node, "doc-auditor");
    assert.notEqual(cursor.entryId, pipeline.entryId);
    assert.equal((await db.boardItem.findUniqueOrThrow({ where: { id: item.id } })).status, "implementing");
    const audit = await db.agentRun.create({ data: { projectId: p1.id, agent: "doc-auditor", tokenId: "fixture", stepId: "report", pipelineRunId: pipeline.id, pipelineEntryId: cursor.entryId, closedAt: new Date() } });
    await board.advancePipeline(p1.id, "SLOT-1");
    cursor = await db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } });
    const done = await db.boardItem.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(done.status, "done"); assert.equal(done.acceptedAt, null);
    assert.equal(cursor.node, "before-accept");
    assert.deepEqual(done.results, ["Implementation span completed."]);
    const events = await db.transitionEvent.count({ where: { boardItemId: item.id } });
    const badGate = await board.gate(p1.id, { key: "SLOT-1", gate: "before-accept", gateEntry: { runId: pipeline.id, entryId: pipeline.entryId! } }, { actor: "human", actorRef: owner.id, channel: "web", expectedUpdatedAt: done.updatedAt });
    assert.equal(badGate.ok, false);
    assert.equal(await db.transitionEvent.count({ where: { boardItemId: item.id } }), events, "stale gate leaves no audit append");
    assert.equal((await board.gate(p1.id, { key: "SLOT-1", gate: "before-accept", gateEntry: { runId: pipeline.id, entryId: cursor.entryId! } }, { actor: "human", actorRef: owner.id, channel: "web", expectedUpdatedAt: done.updatedAt })).ok, true);
    await db.agentRun.delete({ where: { id: developer.id } });
    assert.equal((await db.report.findUniqueOrThrow({ where: { id: report.id } })).agentRunId, null, "agent deletion preserves report audit");
    await db.pipelineRun.delete({ where: { id: pipeline.id } });
    assert.equal(await db.agentRun.findUnique({ where: { id: audit.id } }), null, "pipeline deletion cascades bound runs");
    console.log("PASS: migration, owner-wide last-slot race, cap resume, bound span completion, stale gate rollback, and deletion relations");
  } finally {
    try { await db.$disconnect(); }
    finally { await pool.end(); }
  }
}

main().catch((error: unknown) => {
  // Do not print a connection string or a driver error containing credentials.
  console.error(error instanceof assert.AssertionError ? error.message : "Pipeline slot rehearsal failed. Check the isolated database configuration and test assertions.");
  process.exitCode = 1;
});
