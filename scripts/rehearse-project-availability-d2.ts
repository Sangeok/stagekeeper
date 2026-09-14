import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { newToken } from "../packages/core/token.mjs";
import { defaultGraph } from "../packages/core/pipeline.mjs";
import { readProjectAccess, type TransactionHost } from "../src/server/project-access-query";
import { changeUserPlan, loadProjectAvailability, selectProjectForUse, withAvailabilityTransaction } from "../src/server/project-availability-service";
import { registerProjectIn } from "../src/server/project-registration-query";
import { syncProject } from "../src/server/mcp/project-sync-query";

let cancelled = false;
let child: ChildProcess | undefined;
function checkCancellation(): void { if (cancelled) throw new Error("Rehearsal cancelled."); }
function cancel(): void { cancelled = true; child?.kill("SIGTERM"); }

function cancellableQueries<T extends object>(client: T): T {
  return new Proxy(client, { get(target, key) {
    const value = Reflect.get(target, key);
    if (typeof value === "function") return (...args: unknown[]) => {
      checkCancellation();
      if (key === "$transaction" && typeof args[0] === "function") {
        const run = args[0];
        return Reflect.apply(value, target, [async (tx: Prisma.TransactionClient) => {
          checkCancellation();
          const result = await run(cancellableQueries(tx));
          checkCancellation(); // Throw before commit, not after claiming cancellation rolled it back.
          return result;
        }, ...args.slice(1)]);
      }
      return Reflect.apply(value, target, args);
    };
    return value && typeof value === "object" ? cancellableQueries(value) : value;
  } });
}

async function foundation(connectionString: string): Promise<void> {
  checkCancellation();
  await new Promise<void>((resolve, reject) => {
    child = spawn(process.execPath, ["--import", "tsx", "scripts/rehearse-project-availability.ts", "--allow-fixtures"], {
      env: { ...process.env, IPA_REHEARSAL_DATABASE_URL: connectionString }, shell: false, stdio: "ignore",
    });
    child.once("error", reject);
    child.once("close", (code) => {
      child = undefined;
      if (code === 0) resolve();
      else reject(new Error("D1 foundation rehearsal failed; isolated DB preserved."));
    });
  });
  checkCancellation();
}

// Inject a failure into a real transaction; all other calls still reach PostgreSQL.
function failingTransactions(db: PrismaClient, delegate: "workspace" | "projectAvailabilityEvent", method: "upsert" | "create", after = 0): TransactionHost {
  let calls = 0;
  return { $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => db.$transaction(async (tx) => {
    const proxy = new Proxy(tx, { get(target, key) {
      if (key !== delegate) return Reflect.get(target, key);
      return new Proxy(Reflect.get(target, key), { get(model, action) {
        const original = Reflect.get(model, action);
        if (action !== method) return original;
        return (...args: unknown[]) => { if (calls++ >= after) throw new Error("injected rollback"); return Reflect.apply(original, model, args); };
      } });
    } });
    return run(proxy);
  }, options) } as TransactionHost;
}

