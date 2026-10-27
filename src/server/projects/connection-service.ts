import { limitsFor, withinLimit } from "@harness/core/plans/entitlement.mjs";
import { ProjectIntegrityError, type Plan, type TransactionHost } from "./access-query";
import { appendAvailabilityEventIn, AvailabilityConflict, findOwnedRepository, lockProjectOwnerIn, readOwnerAvailabilityIn, withAvailabilityTransaction } from "./availability-service";

export type ProjectConnectionInput = { userId: string; targetProjectId: string; expectedVersion: number };
export type ProjectConnectionResult =
  | { status: "success"; changed: boolean; version: number }
  | { status: "stale"; currentVersion: number }
  | { status: "error"; code: "capped"; plan: Plan; limit: number }
  | { status: "error"; code: "invalid-input" | "not-found" | "integrity" | "conflict"; reason: string };

export async function disconnectProject(client: TransactionHost, input: ProjectConnectionInput): Promise<ProjectConnectionResult> {
  return changeConnection(client, input, "disconnect");
}

export async function reconnectProject(client: TransactionHost, input: ProjectConnectionInput): Promise<ProjectConnectionResult> {
  return changeConnection(client, input, "reconnect");
}

async function changeConnection(client: TransactionHost, input: ProjectConnectionInput, operation: "disconnect" | "reconnect"): Promise<ProjectConnectionResult> {
  if (!input.userId || typeof input.userId !== "string" || !input.targetProjectId || typeof input.targetProjectId !== "string"
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    return { status: "error", code: "invalid-input", reason: "Invalid repository connection request." };
  }
  try {
    return await withAvailabilityTransaction(client, async (tx): Promise<ProjectConnectionResult> => {
      await lockProjectOwnerIn(tx, input.userId);
      const owner = await readOwnerAvailabilityIn(tx, input.userId);
      const target = owner.projects.find((p) => p.id === input.targetProjectId);
      if (!target) return { status: "error", code: "not-found", reason: "Project not found." };
      if (owner.version !== input.expectedVersion) return { status: "stale", currentVersion: owner.version };
      findOwnedRepository(owner.projects, target.repoOwner, target.repo);
      const disconnected = target.disconnectedAt != null;
      if (disconnected === (operation === "disconnect")) return { status: "success", changed: false, version: owner.version };

      if (operation === "reconnect" && !withinLimit(owner.plan, "projects", owner.projects.filter((p) => p.disconnectedAt == null).length + 1)) {
        return { status: "error", code: "capped", plan: owner.plan, limit: limitsFor(owner.plan).projects };
      }
      const now = new Date();
      const available = owner.projects.filter((p) => p.available).map((p) => p.id);
      const availableProjectIds = operation === "disconnect" ? available.filter((id) => id !== target.id) : [...available, target.id];
      const removedProjectIds = operation === "disconnect" && target.available ? [target.id] : [];
      await tx.project.update({ where: { id: target.id }, data: operation === "disconnect"
        ? { disconnectedAt: now, available: false }
        : { disconnectedAt: null, available: true, lastSelectedAt: now } });
      if (operation === "disconnect") {
        await tx.projectToken.updateMany({ where: { projectId: target.id, revokedAt: null }, data: { revokedAt: now } });
        await tx.ownerToken.updateMany({ where: { projectId: target.id, revokedAt: null }, data: { revokedAt: now } });
      }
      const version = await appendAvailabilityEventIn(tx, { owner, change: {
        actor: "user", reason: operation === "disconnect" ? "disconnect-project" : "reconnect-project",
        targetProjectId: target.id, toPlan: owner.plan, basis: "explicit-repository-connection",
        addedProjectIds: operation === "reconnect" ? [target.id] : [],
        removedProjectIds, availableProjectIds,
      } });
      return { status: "success", changed: true, version };
    });
  } catch (error) {
    if (error instanceof ProjectIntegrityError) return { status: "error", code: "integrity", reason: error.message };
    if (error instanceof AvailabilityConflict) return { status: "error", code: "conflict", reason: error.message };
    throw error;
  }
}
