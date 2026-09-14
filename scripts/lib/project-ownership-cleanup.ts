import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";

export const CLEANUP_MIGRATION = "20260914090000_remove_individual_project_ownership_shadow";
export const CLEANUP_READ_OPTIONS = { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30000 } as const;

export type CleanupMode = "pre" | "post";
export type CleanupCatalog = {
  memberTable: boolean;
  legacyOwnerColumn: boolean;
  ownerUserNullable: boolean;
  repoOwnerNullable: boolean;
  eventArraysNullable: boolean;
  ownerDeleteRule: string | null;
  ownerUpdateRule: string | null;
  availabilityIndex: boolean;
  eventVersionUnique: boolean;
};
export type CleanupProject = {
  id: string;
  ownerUserId: string | null;
  repoOwner: string | null;
  legacyOwner: string | null;
  available: boolean;
};
export type CleanupUser = { id: string; version: number; plan: string | null };
export type CleanupMember = { projectId: string; userId: string; role: string };
export type CleanupEvent = { ownerUserId: string; version: number; availableProjectIds: string[] | null };
export type CleanupMigrationState = { migrationName: string; checksum: string; finishedAt: Date | null; rolledBackAt: Date | null } | null;
export type CleanupFacts = {
  mode: CleanupMode;
  catalog: CleanupCatalog;
  projects: CleanupProject[];
  users: CleanupUser[];
  members: CleanupMember[];
  latestEvents: CleanupEvent[];
  eventArraysContainNull: boolean;
  migration: CleanupMigrationState;
};
export type CleanupIssue = { code: string; ref?: string };
export type CleanupReport = {
  ok: boolean;
  mode: CleanupMode;
  asOf: string;
  schemaFingerprint: string;
  preservedDataFingerprint: string;
  issues: CleanupIssue[];
  migration: CleanupMigrationState;
};

type TransactionHost = Pick<PrismaClient, "$transaction">;
const ref = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 12);
const sorted = (values: readonly string[]): string[] => [...values].sort();
const PRESERVED_TABLES = ["User", "Subscription", "Project", "ProjectAvailabilityEvent", "ProjectToken", "OwnerToken", "Workspace", "BacklogItem", "BoardItem", "TransitionEvent", "Report", "Template", "Command", "AgentRun", "AgentRunStep", "PipelineVersion", "PipelineRun"] as const;

function catalogFingerprint(catalog: CleanupCatalog): string {
  return createHash("sha256").update(JSON.stringify(catalog)).digest("hex");
}

