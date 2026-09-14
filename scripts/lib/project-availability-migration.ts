import { availabilityBasis } from "../../packages/core/entitlement.mjs";
import { setTimeout as delay } from "node:timers/promises";
import { DEFAULT_PLAN, availableProjectIds, isPlan, limitsFor } from "../../packages/core/entitlement.mjs";
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client";

export type PlanId = "free" | "pro" | "max";
export type BackfillMode = "dry-run" | "check" | "apply";

type OwnershipRowInput = {
  users: readonly { id: string }[];
  projects: readonly { id: string }[];
  members: readonly { projectId: string; userId: string; role: string }[];
};

export type OwnershipIssue = {
  code: "owner-count" | "non-owner-member" | "orphan-project" | "orphan-user";
  projectId: string;
  userId?: string;
  count?: number;
};

export type OwnershipReport = {
  ok: boolean;
  userIds: string[];
  issues: OwnershipIssue[];
};

type OwnerProjectSnapshot = {
  id: string;
  owner: string;
  ownerUserId: string | null;
  repoOwner: string | null;
  available: boolean;
  lastSelectedAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  lastAgentActivityAt: Date | null;
};

type MigrationEventSnapshot = {
  version: number;
  actor: string;
  reason: string;
  fromPlan: string | null;
  toPlan: string | null;
  addedProjectIds: string[];
  removedProjectIds: string[];
  availableProjectIds: string[];
  basis: string | null;
};

export type OwnerSnapshot = {
  userId: string;
  version: number;
  rawPlan: string | null;
  projects: OwnerProjectSnapshot[];
  latestMigrationEvent: MigrationEventSnapshot | null;
  lifecycleStarted: boolean;
};

export type OwnerBackfillPlan = {
  userId: string;
  normalizedPlan: PlanId;
  warnings: string[];
  desiredProjectIds: string[];
  actualProjectIds: string[];
  addedProjectIds: string[];
  removedProjectIds: string[];
  basis: string | null;
  changed: boolean;
  nextVersion: number | null;
};

export type BackfillReport = {
  mode: BackfillMode;
  asOf: string;
  ownership: OwnershipReport;
  owners: OwnerBackfillPlan[];
  completedUserIds: string[];
  failedUserId: string | null;
  failureCode: string | null;
  unprocessedUserIds: string[];
  drift: boolean;
};

export class MigrationIntegrityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MigrationIntegrityError";
  }
}

class RetryableCasError extends Error {
  constructor() {
    super("project availability version changed");
    this.name = "RetryableCasError";
  }
}

const READ_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 5_000,
  timeout: 30_000,
} as const;

const WRITE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 30_000,
} as const;

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedIds(values: Iterable<string>): string[] {
  return [...values].sort(compareId);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizePlan(value: string | null): { plan: PlanId; warnings: string[] } {
  if (value === "free" || value === "pro" || value === "max") {
    if (!isPlan(value)) throw new Error(`core entitlement rejected known plan: ${value}`);
    return { plan: value, warnings: [] };
  }
  return {
    plan: DEFAULT_PLAN,
    warnings: value === null ? [] : ["invalid-plan"],
  };
}

function firstBasis(projects: readonly OwnerProjectSnapshot[], desired: ReadonlySet<string>, overCap: boolean): string | null {
  return availabilityBasis([...projects], desired, overCap);
}

export function checkOwnershipRows(input: OwnershipRowInput): OwnershipReport {
  const users = new Set(input.users.map((user) => user.id));
  const projects = new Set(input.projects.map((project) => project.id));
  const issues: OwnershipIssue[] = [];

  for (const member of input.members) {
    if (!projects.has(member.projectId)) issues.push({ code: "orphan-project", projectId: member.projectId, userId: member.userId });
    if (!users.has(member.userId)) issues.push({ code: "orphan-user", projectId: member.projectId, userId: member.userId });
    if (member.role !== "owner") issues.push({ code: "non-owner-member", projectId: member.projectId, userId: member.userId });
  }

  for (const project of input.projects) {
    const owners = input.members.filter((member) => member.projectId === project.id && member.role === "owner");
    if (owners.length !== 1) issues.push({ code: "owner-count", projectId: project.id, count: owners.length });
  }

  issues.sort((left, right) => compareId(left.projectId, right.projectId) || compareId(left.code, right.code));
  return { ok: issues.length === 0, userIds: sortedIds(users), issues };
}

export async function checkOwnership(
  prisma: PrismaClient,
  afterProjectsRead: () => Promise<void> = async () => undefined,
): Promise<OwnershipReport> {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    const users = await transaction.user.findMany({ select: { id: true } });
    const projects = await transaction.project.findMany({ select: { id: true } });
    await afterProjectsRead();
    const members = await transaction.projectMember.findMany({ select: { projectId: true, userId: true, role: true } });
    return checkOwnershipRows({ users, projects, members });
  }, READ_TRANSACTION_OPTIONS);
}

