import { availabilityAfterPlanChange, isPlan, limitsFor } from "@harness/core/entitlement.mjs";
import { isOpen } from "@harness/core/transitions.mjs";
import type { Prisma } from "@/generated/prisma/client";
import { normalizePlan, ProjectIntegrityError, READ_OPTIONS, repositoryOwner, type Plan, type TransactionHost } from "./project-access-query";

export const WRITE_OPTIONS = { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 } as const;
export class AvailabilityConflict extends Error {
  constructor() { super("The project list is busy. Refresh and try again."); this.name = "AvailabilityConflict"; }
}
export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Prisma's PostgreSQL adapter reports conflicts from FOR UPDATE as P2010,
// while delegate writes use P2034. Retry only the two transaction SQL states.
function isRawTransactionConflict(error: unknown): boolean {
  if (!isRecord(error) || error.code !== "P2010" || !isRecord(error.meta)) return false;
  const adapter = error.meta.driverAdapterError;
  const cause = isRecord(adapter) ? adapter.cause : undefined;
  const sqlState = isRecord(cause) ? cause.originalCode : error.meta.code;
  return sqlState === "40001" || sqlState === "40P01";
}

export async function withAvailabilityTransaction<T>(
  client: TransactionHost,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await client.$transaction(run, WRITE_OPTIONS); }
    catch (error) {
      if (!(error instanceof AvailabilityConflict) && !hasErrorCode(error, "P2034") && !isRawTransactionConflict(error)) throw error;
      if (attempt === 2) throw new AvailabilityConflict();
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

export const OWNED_PROJECT_SELECT = {
  id: true, slug: true, name: true, repoOwner: true, repo: true, branch: true, ownerUserId: true,
  available: true, disconnectedAt: true, lastSelectedAt: true, lastSyncedAt: true, createdAt: true,
} as const satisfies Prisma.ProjectSelect;
export type OwnedProject = Prisma.ProjectGetPayload<{ select: typeof OWNED_PROJECT_SELECT }>;
export type OwnerAvailability = {
  userId: string; login: string; version: number; plan: Plan; projects: OwnedProject[];
};

export async function readOwnerAvailabilityIn(tx: Prisma.TransactionClient, userId: string): Promise<OwnerAvailability> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId }, select: { login: true, projectAvailabilityVersion: true, subscription: { select: { plan: true } } },
  });
  const projects = await tx.project.findMany({ where: { ownerUserId: userId }, select: OWNED_PROJECT_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const plan = normalizePlan(user.subscription?.plan);
  const count = projects.filter((p) => p.available).length;
  if (projects.some((p) => p.ownerUserId !== userId || p.repoOwner === null || (p.disconnectedAt != null && p.available)) || count > limitsFor(plan).projects) {
    throw new ProjectIntegrityError();
  }
  return { userId, login: user.login, version: user.projectAvailabilityVersion, plan, projects };
}

// Writers share this lock. Read-only snapshots must never acquire it.
export async function lockProjectOwnerIn(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

export function findOwnedRepository(projects: readonly OwnedProject[], owner: string, repo: string): OwnedProject | undefined {
  const matches = projects.filter((p) => p.repoOwner.toLowerCase() === owner.toLowerCase() && p.repo.toLowerCase() === repo.toLowerCase());
  if (matches.length > 1) throw new ProjectIntegrityError();
  return matches[0];
}

type AvailabilityChange = {
  actor: "user" | "system";
  reason: "registration" | "use-project" | "plan-downgrade" | "disconnect-project" | "reconnect-project";
  targetProjectId?: string;
  toPlan: Plan;
  addedProjectIds: string[]; removedProjectIds: string[]; availableProjectIds: string[];
  basis: string | null;
};
export async function appendAvailabilityEventIn(
  tx: Prisma.TransactionClient,
  input: { owner: OwnerAvailability; change: AvailabilityChange },
): Promise<number> {
  const { owner, change } = input;
  const updated = await tx.user.updateMany({
    where: { id: owner.userId, projectAvailabilityVersion: owner.version },
    data: { projectAvailabilityVersion: { increment: 1 } },
  });
  if (updated.count !== 1) throw new AvailabilityConflict();
  const version = owner.version + 1;
  await tx.projectAvailabilityEvent.create({ data: {
    ownerUserId: owner.userId, version, actor: change.actor, reason: change.reason,
    fromPlan: owner.plan, toPlan: change.toPlan, basis: change.basis,
    targetProjectId: change.targetProjectId,
    addedProjectIds: [...change.addedProjectIds].sort(), removedProjectIds: [...change.removedProjectIds].sort(),
    availableProjectIds: [...change.availableProjectIds].sort(),
  } });
  return version;
}

export async function changeUserPlan(
  client: TransactionHost,
  input: { userId: string; plan: string; note?: string | null },
): Promise<{ plan: Plan; version: number; availableProjectIds: string[] }> {
  if (!isPlan(input.plan)) throw new Error("Invalid plan.");
  const toPlan = normalizePlan(input.plan);
  return withAvailabilityTransaction(client, async (tx) => {
    await lockProjectOwnerIn(tx, input.userId);
    const owner = await readOwnerAvailabilityIn(tx, input.userId);
    const current = owner.projects.filter((p) => p.available);
    const runs = await tx.agentRun.findMany({
      where: { projectId: { in: current.map((p) => p.id) } },
      select: { projectId: true, openedAt: true, steps: { select: { at: true } } },
    });
    const activity = new Map<string, Date>();
    for (const run of runs) {
      let latest = run.openedAt;
      for (const step of run.steps) if (step.at > latest) latest = step.at;
      const before = activity.get(run.projectId);
      if (!before || latest > before) activity.set(run.projectId, latest);
    }
    const decision = availabilityAfterPlanChange({
      fromPlan: owner.plan, toPlan, currentIds: current.map((p) => p.id),
      candidates: current.map((p) => ({ ...p, lastAgentActivityAt: activity.get(p.id) ?? null })),
    });
    await tx.subscription.upsert({
      where: { userId: owner.userId },
      create: { userId: owner.userId, plan: toPlan, source: "manual", note: input.note ?? null },
      update: { plan: toPlan, source: "manual", note: input.note ?? null },
    });
    let version = owner.version;
    if (decision.changed) {
      await tx.project.updateMany({ where: { ownerUserId: owner.userId, id: { in: decision.removedProjectIds } }, data: { available: false } });
      version = await appendAvailabilityEventIn(tx, { owner, change: { ...decision, actor: "system", reason: "plan-downgrade", toPlan } });
    }
    return { plan: toPlan, version, availableProjectIds: decision.availableProjectIds };
  });
}

export type SelectProjectInput = { userId: string; targetProjectId: string; replacementProjectId?: string; expectedVersion: number };
export type SelectProjectResult =
  | { status: "success"; version: number; availableProjectIds: string[]; changed: boolean }
  | { status: "stale"; currentVersion: number }
  | { status: "error"; code: "invalid-input" | "invalid-replacement" | "not-found" | "integrity" | "conflict"; reason: string };

export async function selectProjectForUse(client: TransactionHost, input: SelectProjectInput): Promise<SelectProjectResult> {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
    || typeof input.userId !== "string" || !input.userId || typeof input.targetProjectId !== "string" || !input.targetProjectId
    || (input.replacementProjectId !== undefined && (typeof input.replacementProjectId !== "string" || !input.replacementProjectId))) {
    return { status: "error", code: "invalid-input", reason: "Invalid project selection." };
  }
  try {
    return await withAvailabilityTransaction(client, async (tx): Promise<SelectProjectResult> => {
      await lockProjectOwnerIn(tx, input.userId);
      const owner = await readOwnerAvailabilityIn(tx, input.userId);
      const target = owner.projects.find((p) => p.id === input.targetProjectId);
      const replacement = owner.projects.find((p) => p.id === input.replacementProjectId);
      if (!target || (input.replacementProjectId !== undefined && !replacement)) return { status: "error", code: "not-found", reason: "Project not found." };
      if (owner.version !== input.expectedVersion) return { status: "stale", currentVersion: owner.version };
      if (target.disconnectedAt != null || replacement?.disconnectedAt != null) return { status: "error", code: "invalid-input", reason: "Reconnect the repository in Projects before selecting it for use." };
      const current = owner.projects.filter((p) => p.available).map((p) => p.id);
      if (target.available) return { status: "success", version: owner.version, availableProjectIds: current.sort(), changed: false };
      const full = current.length >= limitsFor(owner.plan).projects;
      if (full && (!replacement?.available || replacement.id === target.id)) {
        return owner.plan === "free" ? { status: "stale", currentVersion: owner.version }
          : { status: "error", code: "invalid-replacement", reason: "Choose a project currently available for replacement." };
      }
      const removed = full && replacement ? [replacement.id] : [];
      const availableProjectIds = [...current.filter((id) => !removed.includes(id)), target.id].sort();
      await tx.project.update({ where: { id: target.id }, data: { available: true, lastSelectedAt: new Date() } });
      if (removed.length) await tx.project.updateMany({ where: { ownerUserId: owner.userId, id: { in: removed } }, data: { available: false } });
      const version = await appendAvailabilityEventIn(tx, { owner, change: {
        actor: "user", reason: "use-project", toPlan: owner.plan, addedProjectIds: [target.id], removedProjectIds: removed,
        availableProjectIds, basis: "user-selection",
      } });
      return { status: "success", version, availableProjectIds, changed: true };
    });
  } catch (error) {
    if (error instanceof ProjectIntegrityError) return { status: "error", code: "integrity", reason: error.message };
    if (error instanceof AvailabilityConflict) return { status: "error", code: "conflict", reason: error.message };
    throw error;
  }
}

export type ProjectAvailabilityView = {
  userId: string; login: string; plan: Plan; limit: number | null; version: number; connectedCount: number; availableCount: number;
  projects: { id: string; slug: string; name: string; repoOwner: string; repo: string; branch: string; available: boolean; disconnectedAt: string | null; openItems: number; openRuns: number }[];
  notice: { basis: string | null; availableProjectIds: string[]; at: string } | null;
};
export async function loadProjectAvailability(client: TransactionHost, userId: string): Promise<ProjectAvailabilityView> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const owner = await readOwnerAvailabilityIn(tx, userId);
    const ids = owner.projects.map((p) => p.id);
    const [board, runs, event] = await Promise.all([
      tx.boardItem.findMany({ where: { projectId: { in: ids }, discardedAt: null }, orderBy: { proposedOn: "desc" }, distinct: ["backlogItemId"], select: { projectId: true, status: true } }),
      tx.agentRun.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, closedAt: null }, _count: { _all: true } }),
      tx.projectAvailabilityEvent.findFirst({ where: { ownerUserId: userId }, orderBy: { version: "desc" } }),
    ]);
    const limit = limitsFor(owner.plan).projects;
    return {
      userId, login: owner.login, plan: owner.plan, limit: Number.isFinite(limit) ? limit : null, version: owner.version,
      connectedCount: owner.projects.filter((p) => p.disconnectedAt == null).length,
      availableCount: owner.projects.filter((p) => p.available).length,
      projects: owner.projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name, repoOwner: repositoryOwner(p.repoOwner), repo: p.repo, branch: p.branch, available: p.available,
        disconnectedAt: p.disconnectedAt?.toISOString() ?? null,
        openItems: board.filter((b) => b.projectId === p.id && isOpen(b.status)).length,
        openRuns: runs.find((r) => r.projectId === p.id)?._count._all ?? 0,
      })),
      notice: event?.actor === "system" && event.reason === "plan-downgrade" && event.toPlan === owner.plan
        ? { basis: event.basis, availableProjectIds: event.availableProjectIds, at: event.at.toISOString() } : null,
    };
  }, READ_OPTIONS);
}
