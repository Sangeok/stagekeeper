import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { changeUserPlan, selectProjectForUse, withAvailabilityTransaction, AvailabilityConflict } from "./project-availability-service";
import type { TransactionHost } from "./project-access-query";

const project = (id: string, available = true) => ({
  id, slug: id, name: id, repoOwner: "repo-owner", repo: id, ownerUserId: "u", available,
  lastSelectedAt: null as Date | null, lastSyncedAt: null as Date | null, createdAt: new Date(`2026-01-0${id === "a" ? 1 : 2}`),
});
type Event = { version: number; reason: string; availableProjectIds: string[]; addedProjectIds: string[]; removedProjectIds: string[] };

function fixture(plan: string, projects = [project("a"), project("b", false)]) {
  let state = { plan, version: 7, projects, events: [] as Event[] };
  const options: unknown[] = [];
  const client = {
    async $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>, option: unknown): Promise<T> {
      options.push(option);
      const before = structuredClone(state);
      const tx = {
        user: {
          findUniqueOrThrow: async () => ({ login: "test", projectAvailabilityVersion: state.version, subscription: { plan: state.plan } }),
          updateMany: async ({ where }: { where: { projectAvailabilityVersion: number } }) => {
            if (state.version !== where.projectAvailabilityVersion) return { count: 0 };
            state.version++; return { count: 1 };
          },
        },
        project: {
          findMany: async () => state.projects,
          update: async ({ where, data }: { where: { id: string }; data: Partial<ReturnType<typeof project>> }) => {
            Object.assign(state.projects.find((p) => p.id === where.id)!, data);
          },
          updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: { available: boolean } }) => {
            for (const p of state.projects) if (where.id.in.includes(p.id)) p.available = data.available;
          },
        },
        subscription: { upsert: async ({ update }: { update: { plan: string } }) => { state.plan = update.plan; } },
        projectAvailabilityEvent: { create: async ({ data }: { data: Event }) => { state.events.push(data); } },
        agentRun: { findMany: async () => [] },
      };
      // A transaction boundary double intentionally implements only the exercised delegates.
      try { return await run(tx as unknown as Prisma.TransactionClient); }
      catch (error) { state = before; throw error; }
    },
  } as TransactionHost;
  return { client, state: () => state, options };
}

describe("project availability transactions", () => {
  it("replaces the confirmed Free project and writes one exact event", async () => {
    const f = fixture("free");
    const result = await selectProjectForUse(f.client, { userId: "u", targetProjectId: "b", replacementProjectId: "a", expectedVersion: 7 });
    assert.deepEqual(result, { status: "success", changed: true, version: 8, availableProjectIds: ["b"] });
    assert.equal(f.state().projects[0].available, false);
    assert.ok(f.state().projects[1].lastSelectedAt instanceof Date);
    assert.deepEqual(f.state().events.map((e) => [e.version, e.reason, e.addedProjectIds, e.removedProjectIds, e.availableProjectIds]), [[8, "use-project", ["b"], ["a"], ["b"]]]);
    assert.deepEqual(f.options[0], { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 });
  });
  it("rejects stale even if the target is already selected; a current-version duplicate is a no-op", async () => {
    const f = fixture("free"); const before = structuredClone(f.state());
    assert.deepEqual(await selectProjectForUse(f.client, { userId: "u", targetProjectId: "a", expectedVersion: 6 }), { status: "stale", currentVersion: 7 });
    assert.deepEqual(await selectProjectForUse(f.client, { userId: "u", targetProjectId: "a", expectedVersion: 7 }), { status: "success", changed: false, version: 7, availableProjectIds: ["a"] });
    assert.deepEqual(f.state(), before);
  });
  for (const plan of ["pro", "max"]) it(`${plan} spare slots never remove a submitted replacement`, async () => {
    const f = fixture(plan);
    const result = await selectProjectForUse(f.client, { userId: "u", targetProjectId: "b", replacementProjectId: "a", expectedVersion: 7 });
    assert.equal(result.status, "success"); assert.deepEqual(f.state().projects.map((p) => p.available), [true, true]);
    assert.deepEqual(f.state().events[0].removedProjectIds, []);
  });
  it("rejects unknown target or replacement and full Pro without a replacement with zero writes", async () => {
    const f = fixture("pro", ["a", "b", "c", "d", "e"].map((id) => project(id)).concat(project("f", false)));
    const before = structuredClone(f.state());
    for (const input of [{ targetProjectId: "foreign" }, { targetProjectId: "f", replacementProjectId: "foreign" }, { targetProjectId: "f" }]) {
      assert.equal((await selectProjectForUse(f.client, { userId: "u", expectedVersion: 7, ...input })).status, "error");
    }
    assert.deepEqual(f.state(), before);
  });
  it("upgrades without filling slots or increasing the selection version", async () => {
    const f = fixture("free");
    assert.deepEqual(await changeUserPlan(f.client, { userId: "u", plan: "max" }), { plan: "max", version: 7, availableProjectIds: ["a"] });
    assert.equal(f.state().events.length, 0); assert.equal(f.state().projects[1].available, false);
  });
  it("downgrades only the current set and preserves selection timestamps", async () => {
    const a = project("a"); a.lastSelectedAt = new Date("2026-01-10");
    const f = fixture("pro", [a, project("b"), project("c", false)]);
    const result = await changeUserPlan(f.client, { userId: "u", plan: "free" });
    assert.deepEqual(result.availableProjectIds, ["a"]); assert.equal(result.version, 8);
    assert.equal(f.state().events[0].reason, "plan-downgrade"); assert.equal(f.state().projects[2].available, false);
    assert.deepEqual(f.state().projects[0].lastSelectedAt, a.lastSelectedAt);
  });
  it("rejects impossible empty/over-cap state instead of silently repairing it", async () => {
    for (const projects of [[project("a", false)], [project("a"), project("b")]]) {
      const f = fixture("free", projects); const before = structuredClone(f.state());
      const result = await selectProjectForUse(f.client, { userId: "u", targetProjectId: "a", expectedVersion: 7 });
      assert.equal(result.status, "error"); assert.deepEqual(f.state(), before);
    }
  });
  it("retries only serialization/CAS conflicts, at most three fresh transactions", async () => {
    let calls = 0;
    const client = { $transaction: async () => { calls++; throw { code: "P2034" }; } } as unknown as TransactionHost;
    await assert.rejects(() => withAvailabilityTransaction(client, async () => 1), AvailabilityConflict);
    assert.equal(calls, 3);
    calls = 0;
    const fatal = { $transaction: async () => { calls++; throw { code: "P2002" }; } } as unknown as TransactionHost;
    await assert.rejects(() => withAvailabilityTransaction(fatal, async () => 1));
    assert.equal(calls, 1);
  });
});