export async function readOwnerSnapshot(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<OwnerSnapshot> {
  const [user, subscription, ownerships, latestMigrationEvent, incompatibleEvent] = await Promise.all([
    transaction.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, projectAvailabilityVersion: true } }),
    transaction.subscription.findUnique({ where: { userId }, select: { plan: true } }),
    transaction.projectMember.findMany({
      where: { userId, role: "owner" },
      select: {
        project: {
          select: {
            id: true,
            owner: true,
            ownerUserId: true,
            repoOwner: true,
            available: true,
            lastSelectedAt: true,
            lastSyncedAt: true,
            createdAt: true,
          },
        },
      },
    }),
    transaction.projectAvailabilityEvent.findFirst({
      where: { ownerUserId: userId, reason: "migration-backfill" },
      orderBy: { version: "desc" },
      select: {
        version: true,
        actor: true,
        reason: true,
        fromPlan: true,
        toPlan: true,
        addedProjectIds: true,
        removedProjectIds: true,
        availableProjectIds: true,
        basis: true,
      },
    }),
    transaction.projectAvailabilityEvent.findFirst({
      where: { ownerUserId: userId, OR: [{ actor: { not: "system" } }, { reason: { not: "migration-backfill" } }] },
      select: { id: true },
    }),
  ]);

  const projectIds = ownerships.map((ownership) => ownership.project.id);
  const [members, runs] = projectIds.length === 0
    ? [[], []]
    : await Promise.all([
        transaction.projectMember.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, userId: true, role: true },
        }),
        transaction.agentRun.findMany({
          where: { projectId: { in: projectIds } },
          select: { projectId: true, openedAt: true, steps: { select: { at: true } } },
        }),
      ]);

  for (const projectId of projectIds) {
    const projectMembers = members.filter((member) => member.projectId === projectId);
    const owners = projectMembers.filter((member) => member.role === "owner");
    if (owners.length !== 1 || owners[0]?.userId !== userId || projectMembers.length !== 1) {
      throw new MigrationIntegrityError("ownership-changed", `ownership changed for project ${projectId}`);
    }
  }

  const activityByProject = new Map<string, Date>();
  for (const run of runs) {
    const times = [run.openedAt, ...run.steps.map((step) => step.at)];
    const latest = new Date(Math.max(...times.map((value) => value.getTime())));
    const existing = activityByProject.get(run.projectId);
    if (!existing || latest > existing) activityByProject.set(run.projectId, latest);
  }

  return {
    userId: user.id,
    version: user.projectAvailabilityVersion,
    rawPlan: subscription?.plan ?? null,
    projects: ownerships.map(({ project }) => ({
      ...project,
      lastAgentActivityAt: activityByProject.get(project.id) ?? null,
    })),
    latestMigrationEvent,
    lifecycleStarted: incompatibleEvent !== null
      || ownerships.some(({ project }) => project.lastSelectedAt !== null || project.lastSyncedAt !== null),
  };
}

export function planOwnerBackfill(snapshot: OwnerSnapshot): OwnerBackfillPlan {
  if (snapshot.lifecycleStarted) {
    throw new MigrationIntegrityError("lifecycle-started", `availability lifecycle already started for user ${snapshot.userId}`);
  }
  if (snapshot.projects.length === 0 && snapshot.latestMigrationEvent !== null) {
    throw new MigrationIntegrityError("owned-projects-disappeared", `migrated user ${snapshot.userId} has no owned projects`);
  }

  for (const project of snapshot.projects) {
    if (project.ownerUserId !== null && project.ownerUserId !== snapshot.userId) {
      throw new MigrationIntegrityError("owner-shadow-conflict", `ownerUserId conflicts for project ${project.id}`);
    }
    if (project.repoOwner !== null && project.repoOwner !== project.owner) {
      throw new MigrationIntegrityError("repo-owner-shadow-conflict", `repoOwner conflicts for project ${project.id}`);
    }
  }

  const { plan, warnings } = normalizePlan(snapshot.rawPlan);
  const limit = limitsFor(plan).projects;
  const desired = new Set<string>(availableProjectIds(snapshot.projects, limit));
  const desiredProjectIds = sortedIds(desired);
  const actualProjectIds = sortedIds(snapshot.projects.filter((project) => project.available).map((project) => project.id));
  const actual = new Set(actualProjectIds);
  const addedProjectIds = desiredProjectIds.filter((projectId) => !actual.has(projectId));
  const removedProjectIds = actualProjectIds.filter((projectId) => !desired.has(projectId));
  const overCap = snapshot.projects.length > limit;
  const basis = firstBasis(snapshot.projects, desired, overCap);
  const latest = snapshot.latestMigrationEvent;
  const mappingChanged = snapshot.projects.some((project) => project.ownerUserId === null || project.repoOwner === null);
  const eventChanged = snapshot.projects.length > 0 && (
    latest === null
    || latest.version !== snapshot.version
    || latest.actor !== "system"
    || latest.toPlan !== plan
    || latest.basis !== basis
    || !sameIds(sortedIds(latest.availableProjectIds), desiredProjectIds)
  );
  const changed = mappingChanged || addedProjectIds.length > 0 || removedProjectIds.length > 0 || eventChanged;

  return {
    userId: snapshot.userId,
    normalizedPlan: plan,
    warnings,
    desiredProjectIds,
    actualProjectIds,
    addedProjectIds,
    removedProjectIds,
    basis,
    changed,
    nextVersion: changed ? snapshot.version + 1 : null,
  };
}