export function validateCleanupFacts(facts: CleanupFacts): CleanupIssue[] {
  const issues: CleanupIssue[] = [];
  const c = facts.catalog;
  if (facts.mode === "pre") {
    if (!c.memberTable) issues.push({ code: "member-table-missing" });
    if (!c.legacyOwnerColumn) issues.push({ code: "legacy-owner-missing" });
    if (!c.ownerUserNullable || !c.repoOwnerNullable) issues.push({ code: "direct-owner-already-required" });
  } else {
    if (c.memberTable) issues.push({ code: "member-table-present" });
    if (c.legacyOwnerColumn) issues.push({ code: "legacy-owner-present" });
    if (c.ownerUserNullable || c.repoOwnerNullable) issues.push({ code: "direct-owner-nullable" });
    if (c.ownerDeleteRule !== "CASCADE" || c.ownerUpdateRule !== "CASCADE") issues.push({ code: "direct-owner-fk-action" });
  }
  if (!c.availabilityIndex) issues.push({ code: "availability-index-missing" });
  if (!c.eventVersionUnique) issues.push({ code: "event-version-unique-missing" });
  if (facts.mode === "post" && c.eventArraysNullable) issues.push({ code: "event-arrays-nullable" });
  if (facts.eventArraysContainNull) issues.push({ code: "event-array-null" });

  const projectsByOwner = new Map<string, CleanupProject[]>();
  for (const project of facts.projects) {
    if (project.ownerUserId === null || project.repoOwner === null) {
      issues.push({ code: "direct-owner-null", ref: ref(project.id) });
      continue;
    }
    const owned = projectsByOwner.get(project.ownerUserId) ?? [];
    owned.push(project);
    projectsByOwner.set(project.ownerUserId, owned);
    if (facts.mode === "pre" && project.legacyOwner !== project.repoOwner) issues.push({ code: "repository-owner-mismatch", ref: ref(project.id) });
  }

  if (facts.mode === "pre") {
    for (const project of facts.projects) {
      const rows = facts.members.filter((member) => member.projectId === project.id);
      const owner = rows.filter((member) => member.role === "owner" && member.userId === project.ownerUserId);
      if (rows.length !== 1 || owner.length !== 1) issues.push({ code: "legacy-owner-mismatch", ref: ref(project.id) });
    }
    for (const member of facts.members) {
      if (!facts.projects.some((project) => project.id === member.projectId)) issues.push({ code: "orphan-member-project", ref: ref(member.projectId) });
      if (!facts.users.some((user) => user.id === member.userId)) issues.push({ code: "orphan-member-user", ref: ref(member.userId) });
    }
  }

  for (const user of facts.users) {
    const owned = projectsByOwner.get(user.id) ?? [];
    const available = owned.filter((project) => project.available).map((project) => project.id);
    const normalizedPlan = user.plan === "pro" || user.plan === "max" ? user.plan : "free";
    const cap = normalizedPlan === "free" ? 1 : normalizedPlan === "pro" ? 5 : Infinity;
    if (owned.length > 0 && available.length === 0) issues.push({ code: "empty-available-set", ref: ref(user.id) });
    if (available.length > cap) issues.push({ code: "available-over-cap", ref: ref(user.id) });
    const event = facts.latestEvents.find((candidate) => candidate.ownerUserId === user.id);
    if (!event) {
      if (user.version !== 0 || owned.length > 0) issues.push({ code: "event-missing", ref: ref(user.id) });
      continue;
    }
    if (event.availableProjectIds === null) issues.push({ code: "event-snapshot-null", ref: ref(user.id) });
    else if (new Set(event.availableProjectIds).size !== event.availableProjectIds.length) issues.push({ code: "event-snapshot-duplicate", ref: ref(user.id) });
    else if (event.version !== user.version || JSON.stringify(sorted(event.availableProjectIds)) !== JSON.stringify(sorted(available))) {
      issues.push({ code: "event-snapshot-mismatch", ref: ref(user.id) });
    }
  }
  for (const [ownerUserId, projects] of projectsByOwner) {
    if (!facts.users.some((user) => user.id === ownerUserId)) {
      for (const project of projects) issues.push({ code: "orphan-direct-owner", ref: ref(project.id) });
    }
  }
  for (const event of facts.latestEvents) {
    if (!facts.users.some((user) => user.id === event.ownerUserId)) issues.push({ code: "orphan-availability-event", ref: ref(event.ownerUserId) });
  }
  return issues;
}

type BoolRow = { value: boolean };
type NullableRow = { columnName: string; nullable: "YES" | "NO" };
type RuleRow = { deleteRule: string; updateRule: string };

