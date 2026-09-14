import { withAvailabilityTransaction } from "../src/server/project-availability-service";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { loadProjectView } from "../src/server/mcp/project-query";
import { registerProjectIn } from "../src/server/project-registration-query";
import { checkOwnership, runProjectAvailabilityBackfill } from "./lib/project-availability-migration";

const REHEARSAL_FLAG = "--allow-fixtures";
const BASELINE_MIGRATION_COUNT = 10;
const MIGRATION_SUFFIX = "add_individual_project_availability_foundation";
const activeChildren = new Set<ChildProcess>();
let cancellationRequested = false;

const LEGACY_TABLE_COLUMNS = {
  User: ["id", "githubId", "login", "createdAt"],
  Subscription: ["id", "userId", "plan", "source", "note", "createdAt", "updatedAt"],
  Project: ["id", "slug", "name", "owner", "repo", "branch", "language", "executorKind", "commandIssue", "runbookVersion", "createdAt"],
  ProjectMember: ["projectId", "userId", "role"],
  ProjectToken: ["id", "projectId", "hash", "label", "createdAt", "revokedAt"],
  OwnerToken: ["id", "projectId", "userId", "hash", "label", "createdAt", "revokedAt"],
  Workspace: ["id", "projectId", "wsId", "path", "agent", "verify", "knowledge", "readOnly"],
  BacklogItem: ["id", "projectId", "key", "title", "area", "source", "createdAt", "removedAt"],
  BoardItem: ["id", "projectId", "backlogItemId", "agent", "status", "reason", "results", "validation", "acceptedAt", "planPath", "planCommit", "proposedOn", "updatedAt", "discardedAt"],
  TransitionEvent: ["id", "boardItemId", "from", "to", "actor", "actorId", "channel", "note", "at"],
  Report: ["id", "boardItemId", "actor", "path", "commit", "at"],
  Template: ["lang", "path", "body", "updatedAt"],
  Command: ["id", "projectId", "kind", "body", "status", "createdAt", "ackedAt", "doneAt", "summary"],
  AgentRun: ["id", "projectId", "agent", "key", "tokenId", "stepId", "refused", "openedAt", "closedAt"],
  AgentRunStep: ["id", "runId", "stepId", "outcome", "note", "at"],
  PipelineVersion: ["id", "projectId", "version", "nodes", "gates", "createdAt", "createdBy"],
  PipelineRun: ["id", "boardItemId", "versionId", "node", "enteredAt", "closedAt"],
} as const;

type LegacySnapshot = Record<keyof typeof LEGACY_TABLE_COLUMNS, unknown[]>;
type BaselineClient = {
  project: {
    findUniqueOrThrow(args: { where: { id: string }; select: Record<string, boolean> }): Promise<Record<string, unknown>>;
  };
  $disconnect(): Promise<void>;
};

type BaselineClientConstructor = new (options: { adapter: PrismaPg }) => BaselineClient;

function assertRehearsalArguments(args: readonly string[]): void {
  if (args.length !== 1 || args[0] !== REHEARSAL_FLAG) {
    throw new Error(`refusing fixtures: run npm run test:project-availability:db -- ${REHEARSAL_FLAG}`);
  }
}

function rehearsalUrl(): string {
  const value = process.env.IPA_REHEARSAL_DATABASE_URL;
  if (!value) throw new Error("IPA_REHEARSAL_DATABASE_URL is required; DATABASE_URL is never used for fixtures");
  return value;
}

function assertOwnedWorkDirectory(workDirectory: string): void {
  const expectedPrefix = `${resolve(tmpdir())}${sep}stagekeeper-ipa-d1-`;
  if (!resolve(workDirectory).startsWith(expectedPrefix)) {
    throw new Error("refusing to remove an unexpected rehearsal work directory");
  }
}