async function readOnlyOwnerPlan(prisma: PrismaClient, userId: string): Promise<OwnerBackfillPlan> {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
    return planOwnerBackfill(await readOwnerSnapshot(transaction, userId));
  }, READ_TRANSACTION_OPTIONS);
}

function retryable(error: unknown): boolean {
  return error instanceof RetryableCasError
    || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
}

export async function retrySerializable<T>(
  operation: () => Promise<T>,
  cancelled: () => boolean = () => false,
): Promise<T> {
  const waits = [0, 100, 200];
  let lastError: unknown;
  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    if (waits[attempt] > 0) await delay(waits[attempt]);
    if (cancelled()) throw new Error("migration cancelled");
    try {
      return await operation();
    } catch (error) {
      if (!retryable(error) || attempt === waits.length - 1) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("serializable transaction retry exhausted");
}

async function applyOwner(prisma: PrismaClient, userId: string, cancelled: () => boolean): Promise<OwnerBackfillPlan> {
  return retrySerializable(() => prisma.$transaction(async (transaction) => {
    if (cancelled()) throw new Error("migration cancelled");
    const snapshot = await readOwnerSnapshot(transaction, userId);
    if (cancelled()) throw new Error("migration cancelled");
    const plan = planOwnerBackfill(snapshot);
    if (!plan.changed) {
      if (cancelled()) throw new Error("migration cancelled");
      return plan;
    }

    const desired = new Set(plan.desiredProjectIds);
    for (const project of snapshot.projects) {
      if (cancelled()) throw new Error("migration cancelled");
      await transaction.project.update({
        where: { id: project.id },
        data: {
          ownerUserId: userId,
          repoOwner: project.owner,
          available: desired.has(project.id),
        },
      });
    }

    const version = plan.nextVersion;
    if (version === null) throw new Error("changed backfill plan has no next version");
    if (cancelled()) throw new Error("migration cancelled");
    const updated = await transaction.user.updateMany({
      where: { id: userId, projectAvailabilityVersion: snapshot.version },
      data: { projectAvailabilityVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new RetryableCasError();
    if (cancelled()) throw new Error("migration cancelled");

    await transaction.projectAvailabilityEvent.create({
      data: {
        ownerUserId: userId,
        version,
        actor: "system",
        reason: "migration-backfill",
        fromPlan: snapshot.latestMigrationEvent?.toPlan ?? plan.normalizedPlan,
        toPlan: plan.normalizedPlan,
        addedProjectIds: plan.addedProjectIds,
        removedProjectIds: plan.removedProjectIds,
        availableProjectIds: plan.desiredProjectIds,
        basis: plan.basis,
      },
    });
    if (cancelled()) throw new Error("migration cancelled");
    return plan;
  }, WRITE_TRANSACTION_OPTIONS), cancelled);
}

export async function runProjectAvailabilityBackfill(
  prisma: PrismaClient,
  mode: BackfillMode,
  cancelled: () => boolean = () => false,
): Promise<BackfillReport> {
  const asOf = new Date().toISOString();
  const ownership = await checkOwnership(prisma);
  if (!ownership.ok) {
    return {
      mode,
      asOf,
      ownership,
      owners: [],
      completedUserIds: [],
      failedUserId: null,
      failureCode: null,
      unprocessedUserIds: ownership.userIds,
      drift: true,
    };
  }

  const owners: OwnerBackfillPlan[] = [];
  const completedUserIds: string[] = [];
  let failedUserId: string | null = null;
  let failureCode: string | null = null;

  for (const userId of ownership.userIds) {
    if (cancelled()) {
      failedUserId = userId;
      failureCode = "migration-cancelled";
      break;
    }
    try {
      const owner = mode === "apply"
        ? await applyOwner(prisma, userId, cancelled)
        : await readOnlyOwnerPlan(prisma, userId);
      owners.push(owner);
      completedUserIds.push(userId);
    } catch (error) {
      failedUserId = userId;
      failureCode = cancelled()
        ? "migration-cancelled"
        : error instanceof MigrationIntegrityError ? error.code : "backfill-failed";
      break;
    }
  }

  const unprocessedUserIds = failedUserId === null
    ? []
    : ownership.userIds.slice(ownership.userIds.indexOf(failedUserId) + 1);
  return {
    mode,
    asOf,
    ownership,
    owners,
    completedUserIds,
    failedUserId,
    failureCode,
    unprocessedUserIds,
    drift: failedUserId !== null || owners.some((owner) => owner.changed),
  };
}

export function parseBackfillMode(args: readonly string[]): BackfillMode | "help" {
  if (args.length === 0) return "dry-run";
  if (args.length === 1 && args[0] === "--check") return "check";
  if (args.length === 1 && args[0] === "--apply") return "apply";
  if (args.length === 1 && args[0] === "--help") return "help";
  throw new MigrationIntegrityError("invalid-arguments", "use no arguments, --check, --apply, or --help");
}
