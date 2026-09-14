import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { newToken } from "../packages/core/token.mjs";
import { changeUserPlan, loadProjectAvailability, selectProjectForUse, withAvailabilityTransaction } from "../src/server/project-availability-service";
import { registerProjectIn } from "../src/server/project-registration-query";
import { readProjectAccess } from "../src/server/project-access-query";
import { syncProject } from "../src/server/mcp/project-sync-query";
import { CLEANUP_MIGRATION, inspectOwnershipCleanup } from "./lib/project-ownership-cleanup";
import { artifactMigrationDigest, digest, RECOVERY_MIGRATION, RECOVERY_SQL } from "./lib/project-ownership-recovery";
const children = new Set<ChildProcess>();
let cancelled = false;

type Arguments = { baseline: string };
type DatabaseIdentity = { database: string; schema: string; recovery: boolean };

function parseArguments(args: readonly string[]): Arguments {
  if (args.length === 3 && args[0] === "--allow-fixtures" && args[1] === "--baseline" && /^[0-9a-f]{40}$/.test(args[2] ?? "")) return { baseline: args[2] as string };
  throw new Error("usage: npm run test:project-availability:d3:db -- --allow-fixtures --baseline <40-char-commit>");
}

function checkCancellation(): void {
  if (cancelled) throw new Error("D3 rehearsal cancelled");
}