async function run(command: string, args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<string> {
  if (cancellationRequested) throw new Error("rehearsal cancelled");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => {
      activeChildren.delete(child);
      reject(error);
    });
    child.once("close", (code) => {
      activeChildren.delete(child);
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${command} failed with exit ${code}: ${stderr.trim()}`));
    });
  });
}

async function gitText(repositoryRoot: string, args: readonly string[]): Promise<string> {
  return run("git", args, { cwd: repositoryRoot });
}

async function writeBaselineBundle(repositoryRoot: string, workDirectory: string): Promise<{
  baselineConfig: string;
  candidateConfig: string;
  baselineClientDirectory: string;
}> {
  const baselineMigrations = (await gitText(repositoryRoot, ["ls-tree", "-r", "--name-only", "0eef5cb777e6ff6f4343cd2d4a1a9c03f4eac70b", "prisma/migrations"]))
    .trim().split("\n").filter((file) => file.endsWith("migration.sql"));
  if (baselineMigrations.length !== BASELINE_MIGRATION_COUNT) {
    throw new Error(`expected ${BASELINE_MIGRATION_COUNT} baseline migrations, found ${baselineMigrations.length}`);
  }

  const candidates = (await readdir(join(repositoryRoot, "prisma/migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(MIGRATION_SUFFIX))
    .map((entry) => entry.name);
  if (candidates.length !== 1) throw new Error(`expected one candidate migration, found ${candidates.length}`);

  const baselineMigrationRoot = join(workDirectory, "baseline-migrations");
  const candidateMigrationRoot = join(workDirectory, "candidate-migrations");
  await mkdir(baselineMigrationRoot, { recursive: true });
  await mkdir(candidateMigrationRoot, { recursive: true });
  for (const source of baselineMigrations) {
    const relative = source.slice("prisma/migrations/".length);
    const baselineTarget = join(baselineMigrationRoot, relative);
    const candidateTarget = join(candidateMigrationRoot, relative);
    const body = await gitText(repositoryRoot, ["show", `0eef5cb777e6ff6f4343cd2d4a1a9c03f4eac70b:${source}`]);
    await mkdir(dirname(baselineTarget), { recursive: true });
    await mkdir(dirname(candidateTarget), { recursive: true });
    await writeFile(baselineTarget, body);
    await writeFile(candidateTarget, body);
  }

  const candidateName = candidates[0];
  if (!candidateName) throw new Error("candidate migration disappeared");
  const candidateTarget = join(candidateMigrationRoot, candidateName, "migration.sql");
  await mkdir(dirname(candidateTarget), { recursive: true });
  await writeFile(candidateTarget, await readFile(join(repositoryRoot, "prisma/migrations", candidateName, "migration.sql")));
  await writeFile(join(baselineMigrationRoot, "migration_lock.toml"), "provider = \"postgresql\"\n");
  await writeFile(join(candidateMigrationRoot, "migration_lock.toml"), "provider = \"postgresql\"\n");

  const baselineClientDirectory = join(workDirectory, "baseline-client");
  const baselineSchema = (await gitText(repositoryRoot, ["show", "0eef5cb777e6ff6f4343cd2d4a1a9c03f4eac70b:prisma/schema.prisma"]))
    .replace(/output\s+=\s+"[^"]+"/, `output   = "${baselineClientDirectory.replaceAll("\\", "\\\\")}"`);
  const baselineSchemaPath = join(workDirectory, "baseline-schema.prisma");
  const candidateSchemaPath = join(workDirectory, "candidate-schema.prisma");
  await writeFile(baselineSchemaPath, baselineSchema);
  await writeFile(candidateSchemaPath, await readFile(join(repositoryRoot, "prisma/schema.prisma"), "utf8"));

  const config = (schemaPath: string, migrationPath: string) => [
    'import "dotenv/config";',
    'import { defineConfig, env } from "prisma/config";',
    `export default defineConfig({ schema: ${JSON.stringify(schemaPath)}, migrations: { path: ${JSON.stringify(migrationPath)} }, datasource: { url: env("DATABASE_URL") } });`,
    "",
  ].join("\n");
  const baselineConfig = join(workDirectory, "prisma-baseline.config.ts");
  const candidateConfig = join(workDirectory, "prisma-candidate.config.ts");
  await writeFile(baselineConfig, config(baselineSchemaPath, baselineMigrationRoot));
  await writeFile(candidateConfig, config(candidateSchemaPath, candidateMigrationRoot));
  await symlink(join(repositoryRoot, "node_modules"), join(workDirectory, "node_modules"), "dir");
  return { baselineConfig, candidateConfig, baselineClientDirectory };
}

async function assertEmptyDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tableName: string }>>`
    SELECT tablename AS "tableName"
    FROM pg_catalog.pg_tables
    WHERE schemaname = current_schema()
  `;
  if (rows.length > 0) throw new Error(`rehearsal database must be empty; found ${rows.length} tables`);
}

async function appliedMigrationCount(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `;
  return Number(rows[0]?.count ?? 0);
}

async function executeStatements(prisma: PrismaClient, sql: string): Promise<void> {
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function createInvalidFixtures(prisma: PrismaClient): Promise<void> {
  await executeStatements(prisma, `
    INSERT INTO "User" ("id", "githubId", "login") VALUES
      ('ipa-invalid-user-1', 910001, 'ipa-invalid-1'),
      ('ipa-invalid-user-2', 910002, 'ipa-invalid-2');
    INSERT INTO "Project" ("id", "slug", "name", "owner", "repo", "branch") VALUES
      ('ipa-invalid-none', 'ipa-invalid-none', 'Invalid None', 'repo-owner', 'none', 'main'),
      ('ipa-invalid-two', 'ipa-invalid-two', 'Invalid Two', 'repo-owner', 'two', 'main'),
      ('ipa-invalid-member', 'ipa-invalid-member', 'Invalid Member', 'repo-owner', 'member', 'main');
    INSERT INTO "ProjectMember" ("projectId", "userId", "role") VALUES
      ('ipa-invalid-two', 'ipa-invalid-user-1', 'owner'),
      ('ipa-invalid-two', 'ipa-invalid-user-2', 'owner'),
      ('ipa-invalid-member', 'ipa-invalid-user-1', 'member');
  `);
}

async function removeInvalidFixtures(prisma: PrismaClient): Promise<void> {
  await executeStatements(prisma, `
    DELETE FROM "Project" WHERE "id" IN ('ipa-invalid-none', 'ipa-invalid-two', 'ipa-invalid-member');
    DELETE FROM "User" WHERE "id" IN ('ipa-invalid-user-1', 'ipa-invalid-user-2');
  `);
}

async function createLegacyFixtures(prisma: PrismaClient): Promise<void> {
  await executeStatements(prisma, `
    INSERT INTO "User" ("id", "githubId", "login") VALUES ('ipa-user', 920001, 'ipa-user');
    INSERT INTO "Subscription" ("id", "userId", "plan", "source", "note", "updatedAt")
      VALUES ('ipa-subscription', 'ipa-user', 'free', 'manual', 'rehearsal', CURRENT_TIMESTAMP);
    INSERT INTO "Project" ("id", "slug", "name", "owner", "repo", "branch", "language", "executorKind", "runbookVersion") VALUES
      ('ipa-project-a', 'ipa-project-a', 'Project A', 'repo-owner', 'project-a', 'main', 'ko', 'local', 'abcdef123456'),
      ('ipa-project-b', 'ipa-project-b', 'Project B', 'repo-owner', 'project-b', 'main', 'ko', 'local', NULL);
    INSERT INTO "ProjectMember" ("projectId", "userId", "role") VALUES
      ('ipa-project-a', 'ipa-user', 'owner'), ('ipa-project-b', 'ipa-user', 'owner');
    INSERT INTO "ProjectToken" ("id", "projectId", "hash", "label") VALUES ('ipa-project-token', 'ipa-project-a', 'ipa-project-token-hash', 'initial');
    INSERT INTO "OwnerToken" ("id", "projectId", "userId", "hash", "label") VALUES ('ipa-owner-token', 'ipa-project-a', 'ipa-user', 'ipa-owner-token-hash', 'owner');
    INSERT INTO "Workspace" ("id", "projectId", "wsId", "path", "agent", "verify", "knowledge", "readOnly")
      VALUES ('ipa-workspace', 'ipa-project-a', 'web', 'apps/web', 'dev', ARRAY['npm test','npm run build'], NULL, ARRAY['docs/**']);
    INSERT INTO "BacklogItem" ("id", "projectId", "key", "title", "area", "source")
      VALUES ('ipa-backlog', 'ipa-project-a', 'IPA-1', 'Rehearsal', 'server', 'fixture');
    INSERT INTO "BoardItem" ("id", "projectId", "backlogItemId", "agent", "status", "reason", "results", "validation", "acceptedAt", "planPath", "planCommit", "updatedAt")
      VALUES ('ipa-board', 'ipa-project-a', 'ipa-backlog', 'dev', 'implementing', 'fixture', ARRAY['ready'], NULL, NULL, 'docs/plan.md', 'abc123', CURRENT_TIMESTAMP);
    INSERT INTO "TransitionEvent" ("id", "boardItemId", "from", "to", "actor", "actorId", "channel", "note")
      VALUES ('ipa-transition', 'ipa-board', 'planning', 'implementing', 'human', 'ipa-user', 'web', 'fixture');
    INSERT INTO "Report" ("id", "boardItemId", "actor", "path", "commit")
      VALUES ('ipa-report', 'ipa-board', 'dev', 'docs/report.md', 'def456');
    INSERT INTO "Template" ("lang", "path", "body", "updatedAt") VALUES ('ko', 'agents/dev.md', 'fixture', CURRENT_TIMESTAMP);
    INSERT INTO "Command" ("id", "projectId", "kind", "body", "status")
      VALUES ('ipa-command', 'ipa-project-a', 'dev-work', 'fixture', 'queued');
    INSERT INTO "AgentRun" ("id", "projectId", "agent", "key", "tokenId", "stepId", "openedAt")
      VALUES ('ipa-run', 'ipa-project-a', 'dev', 'IPA-1', 'ipa-project-token', 'implement', '2026-09-13T12:00:00Z');
    INSERT INTO "AgentRunStep" ("id", "runId", "stepId", "outcome", "note", "at")
      VALUES ('ipa-step', 'ipa-run', 'implement', 'handoff', 'fixture', '2026-09-13T13:00:00Z');
    INSERT INTO "PipelineVersion" ("id", "projectId", "version", "nodes", "gates", "createdBy")
      VALUES ('ipa-version', 'ipa-project-a', 1, ARRAY['plan','implement','accept'], ARRAY['before-plan'], 'ipa-user');
    INSERT INTO "PipelineRun" ("id", "boardItemId", "versionId", "node")
      VALUES ('ipa-pipeline-run', 'ipa-board', 'ipa-version', 'implement');
  `);
}

async function legacySnapshot(prisma: PrismaClient): Promise<LegacySnapshot> {
  const entries = await Promise.all(Object.entries(LEGACY_TABLE_COLUMNS).map(async ([table, columns]) => {
    const projection = columns.map((column) => `"${column}"`).join(", ");
    const rows = await prisma.$queryRawUnsafe<unknown[]>(`SELECT ${projection} FROM "${table}" ORDER BY 1, 2`);
    return [table, rows] as const;
  }));
  return Object.fromEntries(entries) as LegacySnapshot;
}

function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(comparable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, comparable(item)]));
  }
  return value;
}

