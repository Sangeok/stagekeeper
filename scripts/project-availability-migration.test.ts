import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import {
  checkOwnership,
  checkOwnershipRows,
  MigrationIntegrityError,
  parseBackfillMode,
  planOwnerBackfill,
  retrySerializable,
  runProjectAvailabilityBackfill,
  type OwnerSnapshot,
} from "./lib/project-availability-migration";

const date = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T00:00:00Z`);

function snapshot(overrides: Partial<OwnerSnapshot> = {}): OwnerSnapshot {
  return {
    userId: "user-1",
    version: 0,
    rawPlan: null,
    projects: [{
      id: "project-1",
      owner: "octocat",
      ownerUserId: null,
      repoOwner: null,
      available: true,
      lastSelectedAt: null,
      lastSyncedAt: null,
      createdAt: date(1),
      lastAgentActivityAt: null,
    }],
    latestMigrationEvent: null,
    lifecycleStarted: false,
    ...overrides,
  };
}

describe("checkOwnershipRows", () => {
  it("accepts exactly one owner and no other member per project", () => {
    const report = checkOwnershipRows({
      users: [{ id: "user-1" }],
      projects: [{ id: "project-1" }],
      members: [{ projectId: "project-1", userId: "user-1", role: "owner" }],
    });

    assert.deepEqual(report, { ok: true, userIds: ["user-1"], issues: [] });
  });

  it("collects owner count, non-owner, and orphan reference issues", () => {
    const report = checkOwnershipRows({
      users: [{ id: "user-1" }],
      projects: [{ id: "project-1" }],
      members: [
        { projectId: "project-1", userId: "missing-user", role: "member" },
        { projectId: "missing-project", userId: "user-1", role: "owner" },
      ],
    });

    assert.equal(report.ok, false);
    assert.deepEqual(report.issues.map((issue) => issue.code), [
      "orphan-project",
      "non-owner-member",
      "orphan-user",
      "owner-count",
    ]);
  });
});

describe("checkOwnership", () => {
  it("reads all legacy ownership rows in one read-only RepeatableRead transaction", async () => {
    const calls: string[] = [];
    const transaction = {
      $executeRaw: async () => { calls.push("read-only"); return 0; },
      user: { findMany: async () => { calls.push("users"); return [{ id: "user-1" }]; } },
      project: { findMany: async () => { calls.push("projects"); return [{ id: "project-1" }]; } },
      projectMember: {
        findMany: async () => {
          calls.push("members");
          return [{ projectId: "project-1", userId: "user-1", role: "owner" }];
        },
      },
    };
    const prisma = {
      $transaction: async (operation: (value: typeof transaction) => Promise<unknown>, options: unknown) => {
        assert.deepEqual(options, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 30_000 });
        return operation(transaction);
      },
    } as unknown as PrismaClient;

    const report = await checkOwnership(prisma, async () => { calls.push("barrier"); });

    assert.equal(report.ok, true);
    assert.deepEqual(calls, ["read-only", "users", "projects", "barrier", "members"]);
  });

  it("prevents apply transactions when the whole-database preflight fails", async () => {
    let transactionCount = 0;
    const transaction = {
      $executeRaw: async () => 0,
      user: { findMany: async () => [{ id: "user-1" }] },
      project: { findMany: async () => [{ id: "project-1" }] },
      projectMember: { findMany: async () => [] },
    };
    const prisma = {
      $transaction: async (operation: (value: typeof transaction) => Promise<unknown>) => {
        transactionCount += 1;
        return operation(transaction);
      },
    } as unknown as PrismaClient;

    const report = await runProjectAvailabilityBackfill(prisma, "apply");

    assert.equal(report.ownership.ok, false);
    assert.equal(report.owners.length, 0);
    assert.equal(transactionCount, 1);
  });
});

describe("planOwnerBackfill", () => {
  it("fills missing shadow ownership and keeps an under-cap project available", () => {
    const plan = planOwnerBackfill(snapshot());

    assert.equal(plan.normalizedPlan, "free");
    assert.deepEqual(plan.desiredProjectIds, ["project-1"]);
    assert.equal(plan.basis, null);
    assert.equal(plan.changed, true);
    assert.equal(plan.nextVersion, 1);
  });

  it("uses recent agent activity for an over-cap initial migration", () => {
    const plan = planOwnerBackfill(snapshot({
      projects: [
        { ...snapshot().projects[0]!, id: "older", createdAt: date(1), lastAgentActivityAt: date(3) },
        { ...snapshot().projects[0]!, id: "newer", createdAt: date(2), lastAgentActivityAt: null },
      ],
    }));

    assert.deepEqual(plan.desiredProjectIds, ["older"]);
    assert.deepEqual(plan.removedProjectIds, ["newer"]);
    assert.equal(plan.basis, "recent-agent-activity");
  });

  it("normalizes a missing or invalid subscription to free without echoing the raw value", () => {
    const missing = planOwnerBackfill(snapshot({ rawPlan: null }));
    const invalid = planOwnerBackfill(snapshot({ rawPlan: "private-value" }));

    assert.equal(missing.normalizedPlan, "free");
    assert.deepEqual(missing.warnings, []);
    assert.equal(invalid.normalizedPlan, "free");
    assert.deepEqual(invalid.warnings, ["invalid-plan"]);
  });

  it("does not append another event when mapping, set, plan, and event already match", () => {
    const plan = planOwnerBackfill(snapshot({
      version: 1,
      projects: [{
        ...snapshot().projects[0]!,
        ownerUserId: "user-1",
        repoOwner: "octocat",
      }],
      latestMigrationEvent: {
        version: 1,
        actor: "system",
        reason: "migration-backfill",
        fromPlan: "free",
        toPlan: "free",
        addedProjectIds: [],
        removedProjectIds: [],
        availableProjectIds: ["project-1"],
        basis: null,
      },
    }));

    assert.equal(plan.changed, false);
    assert.equal(plan.nextVersion, null);
  });

  it("stops on conflicting shadow ownership or a started D2 lifecycle", () => {
    assert.throws(
      () => planOwnerBackfill(snapshot({ projects: [{ ...snapshot().projects[0]!, ownerUserId: "user-2" }] })),
      (error) => error instanceof MigrationIntegrityError && error.code === "owner-shadow-conflict",
    );
    assert.throws(
      () => planOwnerBackfill(snapshot({ lifecycleStarted: true })),
      (error) => error instanceof MigrationIntegrityError && error.code === "lifecycle-started",
    );
  });
});

describe("retrySerializable", () => {
  it("retries P2034 twice and then succeeds", async () => {
    let attempts = 0;
    const result = await retrySerializable(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });
      }
      return "done";
    });

    assert.equal(result, "done");
    assert.equal(attempts, 3);
  });

  it("does not retry unrelated errors", async () => {
    let attempts = 0;
    await assert.rejects(() => retrySerializable(async () => {
      attempts += 1;
      throw new Error("integrity failure");
    }), /integrity failure/);
    assert.equal(attempts, 1);
  });

  it("does not open another transaction when cancellation arrives during retry backoff", async () => {
    let attempts = 0;
    let cancelled = false;
    await assert.rejects(() => retrySerializable(async () => {
      attempts += 1;
      cancelled = true;
      throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });
    }, () => cancelled), /migration cancelled/);
    assert.equal(attempts, 1);
  });
});

describe("parseBackfillMode", () => {
  it("accepts only the documented modes", () => {
    assert.equal(parseBackfillMode([]), "dry-run");
    assert.equal(parseBackfillMode(["--check"]), "check");
    assert.equal(parseBackfillMode(["--apply"]), "apply");
    assert.equal(parseBackfillMode(["--help"]), "help");
    assert.throws(() => parseBackfillMode(["--apply", "--check"]), /use no arguments/);
    assert.throws(() => parseBackfillMode(["--unknown"]), /use no arguments/);
  });
});
