import { capError } from "@harness/core/entitlement.mjs";
import type { Prisma } from "@/generated/prisma/client";
import { appendAvailabilityEventIn, readOwnerAvailabilityIn } from "./project-availability-service";

export type RegisterProjectInput = {
  userId: string;
  slug: string;
  name: string;
  owner: string;
  repo: string;
  branch: string;
  initialTokenHash: string;
};

export async function registerProjectIn(
  transaction: Prisma.TransactionClient,
  input: RegisterProjectInput,
): Promise<string | null> {
  const owner = await readOwnerAvailabilityIn(transaction, input.userId);
  const capMessage = capError(owner.plan, "projects", owner.projects.length);
  if (capMessage) return capMessage;

  const project = await transaction.project.create({
    select: { id: true },
    data: {
      slug: input.slug,
      name: input.name,
      owner: input.owner,
      repoOwner: input.owner,
      repo: input.repo,
      branch: input.branch,
      available: true,
      lastSelectedAt: null,
      lastSyncedAt: null,
      ownerUser: { connect: { id: input.userId } },
      members: { create: { userId: input.userId, role: "owner" } },
      tokens: { create: { hash: input.initialTokenHash, label: "initial" } },
    },
  });
  await appendAvailabilityEventIn(transaction, { owner, change: {
    actor: "user", reason: "registration", toPlan: owner.plan, basis: "recent-registration",
    addedProjectIds: [project.id], removedProjectIds: [],
    availableProjectIds: [...owner.projects.filter((p) => p.available).map((p) => p.id), project.id],
  } });
  return null;
}
