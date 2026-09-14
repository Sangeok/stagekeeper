import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { registerProjectIn, type RegisterProjectInput } from "./project-registration-query";

const input: RegisterProjectInput = {
  userId: "user-1",
  slug: "stagekeeper",
  name: "Stagekeeper",
  owner: "octocat",
  repo: "stagekeeper",
  branch: "main",
  initialTokenHash: "hash",
};

function transactionWithOwnedCount(owned: number): {
  calls: Prisma.ProjectCreateArgs[];
  transaction: Parameters<typeof registerProjectIn>[0];
} {
  const calls: Prisma.ProjectCreateArgs[] = [];
  return {
    calls,
    // The double implements only operations exercised by registration, not Prisma's fluent client.
    transaction: {
      user: { findUniqueOrThrow: async () => ({ login: "test", projectAvailabilityVersion: 0, subscription: null }), updateMany: async () => ({ count: 1 }) },
      projectAvailabilityEvent: { create: async () => ({}) },
      project: {
        findMany: async () => Array.from({ length: owned }, (_, i) => ({ id: `old-${i}`, ownerUserId: input.userId, repoOwner: "octocat", available: true })),
        create: async (args: Prisma.ProjectCreateArgs) => {
          calls.push(args);
          return { id: "new-project" };
        },
      },
    } as unknown as Prisma.TransactionClient,
  };
}

describe("registerProjectIn", () => {
  it("writes direct ownership, availability, and the initial token without legacy shadows", async () => {
    const { calls, transaction } = transactionWithOwnedCount(0);

    const result = await registerProjectIn(transaction, input);

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.data, {
      slug: "stagekeeper",
      name: "Stagekeeper",
      repoOwner: "octocat",
      repo: "stagekeeper",
      branch: "main",
      available: true,
      lastSelectedAt: null,
      lastSyncedAt: null,
      ownerUser: { connect: { id: "user-1" } },
      tokens: { create: { hash: "hash", label: "initial" } },
    });
  });

  it("returns the existing cap message without creating a project", async () => {
    const { calls, transaction } = transactionWithOwnedCount(1);

    const result = await registerProjectIn(transaction, input);

    assert.match(result ?? "", /project cap reached on the free plan/);
    assert.equal(calls.length, 0);
  });
});