async function run(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; quiet?: boolean }): Promise<string> {
  checkCancellation();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => { children.delete(child); reject(error); });
    child.once("close", (code) => {
      children.delete(child);
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${options.quiet ? "child command" : command} failed with exit ${code}: ${options.quiet ? "details redacted" : stderr.trim()}`));
    });
  });
}

async function identity(prisma: PrismaClient): Promise<DatabaseIdentity> {
  const rows = await prisma.$queryRaw<Array<DatabaseIdentity>>`SELECT current_database() AS database, current_schema() AS schema, pg_is_in_recovery() AS recovery`;
  if (!rows[0]) throw new Error("database identity query returned no row");
  return rows[0];
}

async function assertEmpty(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','S','v','m','f')`;
  assert.equal(Number(rows[0]?.count ?? -1), 0, "D3 rehearsal database must contain no user objects");
}

async function prepareBaseline(repositoryRoot: string, workDirectory: string, commit: string, connectionString: string): Promise<string> {
  await mkdir(workDirectory, { recursive: true });
  await run("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: repositoryRoot });
  const archive = join(workDirectory, "d2.tar");
  const source = join(workDirectory, "d2");
  await run("git", ["archive", "--format=tar", `--output=${archive}`, commit], { cwd: repositoryRoot });
  await run("mkdir", ["-p", source], { cwd: repositoryRoot });
  await run("tar", ["-xf", archive, "-C", source], { cwd: repositoryRoot });
  await symlink(join(repositoryRoot, "node_modules"), join(source, "node_modules"), "dir");
  assert.equal(digest(await readFile(join(source, "package-lock.json"))), digest(await readFile(join(repositoryRoot, "package-lock.json"))), "D2 dependency lock differs from the D3 verification environment");
  const migrations = await run("git", ["ls-tree", "-r", "--name-only", commit, "prisma/migrations"], { cwd: repositoryRoot });
  const names = migrations.split("\n").filter((path) => path.endsWith("migration.sql"));
  assert.equal(names.length, 11, "the approved D2 baseline must contain the original ten migrations and D1 foundation");
  assert.ok(names.some((path) => path.endsWith("add_individual_project_availability_foundation/migration.sql")));
  const env = { ...process.env, DATABASE_URL: connectionString };
  const prismaCli = join(repositoryRoot, "node_modules/prisma/build/index.js");
  await run(process.execPath, [prismaCli, "migrate", "deploy", "--config", join(source, "prisma.config.ts")], { cwd: source, env, quiet: true });
  await run(process.execPath, [prismaCli, "generate", "--config", join(source, "prisma.config.ts")], { cwd: source, env, quiet: true });
  const smoke = `
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";
import { newToken } from "./packages/core/token.mjs";
import { withAvailabilityTransaction } from "./src/server/project-availability-service";
import { registerProjectIn } from "./src/server/project-registration-query";
import { loadProjectView } from "./src/server/mcp/project-query";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const mode = process.argv[2];
  if (mode === "setup") {
    const user = await db.user.create({ data: { githubId: 940001, login: "ipa-d3", subscription: { create: { plan: "max" } } } });
    const result = await withAvailabilityTransaction(db, (tx) => registerProjectIn(tx, { userId: user.id, slug: "ipa-d3-before", name: "D3 before", owner: "repo-owner", repo: "before", branch: "main", initialTokenHash: newToken().hash }));
    assert.equal(result, null);
  }
  const projects = await db.project.findMany({ where: { ownerUser: { login: "ipa-d3" } }, select: { id: true, owner: true, repoOwner: true, ownerUserId: true, members: { select: { userId: true, role: true } } } });
  assert.ok(projects.length >= 1);
  for (const project of projects) {
    assert.equal(project.owner, project.repoOwner); assert.equal(project.members.length, 1); assert.equal(project.members[0].userId, project.ownerUserId);
    const view = await loadProjectView((args) => db.project.findUniqueOrThrow(args), project.id);
    assert.equal(view.owner, project.repoOwner); assert.equal("repoOwner" in view, false);
  }
} finally { await db.$disconnect(); }
`;
  await writeFile(join(source, "d3-baseline-smoke.ts"), smoke);
  return source;
}

async function baselineSmoke(source: string, connectionString: string, mode: "setup" | "verify"): Promise<void> {
  await run(process.execPath, ["--import", "tsx", "d3-baseline-smoke.ts", mode], {
    cwd: source,
    env: { ...process.env, DATABASE_URL: connectionString, TSX_TSCONFIG_PATH: join(source, "tsconfig.json") },
    quiet: true,
  });
  checkCancellation();
}

const PRESERVED_TABLES = ["User", "Subscription", "Project", "ProjectAvailabilityEvent", "ProjectToken", "OwnerToken", "Workspace", "BacklogItem", "BoardItem", "TransitionEvent", "Report", "Template", "Command", "AgentRun", "AgentRunStep", "PipelineVersion", "PipelineRun"] as const;
async function snapshot(prisma: PrismaClient): Promise<string> {
  const rows: Array<[string, unknown]> = [];
  for (const table of PRESERVED_TABLES) {
    const expression = table === "Project" ? `to_jsonb(t) - 'owner'` : "to_jsonb(t)";
    const result = await prisma.$queryRawUnsafe<Array<{ data: unknown }>>(`SELECT COALESCE(jsonb_agg(${expression} ORDER BY (${expression})::text), '[]'::jsonb) AS data FROM "${table}" t`);
    rows.push([table, result[0]?.data ?? []]);
  }
  return digest(JSON.stringify(rows));
}

async function migrateD3(repositoryRoot: string, connectionString: string): Promise<void> {
  await run(process.execPath, [join(repositoryRoot, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", join(repositoryRoot, "prisma.config.ts")], {
    cwd: repositoryRoot, env: { ...process.env, DATABASE_URL: connectionString }, quiet: true,
  });
  checkCancellation();
}

async function exerciseFinalSchema(prisma: PrismaClient): Promise<void> {
  const report = await inspectOwnershipCleanup(prisma, "post");
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  const user = await prisma.user.findFirstOrThrow({ where: { login: "ipa-d3" }, select: { id: true, projectAvailabilityVersion: true } });
  for (const suffix of ["after", "third"]) {
    const result = await withAvailabilityTransaction(prisma, (tx) => registerProjectIn(tx, {
      userId: user.id, slug: `ipa-d3-${suffix}`, name: `D3 ${suffix}`, owner: "repo-owner", repo: suffix, branch: "main", initialTokenHash: newToken().hash,
    }));
    assert.equal(result, null);
  }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { projectAvailabilityVersion: true } })).projectAvailabilityVersion, user.projectAvailabilityVersion + 2);
  const legacy = await prisma.$queryRaw<Array<{ member: string | null; ownerColumn: boolean }>>`
    SELECT to_regclass('"ProjectMember"')::text AS member,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Project' AND column_name = 'owner') AS "ownerColumn"`;
  assert.deepEqual(legacy[0], { member: null, ownerColumn: false });

  const raceUser = await prisma.user.create({ data: { githubId: 940002, login: "ipa-d3-race" } });
  const registrations = await Promise.all(["a", "b"].map((suffix) => withAvailabilityTransaction(prisma, (tx) => registerProjectIn(tx, {
    userId: raceUser.id, slug: `ipa-d3-race-${suffix}`, name: "Race", owner: "repo-owner", repo: suffix, branch: "main", initialTokenHash: newToken().hash,
  }))));
  assert.equal(registrations.filter((result) => result === null).length, 1);
  assert.equal(await prisma.project.count({ where: { ownerUserId: raceUser.id } }), 1);

  await changeUserPlan(prisma, { userId: user.id, plan: "free" });
  const beforeSelection = await loadProjectAvailability(prisma, user.id);
  assert.equal(beforeSelection.availableCount, 1);
  const active = beforeSelection.projects.find((project) => project.available)!;
  const inactive = beforeSelection.projects.filter((project) => !project.available);
  assert.equal(inactive.length, 2);
  const token = await prisma.projectToken.findFirstOrThrow({ where: { projectId: active.id }, select: { id: true } });
  const run = await prisma.agentRun.create({ data: { projectId: active.id, tokenId: token.id, agent: "dev", stepId: "plan" }, select: { id: true } });
  await prisma.agentRunStep.create({ data: { runId: run.id, stepId: "plan", outcome: "handoff", note: "preserve" } });
  const preserved = await Promise.all([prisma.projectToken.count({ where: { project: { ownerUserId: user.id } } }), prisma.agentRun.count({ where: { project: { ownerUserId: user.id } } }), prisma.agentRunStep.count({ where: { run: { project: { ownerUserId: user.id } } } })]);
  const outcomes = await Promise.all(inactive.map((target) => selectProjectForUse(prisma, {
    userId: user.id, targetProjectId: target.id, replacementProjectId: active.id, expectedVersion: beforeSelection.version,
  })));
  assert.equal(outcomes.filter((result) => result.status === "success").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "stale").length, 1);
  assert.deepEqual(await Promise.all([prisma.projectToken.count({ where: { project: { ownerUserId: user.id } } }), prisma.agentRun.count({ where: { project: { ownerUserId: user.id } } }), prisma.agentRunStep.count({ where: { run: { project: { ownerUserId: user.id } } } })]), preserved);
  assert.equal((await readProjectAccess(prisma, active.id)).available, false);
  assert.equal((await syncProject(prisma, { projectId: active.id, workspaces: [] })).ok, false);
  const afterSelection = await loadProjectAvailability(prisma, user.id);
  assert.equal(afterSelection.availableCount, 1);
  assert.equal(afterSelection.version, beforeSelection.version + 1);
  const selected = afterSelection.projects.find((project) => project.available)!;
  const sync = await syncProject(prisma, { projectId: selected.id, language: "en", workspaces: [{ id: "web", path: ".", agent: "dev", verify: ["npm test"], knowledge: null, readOnly: [] }] });
  assert.equal(sync.ok, true);
  assert.ok((await prisma.project.findUniqueOrThrow({ where: { id: selected.id }, select: { lastSyncedAt: true } })).lastSyncedAt instanceof Date);
  assert.equal((await inspectOwnershipCleanup(prisma, "post")).ok, true);

  const mainCount = await prisma.project.count({ where: { ownerUserId: user.id } });
  await prisma.user.delete({ where: { id: raceUser.id } });
  assert.equal(await prisma.project.count({ where: { ownerUserId: raceUser.id } }), 0);
  assert.equal(await prisma.project.count({ where: { ownerUserId: user.id } }), mainCount);
}

