import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { registerProjectResultIn, type RegisterProjectInput } from "./registration-command";

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
  transaction: Parameters<typeof registerProjectResultIn>[0];
} {
  const calls: Prisma.ProjectCreateArgs[] = [];
  return {
    calls,
    transaction: {
      $queryRaw: async () => [],
      user: { findUniqueOrThrow: async () => ({ login: "test", projectAvailabilityVersion: 0, subscription: null }), updateMany: async () => ({ count: 1 }) },
      projectAvailabilityEvent: { create: async () => ({}) },
      project: {
        findMany: async () => Array.from({ length: owned }, (_, i) => ({ id: `old-${i}`, ownerUserId: input.userId, repoOwner: "octocat", repo: `old-${i}`, available: true })),
        create: async (args: Prisma.ProjectCreateArgs) => {
          calls.push(args);
          return { id: "new-project" };
        },
      },
    } as unknown as Prisma.TransactionClient,
  };
}

describe("registerProjectResultIn", () => {
  it("writes direct ownership, availability, and the initial token without legacy shadows", async () => {
    const { calls, transaction } = transactionWithOwnedCount(0);

    const result = await registerProjectResultIn(transaction, input);

    assert.deepEqual(result, { status: "created", projectId: "new-project", slug: "stagekeeper" });
    assert.equal(calls.length, 1);
    const initial = calls[0]?.data.tokens?.create;
    assert.ok(initial && !Array.isArray(initial));
    assert.ok(initial.usageTrackingStartedAt instanceof Date);
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
      tokens: { create: { hash: "hash", label: "initial", usageTrackingStartedAt: initial.usageTrackingStartedAt } },
    });
  });

  it("returns the existing cap message without creating a project", async () => {
    const { calls, transaction } = transactionWithOwnedCount(1);

    const result = await registerProjectResultIn(transaction, input);

    assert.ok(result.status === "capped");
    assert.match(result.reason, /project cap reached on the free plan/);
    assert.equal(calls.length, 0);
  });
});

describe("registerProjectResultIn — agent registration", () => {
  const owned = (rows: { slug: string; repo: string; repoOwner?: string; disconnectedAt?: Date }[]) => {
    const calls: { creates: Prisma.ProjectCreateArgs[]; slugQueries: unknown[] } = { creates: [], slugQueries: [] };
    const transaction = {
      $queryRaw: async () => [],
      user: { findUniqueOrThrow: async () => ({ login: "test", projectAvailabilityVersion: 0, subscription: { plan: "max" } }), updateMany: async () => ({ count: 1 }) },
      projectAvailabilityEvent: { create: async () => ({}) },
      project: {
        findMany: async (args: { where?: { slug?: unknown } }) => {
          if (args?.where?.slug !== undefined) {
            calls.slugQueries.push(args.where.slug);
            return rows.map((r) => ({ slug: r.slug }));
          }
          return rows.map((r, i) => ({ id: `p-${i}`, slug: r.slug, ownerUserId: "user-1", repoOwner: r.repoOwner ?? "octocat", repo: r.repo, available: !r.disconnectedAt, disconnectedAt: r.disconnectedAt ?? null }));
        },
        create: async (args: Prisma.ProjectCreateArgs) => { calls.creates.push(args); return { id: "new-project" }; },
      },
    } as unknown as Prisma.TransactionClient;
    return { calls, transaction };
  };

  const agentInput = { userId: "user-1", owner: "octocat", repo: "stagekeeper", branch: "main" };

  it("returns case-insensitive disconnected and duplicate identities before slug lookup or writes", async () => {
    const { calls, transaction } = owned([{ slug: "actual-slug", repoOwner: "OctoCat", repo: "StageKeeper", disconnectedAt: new Date() }]);
    assert.deepEqual(await registerProjectResultIn(transaction, agentInput), { status: "disconnected", slug: "actual-slug", reason: "This repository is disconnected. Open Stagekeeper → Projects and choose Reconnect repository." });
    assert.equal(calls.creates.length, 0); assert.equal(calls.slugQueries.length, 0);
    const duplicate = owned([{ slug: "one", repo: "stagekeeper" }, { slug: "two", repo: "StageKeeper" }]);
    assert.deepEqual(await registerProjectResultIn(duplicate.transaction, agentInput), { status: "integrity", reason: "Project ownership is unavailable." });
    assert.equal(duplicate.calls.creates.length, 0); assert.equal(duplicate.calls.slugQueries.length, 0);
  });

  it("(g) returns the existing project for the same (owner, repo) and creates nothing", async () => {
    const { calls, transaction } = owned([{ slug: "stagekeeper", repo: "stagekeeper" }]);

    const result = await registerProjectResultIn(transaction, agentInput);

    assert.deepEqual(result, { status: "existing", projectId: "p-0", slug: "stagekeeper" });
    assert.equal(calls.creates.length, 0, "must not create on re-registration");
    assert.equal(calls.slugQueries.length, 0, "must not even look for a free slug");
  });

  it("creates with a slug derived from the repo when the user has nothing yet", async () => {
    const { calls, transaction } = owned([]);

    const result = await registerProjectResultIn(transaction, agentInput);

    assert.deepEqual(result, { status: "created", projectId: "new-project", slug: "stagekeeper" });
    assert.equal(calls.creates[0]?.data.slug, "stagekeeper");
    assert.equal(calls.creates[0]?.data.name, "stagekeeper", "name falls back to the slug");
  });

  it("(j) suffixes the slug when a different repository already holds the name", async () => {
    const { calls, transaction } = owned([{ slug: "stagekeeper", repo: "other-repo" }]);

    const result = await registerProjectResultIn(transaction, agentInput);

    assert.equal(result.status, "created");
    assert.equal(result.status === "created" && result.slug, "stagekeeper-2");
    assert.deepEqual(calls.slugQueries, [{ startsWith: "stagekeeper" }]);
  });

  it("omits the token relation entirely when no initialTokenHash is given", async () => {
    const { calls, transaction } = owned([]);

    await registerProjectResultIn(transaction, agentInput);

    assert.equal("tokens" in (calls.creates[0]?.data ?? {}), false);
  });
});