function assertSameLegacyRows(before: LegacySnapshot, after: LegacySnapshot): void {
  const left = JSON.stringify(comparable(before));
  const right = JSON.stringify(comparable(after));
  if (left !== right) throw new Error("legacy rows changed during D1 migration/backfill");
}

function baselineClientConstructor(module: unknown): BaselineClientConstructor {
  if (module === null || typeof module !== "object" || !("PrismaClient" in module) || typeof module.PrismaClient !== "function") {
    throw new Error("generated baseline client has no PrismaClient export");
  }
  return module.PrismaClient as BaselineClientConstructor;
}

async function main(): Promise<void> {
  assertRehearsalArguments(process.argv.slice(2));
  const connectionString = rehearsalUrl();
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const workDirectory = await mkdtemp(join(tmpdir(), "stagekeeper-ipa-d1-"));
  const prismaCli = join(repositoryRoot, "node_modules/prisma/build/index.js");
  const childEnv = { ...process.env, DATABASE_URL: connectionString };
  let candidate = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  let succeeded = false;
  const cancel = () => {
    cancellationRequested = true;
    for (const child of activeChildren) child.kill("SIGTERM");
  };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);

  try {
    await assertEmptyDatabase(candidate);
    const bundle = await writeBaselineBundle(repositoryRoot, workDirectory);
    await run(process.execPath, [prismaCli, "migrate", "deploy", "--config", bundle.baselineConfig], { cwd: repositoryRoot, env: childEnv });
    if (await appliedMigrationCount(candidate) !== BASELINE_MIGRATION_COUNT) {
      throw new Error("baseline migration history is incomplete");
    }
    await run(process.execPath, [prismaCli, "generate", "--config", bundle.baselineConfig], { cwd: repositoryRoot, env: childEnv });

    await createInvalidFixtures(candidate);
    const invalid = await checkOwnership(candidate);
    if (invalid.ok || !invalid.issues.some((issue) => issue.code === "owner-count") || !invalid.issues.some((issue) => issue.code === "non-owner-member")) {
      throw new Error("ownership preflight accepted invalid fixtures");
    }
    await removeInvalidFixtures(candidate);
    await createLegacyFixtures(candidate);
    const before = await legacySnapshot(candidate);

    await run(process.execPath, [prismaCli, "migrate", "deploy", "--config", bundle.candidateConfig], { cwd: repositoryRoot, env: childEnv });
    if (await appliedMigrationCount(candidate) !== BASELINE_MIGRATION_COUNT + 1) {
      throw new Error("candidate migration history is incomplete");
    }
    await candidate.$disconnect();
    candidate = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    const first = await runProjectAvailabilityBackfill(candidate, "apply");
    if (first.failedUserId !== null || !first.owners.some((owner) => owner.userId === "ipa-user" && owner.changed)) {
      throw new Error("initial backfill did not apply the expected owner snapshot");
    }
    const projectA = await candidate.project.findUniqueOrThrow({ where: { id: "ipa-project-a" }, select: { ownerUserId: true, repoOwner: true, available: true } });
    const projectB = await candidate.project.findUniqueOrThrow({ where: { id: "ipa-project-b" }, select: { ownerUserId: true, repoOwner: true, available: true } });
    if (projectA.ownerUserId !== "ipa-user" || projectA.repoOwner !== "repo-owner" || !projectA.available || projectB.available) {
      throw new Error("ranking or shadow ownership result is incorrect");
    }
    const after = await legacySnapshot(candidate);
    assertSameLegacyRows(before, after);

    const second = await runProjectAvailabilityBackfill(candidate, "apply");
    if (second.drift || second.owners.some((owner) => owner.changed)) throw new Error("same-source backfill was not idempotent");

    await candidate.user.create({
      data: { id: "ipa-concurrent-user", githubId: 920003, login: "ipa-concurrent", subscription: { create: { plan: "max" } } },
    });
    const concurrent = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    let concurrentRegistrationRuns = 0;
    try {
      const consistent = await checkOwnership(candidate, async () => {
        concurrentRegistrationRuns += 1;
        const capped = await withAvailabilityTransaction(concurrent, (transaction) => registerProjectIn(transaction, {
          userId: "ipa-concurrent-user",

          slug: "ipa-concurrent",
          name: "Concurrent",
          owner: "repo-owner",
          repo: "concurrent",
          branch: "main",
          initialTokenHash: "ipa-concurrent-token-hash",
        }));
        if (capped !== null) throw new Error(`concurrent registration was capped: ${capped}`);
      });
      if (!consistent.ok || concurrentRegistrationRuns !== 1) {
        throw new Error("read-only preflight mixed snapshots during concurrent registration");
      }
    } finally {
      await concurrent.$disconnect();
    }

    await candidate.user.create({
      data: {
        id: "ipa-registration-user",
        githubId: 920002,
        login: "ipa-registration",
        subscription: { create: { plan: "max" } },
      },
    });
    const registration = await withAvailabilityTransaction(candidate, (transaction) => registerProjectIn(transaction, {
      userId: "ipa-registration-user",

      slug: "ipa-registration",
      name: "Registration",
      owner: "repo-owner",
      repo: "registration",
      branch: "main",
      initialTokenHash: "ipa-registration-token-hash",
    }));
    if (registration !== null) throw new Error(`registration was capped unexpectedly: ${registration}`);
    const registered = await candidate.project.findUniqueOrThrow({
      where: { slug: "ipa-registration" },
      select: {
        ownerUserId: true,
        repoOwner: true,
        available: true,
        lastSelectedAt: true,
        lastSyncedAt: true,
        members: { select: { userId: true, role: true } },
        tokens: { select: { hash: true, label: true } },
      },
    });
    if (
      registered.ownerUserId !== "ipa-registration-user"
      || registered.repoOwner !== "repo-owner"
      || !registered.available
      || registered.lastSelectedAt !== null
      || registered.lastSyncedAt !== null
      || registered.members.length !== 1
      || registered.tokens.length !== 1
    ) throw new Error("registration dual-write result is incomplete");

    try {
      await withAvailabilityTransaction(candidate, async (transaction) => {
        const capped = await registerProjectIn(transaction, {
          userId: "ipa-registration-user",

          slug: "ipa-registration-rollback",
          name: "Rollback",
          owner: "repo-owner",
          repo: "rollback",
          branch: "main",
          initialTokenHash: "ipa-registration-rollback-token-hash",
        });
        if (capped !== null) throw new Error(`rollback fixture was capped: ${capped}`);
        throw new Error("intentional registration rollback");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "intentional registration rollback") throw error;
    }
    if (await candidate.project.findUnique({ where: { slug: "ipa-registration-rollback" }, select: { id: true } })) {
      throw new Error("failed registration transaction left a project behind");
    }

    const view = await loadProjectView((args) => candidate.project.findUniqueOrThrow(args), "ipa-project-a");
    if ("ownerUserId" in view || "repoOwner" in view || "available" in view) throw new Error("MCP view exposed D1 shadow fields");

    const BaselinePrismaClient = baselineClientConstructor(await import(pathToFileURL(join(bundle.baselineClientDirectory, "client.ts")).href));
    const baseline = new BaselinePrismaClient({ adapter: new PrismaPg({ connectionString }) });
    try {
      const legacyProject = await baseline.project.findUniqueOrThrow({ where: { id: "ipa-project-a" }, select: { id: true, slug: true, owner: true, repo: true } });
      if (legacyProject.slug !== "ipa-project-a") throw new Error("baseline client rollback read failed");
    } finally {
      await baseline.$disconnect();
    }

    console.log(JSON.stringify({
      ok: true,
      baselineMigrations: BASELINE_MIGRATION_COUNT,
      candidateMigrations: 1,
      ownershipIssuesRejected: invalid.issues.length,
      concurrentPreflightSnapshot: true,
      backfillOwners: first.completedUserIds.length,
      legacyRowsPreserved: true,
      idempotentRerun: true,
      registrationDualWriteAndRollback: true,
      MCPShadowFieldsExposed: false,
      baselineClientRollbackRead: true,
    }, null, 2));
    succeeded = true;
  } finally {
    await Promise.all([...activeChildren].map((child) => new Promise<void>((resolveChild) => {
      if (child.exitCode !== null || child.signalCode !== null) { resolveChild(); return; }
      child.once("close", () => resolveChild());
      child.kill("SIGTERM");
    })));
    await candidate.$disconnect();
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    assertOwnedWorkDirectory(workDirectory);
    await rm(workDirectory, { recursive: true, force: true });
    if (!succeeded) console.error("rehearsal failed; isolated database preserved for debugging");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "project availability rehearsal failed";
  console.error(message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url]"));
  process.exitCode = 1;
});