async function writeReceipt(repositoryRoot: string, workDirectory: string, identity: DatabaseIdentity, baseline: string): Promise<string> {
  const cleanup = await readFile(join(repositoryRoot, "prisma/migrations", CLEANUP_MIGRATION, "migration.sql"));
  const recovery = await readFile(join(repositoryRoot, RECOVERY_SQL));
  const receipt = {
    version: 1, database: identity.database, schema: identity.schema, d2Artifact: baseline,
    d2MigrationsSha256: await artifactMigrationDigest(repositoryRoot, baseline),
    cleanupMigration: CLEANUP_MIGRATION, cleanupSqlSha256: digest(cleanup),
    recoveryMigration: RECOVERY_MIGRATION, recoverySqlSha256: digest(recovery),
    backupReference: "isolated-rehearsal-fixture", rehearsalEvidence: "generated-by-rehearse-project-availability-d3",
  };
  const path = join(workDirectory, "recovery-receipt.json");
  await writeFile(path, JSON.stringify(receipt));
  return path;
}

async function main(): Promise<void> {
  let args: Arguments;
  try { args = parseArguments(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : "invalid arguments"); process.exitCode = 2; return; }
  const primaryUrl = process.env.IPA_D3_REHEARSAL_DATABASE_URL;
  const restoreUrl = process.env.IPA_D3_RESTORE_DATABASE_URL;
  if (!primaryUrl || !restoreUrl) { console.error("IPA_D3_REHEARSAL_DATABASE_URL and IPA_D3_RESTORE_DATABASE_URL are required"); process.exitCode = 2; return; }

  const repositoryRoot = process.cwd();
  const workDirectory = await mkdtemp(join(tmpdir(), "stagekeeper-ipa-d3-"));
  const workPrefix = `${resolve(tmpdir())}${sep}stagekeeper-ipa-d3-`;
  const primary = new PrismaClient({ adapter: new PrismaPg({ connectionString: primaryUrl }) });
  const restore = new PrismaClient({ adapter: new PrismaPg({ connectionString: restoreUrl }) });
  const cancel = () => { cancelled = true; for (const child of children) child.kill("SIGTERM"); };
  process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
  let succeeded = false;
  try {
    const [primaryIdentity, restoreIdentity] = await Promise.all([identity(primary), identity(restore)]);
    assert.equal(primaryIdentity.recovery, false); assert.equal(restoreIdentity.recovery, false);
    assert.notEqual(primaryIdentity.database, restoreIdentity.database, "fixture URLs must identify different databases");
    await Promise.all([assertEmpty(primary), assertEmpty(restore)]);
    const primarySource = await prepareBaseline(repositoryRoot, join(workDirectory, "primary"), args.baseline, primaryUrl);
    const restoreSource = await prepareBaseline(repositoryRoot, join(workDirectory, "restore"), args.baseline, restoreUrl);
    await Promise.all([baselineSmoke(primarySource, primaryUrl, "setup"), baselineSmoke(restoreSource, restoreUrl, "setup")]);
    const before = await snapshot(primary);
    await migrateD3(repositoryRoot, primaryUrl);
    assert.equal(await snapshot(primary), before, "cleanup changed a preserved row value");
    await exerciseFinalSchema(primary);

    await migrateD3(repositoryRoot, restoreUrl);
    await exerciseFinalSchema(restore);
    const restoreBefore = await snapshot(restore);
    const receipt = await writeReceipt(repositoryRoot, workDirectory, restoreIdentity, args.baseline);
    await run(process.execPath, ["--import", "tsx", "scripts/restore-project-ownership-shadow.ts", "--apply", "--backup-receipt", receipt], {
      cwd: repositoryRoot, env: { ...process.env, IPA_D3_RECOVERY_DATABASE_URL: restoreUrl }, quiet: true,
    });
    assert.equal(await snapshot(restore), restoreBefore, "compensation changed a preserved row value");
    await baselineSmoke(restoreSource, restoreUrl, "verify");
    console.log(JSON.stringify({ ok: true, phase: "D3", verified: ["d2-artifact", "cleanup", "preserved-rows", "post-drop-registration", "compensation", "d2-smoke"] }));
    succeeded = true;
  } finally {
    await Promise.all([...children].map((child) => new Promise<void>((resolveChild) => {
      if (child.exitCode !== null || child.signalCode !== null) { resolveChild(); return; }
      child.once("close", () => resolveChild()); child.kill("SIGTERM");
    })));
    await Promise.allSettled([primary.$disconnect(), restore.$disconnect()]);
    process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
    if (!resolve(workDirectory).startsWith(workPrefix)) throw new Error("refusing to remove an unexpected D3 work directory");
    await rm(workDirectory, { recursive: true, force: true });
    if (!succeeded) console.error("D3 rehearsal failed; isolated databases were preserved for inspection");
  }
}

main().catch(() => { console.error("D3 rehearsal failed; inspect the isolated databases and migration history before retrying"); process.exitCode = 1; });
