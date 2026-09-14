import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { CLEANUP_MIGRATION, inspectOwnershipCleanup } from "./lib/project-ownership-cleanup";
import { artifactMigrationDigest, digest, isRecoveryReceipt, RECOVERY_MIGRATION, RECOVERY_SQL, type RecoveryReceipt } from "./lib/project-ownership-recovery";
type RecoveryArgs = { mode: "check" } | { mode: "apply"; receiptPath: string } | { mode: "help" };
let activeChild: ChildProcess | undefined;
let cancelled = false;

function parseArgs(args: readonly string[]): RecoveryArgs {
  if (args.length === 0 || (args.length === 1 && args[0] === "--check")) return { mode: "check" };
  if (args.length === 1 && args[0] === "--help") return { mode: "help" };
  if (args.length === 3 && args[0] === "--apply" && args[1] === "--backup-receipt" && args[2]) return { mode: "apply", receiptPath: args[2] };
  throw new Error("usage: npm run restore:project-ownership:shadow -- [--check|--apply --backup-receipt <path>]");
}

async function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (cancelled) throw new Error("recovery cancelled");
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: "inherit" });
    activeChild = child;
    child.once("error", reject);
    child.once("close", (code) => {
      activeChild = undefined;
      if (code === 0) resolvePromise();
      else reject(new Error(`recovery migration failed with exit ${code}`));
    });
  });
}

async function databaseIdentity(prisma: PrismaClient): Promise<{ database: string; schema: string }> {
  const rows = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`SELECT current_database() AS database, current_schema() AS schema`;
  if (!rows[0]) throw new Error("database identity query returned no row");
  return rows[0];
}

async function applyRecovery(connectionString: string, receipt: RecoveryReceipt): Promise<void> {
  const repositoryRoot = process.cwd();
  const sql = await readFile(join(repositoryRoot, RECOVERY_SQL));
  const cleanupSql = await readFile(join(repositoryRoot, "prisma/migrations", CLEANUP_MIGRATION, "migration.sql"));
  if (receipt.cleanupMigration !== CLEANUP_MIGRATION || receipt.recoveryMigration !== RECOVERY_MIGRATION
    || receipt.cleanupSqlSha256 !== digest(cleanupSql) || receipt.recoverySqlSha256 !== digest(sql)
    || receipt.d2MigrationsSha256 !== await artifactMigrationDigest(repositoryRoot, receipt.d2Artifact)) {
    throw new Error("recovery receipt does not match the reviewed migration bundle");
  }
  const workDirectory = await mkdtemp(join(tmpdir(), "stagekeeper-ipa-d3-recovery-"));
  const expectedPrefix = `${resolve(tmpdir())}${sep}stagekeeper-ipa-d3-recovery-`;
  try {
    const migrations = join(workDirectory, "migrations");
    await cp(join(repositoryRoot, "prisma/migrations"), migrations, { recursive: true });
    const recoveryDirectory = join(migrations, RECOVERY_MIGRATION);
    await mkdir(recoveryDirectory, { recursive: true });
    await writeFile(join(recoveryDirectory, "migration.sql"), sql);
    const config = join(workDirectory, "prisma.config.ts");
    await writeFile(config, [
      'import { defineConfig, env } from "prisma/config";',
      `export default defineConfig({ schema: ${JSON.stringify(join(repositoryRoot, "prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: env("DATABASE_URL") } });`,
      "",
    ].join("\n"));
    await symlink(join(repositoryRoot, "node_modules"), join(workDirectory, "node_modules"), "dir");
    await run(process.execPath, [join(repositoryRoot, "node_modules/prisma/build/index.js"), "migrate", "deploy", "--config", config], repositoryRoot, { ...process.env, DATABASE_URL: connectionString });
  } finally {
    if (!resolve(workDirectory).startsWith(expectedPrefix)) throw new Error("refusing to remove an unexpected recovery directory");
    await rm(workDirectory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  let args: RecoveryArgs;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(error instanceof Error ? error.message : "invalid arguments"); process.exitCode = 2; return; }
  if (args.mode === "help") { console.log("usage: npm run restore:project-ownership:shadow -- [--check|--apply --backup-receipt <path>]"); return; }
  const connectionString = process.env.IPA_D3_RECOVERY_DATABASE_URL;
  if (!connectionString) { console.error("IPA_D3_RECOVERY_DATABASE_URL is required"); process.exitCode = 2; return; }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const cancel = () => { cancelled = true; activeChild?.kill("SIGTERM"); };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const post = await inspectOwnershipCleanup(prisma, "post");
    if (args.mode === "check") {
      const pre = post.ok ? null : await inspectOwnershipCleanup(prisma, "pre");
      console.log(JSON.stringify({ state: post.ok ? "d3" : pre?.ok === true ? "restored-d2" : "mixed", post, pre }, null, 2));
      process.exitCode = post.ok || pre?.ok === true ? 0 : 1;
      return;
    }
    if (!post.ok) throw new Error("recovery apply requires an intact D3 schema");
    const parsed: unknown = JSON.parse(await readFile(args.receiptPath, "utf8"));
    if (!isRecoveryReceipt(parsed)) throw new Error("invalid recovery receipt");
    const identity = await databaseIdentity(prisma);
    if (identity.database !== parsed.database || identity.schema !== parsed.schema) throw new Error("recovery receipt targets a different database");
    if (!post.migration || post.migration.migrationName !== CLEANUP_MIGRATION || post.migration.finishedAt === null
      || post.migration.rolledBackAt !== null || post.migration.checksum !== parsed.cleanupSqlSha256) {
      throw new Error("cleanup migration history does not match the reviewed successful migration");
    }
    const priorRecovery = await prisma.$queryRaw<Array<{ finishedAt: Date | null; rolledBackAt: Date | null }>>`
      SELECT finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt" FROM "_prisma_migrations"
      WHERE migration_name = ${RECOVERY_MIGRATION} ORDER BY started_at DESC LIMIT 1`;
    if (priorRecovery.length > 0) throw new Error("recovery migration already has history; inspect it before retrying");
    await prisma.$disconnect();
    await applyRecovery(connectionString, parsed);
    const verify = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    try {
      const pre = await inspectOwnershipCleanup(verify, "pre");
      if (!pre.ok) throw new Error("recovery migration completed without restoring the D2 schema");
      console.log(JSON.stringify({ ok: true, state: "restored-d2", schemaFingerprint: pre.schemaFingerprint }));
    } finally { await verify.$disconnect(); }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
      const child = activeChild;
      await new Promise<void>((resolveChild) => { child.once("close", () => resolveChild()); child.kill("SIGTERM"); });
    }
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

main().catch(() => { console.error("project ownership shadow recovery failed; inspect catalog and migration history before retrying"); process.exitCode = 1; });