async function exercise(db: PrismaClient): Promise<void> {
  const userId = "ipa-d2-user";
  await db.user.create({ data: { id: userId, githubId: 930001, login: "ipa-d2", subscription: { create: { plan: "max" } } } });
  for (let i = 0; i < 6; i++) {
    checkCancellation();
    const result = await withAvailabilityTransaction(db, (tx) => registerProjectIn(tx, {
      userId, slug: `ipa-d2-${i}`, name: `D2 ${i}`, owner: "repo-owner", repo: `repo-${i}`, branch: "main", initialTokenHash: newToken().hash,
    }));
    assert.equal(result, null);
  }
  let view = await loadProjectAvailability(db, userId);
  assert.equal(view.availableCount, 6);
  await changeUserPlan(db, { userId, plan: "free" });
  view = await loadProjectAvailability(db, userId);
  assert.equal(view.availableCount, 1);
  const active = view.projects.find((p) => p.available)!;
  const inactive = view.projects.filter((p) => !p.available);
  const token = await db.projectToken.findFirstOrThrow({ where: { projectId: active.id } });
  const run = await db.agentRun.create({ data: { projectId: active.id, tokenId: token.id, agent: "dev", stepId: "plan" } });
  await db.agentRunStep.create({ data: { runId: run.id, stepId: "plan", outcome: "handoff", note: "preserve cursor" } });
  const backlog = await db.backlogItem.create({ data: { projectId: active.id, key: "D2-1", title: "Preserved", area: "src", source: "full source" } });
  const board = await db.boardItem.create({ data: { projectId: active.id, backlogItemId: backlog.id, agent: "dev", status: "proposed", reason: "fixture", results: [] } });
  const graph = defaultGraph("free");
  const version = await db.pipelineVersion.create({ data: { projectId: active.id, version: 1, nodes: graph.nodes, gates: graph.gates, createdBy: userId } });
  await db.pipelineRun.create({ data: { boardItemId: board.id, versionId: version.id, node: "before-plan" } });
  const w = { id: "web", agent: "dev", path: ".", verify: ["first", "second"], knowledge: null, readOnly: ["docs/**"] };
  assert.equal((await syncProject(db, { projectId: active.id, workspaces: [w], language: "en" })).ok, true);
  const beforeSync = await db.project.findUniqueOrThrow({ where: { id: active.id }, include: { workspaces: true } });
  // Allow two workspaces, then fail after the first upsert in the write transaction.
  await changeUserPlan(db, { userId, plan: "max" });
  await assert.rejects(() => syncProject(failingTransactions(db, "workspace", "upsert", 1), {
    projectId: active.id, language: "ko", workspaces: [{ ...w, path: "changed" }, { ...w, id: "api", agent: "api" }],
  }), /injected rollback/);
  assert.deepEqual(await db.project.findUniqueOrThrow({ where: { id: active.id }, include: { workspaces: true } }), beforeSync);
  await changeUserPlan(db, { userId, plan: "free" });

  const ids = view.projects.map((p) => p.id);
  const preserved = async () => Promise.all([
    db.projectToken.findMany({ where: { projectId: { in: ids } }, orderBy: { id: "asc" } }),
    db.ownerToken.findMany({ where: { projectId: { in: ids } }, orderBy: { id: "asc" } }),
    db.workspace.findMany({ where: { projectId: { in: ids } }, orderBy: { id: "asc" } }),
    db.agentRun.findMany({ where: { projectId: { in: ids } }, include: { steps: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
    db.pipelineRun.findMany({ where: { boardItem: { projectId: { in: ids } } }, orderBy: { id: "asc" } }),
  ]);
  const before = await preserved();
  view = await loadProjectAvailability(db, userId);
  assert.equal(view.projects.find((p) => p.id === active.id)?.openItems, 1);
  assert.equal(view.projects.find((p) => p.id === active.id)?.openRuns, 1);
  const inputs = inactive.slice(0, 2).map((p) => ({ userId, targetProjectId: p.id, replacementProjectId: active.id, expectedVersion: view.version }));
  const outcomes = await Promise.all(inputs.map((input) => selectProjectForUse(db, input)));
  assert.equal(outcomes.filter((r) => r.status === "success").length, 1);
  assert.equal(outcomes.filter((r) => r.status === "stale").length, 1);
  assert.deepEqual(await preserved(), before);
  assert.equal((await readProjectAccess(db, active.id)).available, false);
  assert.equal((await syncProject(db, { projectId: active.id, workspaces: [] })).ok, false);
  assert.deepEqual(await preserved(), before);
  view = await loadProjectAvailability(db, userId);
  const selected = view.projects.find((p) => p.available)!;
  assert.equal((await selectProjectForUse(db, { userId, targetProjectId: active.id, replacementProjectId: selected.id, expectedVersion: view.version })).status, "success");
  assert.equal((await readProjectAccess(db, active.id)).available, true);
  assert.deepEqual(await preserved(), before);
  assert.equal((await selectProjectForUse(db, { userId, targetProjectId: "ipa-project-a", expectedVersion: view.version })).status, "error");

  view = await loadProjectAvailability(db, userId);
  await Promise.all([
    changeUserPlan(db, { userId, plan: "pro" }),
    selectProjectForUse(db, { userId, targetProjectId: inactive[0].id, replacementProjectId: active.id, expectedVersion: view.version }),
  ]);
  view = await loadProjectAvailability(db, userId);
  assert.equal(view.plan, "pro"); assert.ok(view.availableCount >= 1 && view.availableCount <= 5);
  const events = await db.projectAvailabilityEvent.findMany({ where: { ownerUserId: userId }, orderBy: { version: "asc" } });
  assert.equal(new Set(events.map((e) => e.version)).size, events.length);
  assert.deepEqual(events.at(-1)?.availableProjectIds, view.projects.filter((p) => p.available).map((p) => p.id).sort());
  assert.equal(events.at(-1)?.version, view.version);

  const freshUser = await db.user.create({ data: { githubId: 930002, login: "ipa-d2-concurrent" } });
  const registrations = await Promise.all([0, 1].map((i) => withAvailabilityTransaction(db, (tx) => registerProjectIn(tx, {
    userId: freshUser.id, slug: `ipa-d2-race-${i}`, name: "Race", owner: "repo-owner", repo: `race-${i}`, branch: "main", initialTokenHash: newToken().hash,
  }))));
  assert.equal(registrations.filter((r) => r === null).length, 1);
  assert.equal(await db.project.count({ where: { ownerUserId: freshUser.id } }), 1);
  const rollbackUser = await db.user.create({ data: { githubId: 930003, login: "ipa-d2-rollback" } });
  await assert.rejects(() => withAvailabilityTransaction(failingTransactions(db, "projectAvailabilityEvent", "create"), (tx) => registerProjectIn(tx, {
    userId: rollbackUser.id, slug: "ipa-d2-rollback", name: "Rollback", owner: "repo-owner", repo: "rollback", branch: "main", initialTokenHash: newToken().hash,
  })), /injected rollback/);
  assert.equal(await db.project.count({ where: { ownerUserId: rollbackUser.id } }), 0);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: rollbackUser.id } })).projectAvailabilityVersion, 0);
  checkCancellation();
}

async function main(): Promise<void> {
  const connectionString = process.env.IPA_D2_REHEARSAL_DATABASE_URL;
  if (!connectionString || process.argv.slice(2).join(" ") !== "--allow-fixtures") {
    console.error("Requires IPA_D2_REHEARSAL_DATABASE_URL and --allow-fixtures; DATABASE_URL is not a fixture target.");
    process.exitCode = 2; return;
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  try {
    const tables = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','S','v','m','f')`;
    assert.equal(Number(tables[0].count), 0, "D2 rehearsal requires an empty isolated database");
    await foundation(connectionString);
    await exercise(cancellableQueries(db));
    console.log(JSON.stringify({ ok: true, phase: "D2", verified: ["registration", "plan", "selection-concurrency", "sync-rollback", "access", "cursor-preservation", "event-snapshot"] }));
  } finally {
    if (child) { const running = child; await new Promise<void>((resolve) => { running.once("close", () => resolve()); running.kill("SIGTERM"); }); }
    await db.$disconnect();
    process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
  }
}
main().catch(() => { console.error("D2 rehearsal failed; isolated database preserved. No production cutover approved."); process.exitCode = 1; });
