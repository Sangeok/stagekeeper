import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import type { CleanupFacts } from "./lib/project-ownership-cleanup";
import { CLEANUP_MIGRATION, validateCleanupFacts } from "./lib/project-ownership-cleanup";
import { artifactMigrationDigest, isRecoveryReceipt, RECOVERY_MIGRATION } from "./lib/project-ownership-recovery";

function facts(mode: "pre" | "post"): CleanupFacts {
  const post = mode === "post";
  return {
    mode,
    catalog: {
      memberTable: !post, legacyOwnerColumn: !post, ownerUserNullable: !post, repoOwnerNullable: !post,
      eventArraysNullable: !post,
      ownerDeleteRule: post ? "CASCADE" : "SET NULL", ownerUpdateRule: "CASCADE",
      availabilityIndex: true, eventVersionUnique: true,
    },
    users: [{ id: "user", version: 1, plan: "free" }],
    projects: [{ id: "project", ownerUserId: "user", repoOwner: "repo", legacyOwner: post ? null : "repo", available: true }],
    members: post ? [] : [{ projectId: "project", userId: "user", role: "owner" }],
    latestEvents: [{ ownerUserId: "user", version: 1, availableProjectIds: ["project"] }],
    eventArraysContainNull: false,
    migration: post ? { migrationName: CLEANUP_MIGRATION, checksum: "checksum", finishedAt: new Date(), rolledBackAt: null } : null,
  };
}

describe("validateCleanupFacts", () => {
  it("accepts exact D2 pre-cleanup and D3 post-cleanup states", () => {
    assert.deepEqual(validateCleanupFacts(facts("pre")), []);
    assert.deepEqual(validateCleanupFacts(facts("post")), []);
  });
  it("collects ownership, availability, event, and catalog issues", () => {
    const input = facts("pre");
    input.projects[0] = { ...input.projects[0], ownerUserId: null, repoOwner: null, legacyOwner: "wrong", available: false };
    input.members = [{ projectId: "project", userId: "other", role: "member" }];
    input.users[0] = { ...input.users[0], version: 2 };
    input.catalog.availabilityIndex = false;
    const codes = validateCleanupFacts(input).map((issue) => issue.code);
    for (const code of ["direct-owner-null", "legacy-owner-mismatch", "orphan-member-user", "event-snapshot-mismatch", "availability-index-missing"]) assert.ok(codes.includes(code), code);
  });
  it("allows plan-only changes where the latest event plan can be older", () => {
    const input = facts("post");
    input.users[0].plan = "max";
    assert.deepEqual(validateCleanupFacts(input), []);
  });
  it("requires an event for every user that already owns a project", () => {
    const input = facts("post"); input.users[0].version = 0; input.latestEvents = [];
    assert.ok(validateCleanupFacts(input).some((issue) => issue.code === "event-missing"));
  });
  it("rejects direct owners and events that reference an unknown user", () => {
    const input = facts("post"); input.projects[0].ownerUserId = "missing"; input.latestEvents[0].ownerUserId = "missing";
    const codes = validateCleanupFacts(input).map((issue) => issue.code);
    assert.ok(codes.includes("orphan-direct-owner"));
    assert.ok(codes.includes("orphan-availability-event"));
  });
  it("rejects duplicate or null event snapshots instead of normalizing them", () => {
    const duplicate = facts("post"); duplicate.latestEvents[0].availableProjectIds = ["project", "project"];
    assert.ok(validateCleanupFacts(duplicate).some((issue) => issue.code === "event-snapshot-duplicate"));
    const nullable = facts("post"); nullable.latestEvents[0].availableProjectIds = null;
    assert.ok(validateCleanupFacts(nullable).some((issue) => issue.code === "event-snapshot-null"));
  });
  it("requires the final event arrays to be non-null at the catalog level", () => {
    const input = facts("post"); input.catalog.eventArraysNullable = true;
    assert.ok(validateCleanupFacts(input).some((issue) => issue.code === "event-arrays-nullable"));
  });
  it("rejects a null array in any event row, not only the latest one", () => {
    const input = facts("pre"); input.eventArraysContainNull = true;
    assert.ok(validateCleanupFacts(input).some((issue) => issue.code === "event-array-null"));
  });
});

it("keeps cleanup and compensation migrations explicit and non-cascading", () => {
  const cleanup = readFileSync(`prisma/migrations/${CLEANUP_MIGRATION}/migration.sql`, "utf8");
  const recovery = readFileSync("scripts/recovery/individual-project-availability-d3/restore-d2-shadow.sql", "utf8");
  assert.match(cleanup, /DROP TABLE "ProjectMember"/);
  assert.match(cleanup, /DROP COLUMN "owner"/);
  assert.match(cleanup, /ON DELETE CASCADE ON UPDATE CASCADE/);
  for (const field of ["addedProjectIds", "removedProjectIds", "availableProjectIds"]) assert.match(cleanup, new RegExp(`ALTER COLUMN "${field}" SET NOT NULL`));
  assert.doesNotMatch(cleanup, /DROP (TABLE|COLUMN)[^;]*CASCADE/);
  assert.match(recovery, /CREATE TABLE "ProjectMember"/);
  assert.match(recovery, /ON DELETE SET NULL ON UPDATE CASCADE/);
});

it("requires a versioned recovery receipt with fixed non-empty identities", () => {
  const receipt = {
    version: 1, database: "fixture", schema: "public", d2Artifact: "a".repeat(40), d2MigrationsSha256: "b",
    cleanupMigration: CLEANUP_MIGRATION, cleanupSqlSha256: "c", recoveryMigration: RECOVERY_MIGRATION,
    recoverySqlSha256: "d", backupReference: "backup", rehearsalEvidence: "evidence",
  };
  assert.equal(isRecoveryReceipt(receipt), true);
  assert.equal(isRecoveryReceipt({ ...receipt, backupReference: "" }), false);
  assert.equal(isRecoveryReceipt({ ...receipt, version: 2 }), false);
});

it("rejects a non-commit D2 artifact before invoking git", async () => {
  await assert.rejects(() => artifactMigrationDigest(process.cwd(), "not-a-commit"), /full commit id/);
});

it("cleanup CLI rejects ambiguous input before resolving a database", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-project-ownership-cleanup.ts"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--pre\|--post/);
  assert.doesNotMatch(result.stderr, /DATABASE_URL is not set/);
});

it("recovery CLI requires its dedicated URL before reading a receipt", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/restore-project-ownership-shadow.ts", "--apply", "--backup-receipt", "missing.json"], { encoding: "utf8", env: { ...process.env, IPA_D3_RECOVERY_DATABASE_URL: "" } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /IPA_D3_RECOVERY_DATABASE_URL/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});