export async function readCleanupFactsIn(transaction: Prisma.TransactionClient, mode: CleanupMode): Promise<CleanupFacts> {
  const [memberTable, legacyOwnerColumn, nullability, eventArrayNullability, rules, availabilityIndex, eventVersionUnique] = await Promise.all([
    transaction.$queryRaw<BoolRow[]>`SELECT to_regclass('"ProjectMember"') IS NOT NULL AS value`,
    transaction.$queryRaw<BoolRow[]>`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Project' AND column_name = 'owner') AS value`,
    transaction.$queryRaw<NullableRow[]>`SELECT column_name AS "columnName", is_nullable AS nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Project' AND column_name IN ('ownerUserId', 'repoOwner')`,
    transaction.$queryRaw<NullableRow[]>`SELECT column_name AS "columnName", is_nullable AS nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ProjectAvailabilityEvent' AND column_name IN ('addedProjectIds', 'removedProjectIds', 'availableProjectIds')`,
    transaction.$queryRaw<RuleRow[]>`SELECT rc.delete_rule AS "deleteRule", rc.update_rule AS "updateRule" FROM information_schema.referential_constraints rc WHERE rc.constraint_schema = current_schema() AND rc.constraint_name = 'Project_ownerUserId_fkey'`,
    transaction.$queryRaw<BoolRow[]>`SELECT to_regclass('"Project_ownerUserId_available_idx"') IS NOT NULL AS value`,
    transaction.$queryRaw<BoolRow[]>`SELECT to_regclass('"ProjectAvailabilityEvent_ownerUserId_version_key"') IS NOT NULL AS value`,
  ]);
  const hasMember = memberTable[0]?.value === true;
  const hasLegacyOwner = legacyOwnerColumn[0]?.value === true;
  if ((mode === "pre" && (!hasMember || !hasLegacyOwner)) || (mode === "post" && (hasMember || hasLegacyOwner))) {
    return { mode, catalog: {
      memberTable: hasMember, legacyOwnerColumn: hasLegacyOwner,
      ownerUserNullable: nullability.find((row) => row.columnName === "ownerUserId")?.nullable !== "NO",
      repoOwnerNullable: nullability.find((row) => row.columnName === "repoOwner")?.nullable !== "NO",
      eventArraysNullable: eventArrayNullability.some((row) => row.nullable !== "NO") || eventArrayNullability.length !== 3,
      ownerDeleteRule: rules[0]?.deleteRule ?? null, ownerUpdateRule: rules[0]?.updateRule ?? null,
      availabilityIndex: availabilityIndex[0]?.value === true, eventVersionUnique: eventVersionUnique[0]?.value === true,
    }, projects: [], users: [], members: [], latestEvents: [], eventArraysContainNull: false, migration: null };
  }
  const projects = hasLegacyOwner
    ? await transaction.$queryRaw<CleanupProject[]>`SELECT id, "ownerUserId", "repoOwner", owner AS "legacyOwner", available FROM "Project"`
    : await transaction.$queryRaw<CleanupProject[]>`SELECT id, "ownerUserId", "repoOwner", NULL::text AS "legacyOwner", available FROM "Project"`;
  const users = await transaction.$queryRaw<CleanupUser[]>`SELECT u.id, u."projectAvailabilityVersion" AS version, s.plan FROM "User" u LEFT JOIN "Subscription" s ON s."userId" = u.id`;
  const members = hasMember
    ? await transaction.$queryRaw<CleanupMember[]>`SELECT "projectId", "userId", role FROM "ProjectMember"`
    : [];
  const latestEvents = await transaction.$queryRaw<CleanupEvent[]>`
    SELECT DISTINCT ON ("ownerUserId") "ownerUserId", version, "availableProjectIds"
    FROM "ProjectAvailabilityEvent" ORDER BY "ownerUserId", version DESC`;
  const eventArrayNulls = await transaction.$queryRaw<BoolRow[]>`
    SELECT EXISTS (SELECT 1 FROM "ProjectAvailabilityEvent" WHERE "addedProjectIds" IS NULL OR "removedProjectIds" IS NULL OR "availableProjectIds" IS NULL) AS value`;
  const migrations = await transaction.$queryRaw<Array<{ migrationName: string; checksum: string; finishedAt: Date | null; rolledBackAt: Date | null }>>`
    SELECT migration_name AS "migrationName", checksum, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
    FROM "_prisma_migrations" WHERE migration_name = ${CLEANUP_MIGRATION} ORDER BY started_at DESC LIMIT 1`;
  return { mode, catalog: {
    memberTable: hasMember, legacyOwnerColumn: hasLegacyOwner,
    ownerUserNullable: nullability.find((row) => row.columnName === "ownerUserId")?.nullable !== "NO",
    repoOwnerNullable: nullability.find((row) => row.columnName === "repoOwner")?.nullable !== "NO",
    eventArraysNullable: eventArrayNullability.some((row) => row.nullable !== "NO") || eventArrayNullability.length !== 3,
    ownerDeleteRule: rules[0]?.deleteRule ?? null, ownerUpdateRule: rules[0]?.updateRule ?? null,
    availabilityIndex: availabilityIndex[0]?.value === true, eventVersionUnique: eventVersionUnique[0]?.value === true,
  }, projects, users, members, latestEvents, eventArraysContainNull: eventArrayNulls[0]?.value === true, migration: migrations[0] ?? null };
}

export async function preservedDataFingerprintIn(transaction: Prisma.TransactionClient): Promise<string> {
  const identities: Array<[string, unknown]> = [];
  for (const table of PRESERVED_TABLES) {
    const expression = table === "Project" ? `to_jsonb(t) - 'owner'` : "to_jsonb(t)";
    const rows = await transaction.$queryRawUnsafe<Array<{ data: unknown }>>(
      `SELECT COALESCE(jsonb_agg(${expression} ORDER BY (${expression})::text), '[]'::jsonb) AS data FROM "${table}" t`,
    );
    identities.push([table, rows[0]?.data ?? []]);
  }
  return createHash("sha256").update(JSON.stringify(identities)).digest("hex");
}

export async function inspectOwnershipCleanup(client: TransactionHost, mode: CleanupMode): Promise<CleanupReport> {
  const { facts, preservedDataFingerprint } = await client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    return { facts: await readCleanupFactsIn(transaction, mode), preservedDataFingerprint: await preservedDataFingerprintIn(transaction) };
  }, CLEANUP_READ_OPTIONS);
  const issues = validateCleanupFacts(facts);
  return { ok: issues.length === 0, mode, asOf: new Date().toISOString(), schemaFingerprint: catalogFingerprint(facts.catalog), preservedDataFingerprint, issues, migration: facts.migration };
}
