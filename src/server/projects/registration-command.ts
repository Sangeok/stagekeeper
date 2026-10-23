import { capError } from "@harness/core/plans/entitlement.mjs";
import type { Prisma } from "@/generated/prisma/client";
import { appendAvailabilityEventIn, findOwnedRepository, lockProjectOwnerIn, readOwnerAvailabilityIn, type OwnerAvailability } from "./availability-service";
import { DISCONNECTED_REASON, ProjectIntegrityError } from "./access-query";
import { availableSlug, slugCandidate } from "./slug-rule";

export type RegisterProjectInput = {
  userId: string;
  slug?: string;
  name?: string;
  owner: string;
  repo: string;
  branch: string;
  initialTokenHash?: string;
};

export type RegisterProjectResult =
  | { status: "created"; projectId: string; slug: string }
  | { status: "existing"; projectId: string; slug: string }
  | { status: "disconnected"; slug: string; reason: string }
  | { status: "integrity"; reason: string }
  | { status: "capped"; reason: string };

export async function registerProjectResultIn(
  transaction: Prisma.TransactionClient,
  input: RegisterProjectInput,
): Promise<RegisterProjectResult> {
  await lockProjectOwnerIn(transaction, input.userId);
  let owner: OwnerAvailability;
  try {
    owner = await readOwnerAvailabilityIn(transaction, input.userId);
    const existing = findOwnedRepository(owner.projects, input.owner, input.repo);
    if (existing) return existing.disconnectedAt != null
      ? { status: "disconnected", slug: existing.slug, reason: DISCONNECTED_REASON }
      : { status: "existing", projectId: existing.id, slug: existing.slug };
  } catch (error) {
    if (error instanceof ProjectIntegrityError) return { status: "integrity", reason: error.message };
    throw error;
  }

  const capMessage = capError(owner.plan, "projects", owner.projects.filter((p) => p.disconnectedAt == null).length);
  if (capMessage) return { status: "capped", reason: capMessage };

  let slug = input.slug;
  if (slug === undefined) {
    const base = slugCandidate(input.repo) ?? "project";
    const rows = await transaction.project.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
    slug = availableSlug(input.repo, new Set(rows.map((r) => r.slug)));
  }

  const project = await transaction.project.create({
    select: { id: true },
    data: {
      slug,
      name: input.name ?? slug,
      repoOwner: input.owner,
      repo: input.repo,
      branch: input.branch,
      available: true,
      lastSelectedAt: null,
      lastSyncedAt: null,
      ownerUser: { connect: { id: input.userId } },
      ...(input.initialTokenHash === undefined
        ? {}
        : { tokens: { create: { hash: input.initialTokenHash, label: "initial", usageTrackingStartedAt: new Date() } } }),
    },
  });
  await appendAvailabilityEventIn(transaction, { owner, change: {
    actor: "user", reason: "registration", toPlan: owner.plan, basis: "recent-registration",
    addedProjectIds: [project.id], removedProjectIds: [],
    availableProjectIds: [...owner.projects.filter((p) => p.available).map((p) => p.id), project.id],
  } });
  return { status: "created", projectId: project.id, slug };
}
