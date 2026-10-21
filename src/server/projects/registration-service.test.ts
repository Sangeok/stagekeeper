import assert from "node:assert/strict";
import { it } from "node:test";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { DISCONNECTED_REASON, ProjectIntegrityError } from "./access-query";
import { AvailabilityConflict } from "./availability-service";
import { registerRepositoryProject, registerWebProject } from "./registration-service";

const input = { userId: "u", slug: "mine", owner: "owner", repo: "repo", branch: "release/1.0" };
const snapshot = { repoOwner: "owner", repo: "repo", branch: "release/1.0", name: "Stored", slug: "stored", disconnectedAt: null };
const collision = (meta: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError("unique constraint", { code: "P2002", clientVersion: "7.10.0", meta });

function fixture(options: { errors?: unknown[]; row?: unknown; owned?: unknown[]; snapshotError?: Error } = {}) {
  const creates: Prisma.ProjectCreateArgs[] = [];
  let transactions = 0, snapshots = 0;
  const tx = {
    $queryRaw: async () => [],
    user: { findUniqueOrThrow: async () => ({ login: "owner", projectAvailabilityVersion: 0, subscription: null }), updateMany: async () => ({ count: 1 }) },
    projectAvailabilityEvent: { create: async () => ({}) },
    project: {
      findMany: async () => options.owned ?? [],
      create: async (args: Prisma.ProjectCreateArgs) => { creates.push(args); return { id: "p" }; },
    },
  } as unknown as Prisma.TransactionClient;
  const client = {
    $transaction: async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const error = options.errors?.[transactions];
      transactions++;
      if (error) throw error;
      return work(tx);
    },
    project: { findUnique: async (args: Prisma.ProjectFindUniqueArgs) => {
      snapshots++;
      assert.deepEqual(args.where, { id: "p" });
      assert.deepEqual(args.select, { repoOwner: true, repo: true, branch: true, name: true, slug: true, disconnectedAt: true });
      if (options.snapshotError) throw options.snapshotError;
      return Object.hasOwn(options, "row") ? options.row : snapshot;
    } },
  } as unknown as PrismaClient;
  return { client, creates, counts: () => ({ transactions, snapshots }) };
}

it("web registration uses one transaction, stores only the supplied hash and never reads a post-commit snapshot", async () => {
  const f = fixture();
  assert.deepEqual(await registerWebProject(f.client, { ...input, initialTokenHash: "hash-only" }), { ok: true, item: { status: "created", projectId: "p", slug: "mine" } });
  const token = f.creates[0].data.tokens?.create;
  assert.ok(token && !Array.isArray(token));
  assert.equal(token.hash, "hash-only");
  assert.deepEqual(f.counts(), { transactions: 1, snapshots: 0 });
});

it("REST registration omits initial credentials and returns the committed repository snapshot", async () => {
  const f = fixture();
  const result = await registerRepositoryProject(f.client, input);
  assert.deepEqual(result, { status: "created", project: { owner: "owner", repo: "repo", branch: "release/1.0", name: "Stored", slug: "stored" } });
  assert.equal(Object.hasOwn(f.creates[0].data, "tokens"), false);
  assert.deepEqual(f.counts(), { transactions: 1, snapshots: 1 });
});

it("web slug collisions make one attempt while REST retries once for both Prisma metadata shapes", async () => {
  for (const meta of [{ target: ["slug"] }, { driverAdapterError: { cause: { constraint: { index: "Project_slug_key" } } } }]) {
    const error = collision(meta);
    const web = fixture({ errors: [error] });
    assert.deepEqual(await registerWebProject(web.client, { ...input, initialTokenHash: "hash" }), { ok: false, reason: "'mine' is already taken." });
    assert.equal(web.counts().transactions, 1);
    const rest = fixture({ errors: [error] });
    assert.equal((await registerRepositoryProject(rest.client, input)).status, "created");
    assert.deepEqual(rest.counts(), { transactions: 2, snapshots: 1 });
    assert.equal(rest.creates.length, 1);
    const exhausted = fixture({ errors: [error, error] });
    await assert.rejects(registerRepositoryProject(exhausted.client, input), e => e === error);
    assert.deepEqual(exhausted.counts(), { transactions: 2, snapshots: 0 });
  }
});

it("unrelated constraints and storage errors propagate without extra registration attempts", async () => {
  for (const error of [collision({ target: ["githubId"] }), new Error("storage unavailable")]) {
    for (const web of [true, false]) {
      const f = fixture({ errors: [error] });
      await assert.rejects(web ? registerWebProject(f.client, { ...input, initialTokenHash: "hash" }) : registerRepositoryProject(f.client, input), e => e === error);
      assert.deepEqual(f.counts(), { transactions: 1, snapshots: 0 });
    }
  }
});

it("transaction contention keeps its retry budget and channel-specific result", async () => {
  for (const web of [true, false]) {
    const f = fixture({ errors: Array(3).fill(new AvailabilityConflict()) });
    const result = web ? await registerWebProject(f.client, { ...input, initialTokenHash: "hash" }) : await registerRepositoryProject(f.client, input);
    assert.deepEqual(result, web ? { ok: false, reason: new AvailabilityConflict().message } : { status: "conflict", reason: new AvailabilityConflict().message });
    assert.deepEqual(f.counts(), { transactions: 3, snapshots: 0 });
  }
  const error = new ProjectIntegrityError();
  await assert.rejects(registerWebProject(fixture({ errors: [error] }).client, { ...input, initialTokenHash: "hash" }), e => e === error);
  assert.deepEqual(await registerRepositoryProject(fixture({ errors: [error] }).client, input), { status: "integrity", reason: error.message });
});

it("post-commit disappearance, disconnection and corrupt ownership do not masquerade as success", async () => {
  for (const [row, expected] of [
    [null, { status: "vanished", reason: "the project vanished while registering — try again" }],
    [{ ...snapshot, disconnectedAt: new Date() }, { status: "disconnected", reason: DISCONNECTED_REASON, slug: "stored" }],
    [{ ...snapshot, repoOwner: null }, { status: "integrity", reason: new ProjectIntegrityError().message }],
  ] as const) {
    const f = fixture({ row });
    assert.deepEqual(await registerRepositoryProject(f.client, input), expected);
    assert.deepEqual(f.counts(), { transactions: 1, snapshots: 1 });
  }
  const error = new Error("snapshot failed");
  await assert.rejects(registerRepositoryProject(fixture({ snapshotError: error }).client, input), e => e === error);
});

it("existing, disconnected, capped and integrity results preserve the command's pre-write behavior", async () => {
  const owned = { id: "p", ownerUserId: "u", repoOwner: "owner", repo: "repo", slug: "stored", available: true, disconnectedAt: null };
  for (const [projects, status] of [
    [[owned], "existing"],
    [[{ ...owned, available: false, disconnectedAt: new Date() }], "disconnected"],
    [[{ ...owned, repo: "other" }], "capped"],
    [[{ ...owned, ownerUserId: "foreign" }], "integrity"],
  ] as const) {
    for (const web of [true, false]) {
      const f = fixture({ owned: [...projects] });
      if (web) {
        const result = await registerWebProject(f.client, { ...input, initialTokenHash: "hash" });
        assert.ok(result.ok); assert.equal(result.item.status, status);
      } else assert.equal((await registerRepositoryProject(f.client, input)).status, status);
      assert.equal(f.creates.length, 0);
      assert.equal(f.counts().snapshots, !web && status === "existing" ? 1 : 0);
    }
  }
});
