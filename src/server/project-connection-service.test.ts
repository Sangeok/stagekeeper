import assert from "node:assert/strict";
import { it } from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import type { TransactionHost } from "./project-access-query";
import { disconnectProject, reconnectProject } from "./project-connection-service";

const project = (id: string, available = true, disconnectedAt: Date | null = null) => ({
  id, slug: id, name: id, repoOwner: "owner", repo: id, ownerUserId: "u", available, disconnectedAt,
  lastSelectedAt: null as Date | null, lastSyncedAt: null, createdAt: new Date("2026-01-01"),
});

function fixture(projects = [project("a")], plan = "free") {
  let state = { version: 2, projects, projectTokens: [{ projectId: "a", revokedAt: null as Date | null }, { projectId: "a", revokedAt: new Date("2026-01-01") }, { projectId: "other", revokedAt: null as Date | null }], ownerTokens: [{ projectId: "a", revokedAt: null as Date | null }], userTokens: [{ revokedAt: null }], events: [] as Prisma.ProjectAvailabilityEventCreateInput[] };
  const order: string[] = []; let eventFailure = false; let casFailure = false;
  const client = { async $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const before = structuredClone(state);
    const tx = {
      $queryRaw: async () => { order.push("owner-lock"); return []; },
      user: { findUniqueOrThrow: async () => { order.push("snapshot"); return { login: "u", projectAvailabilityVersion: state.version, subscription: { plan } }; },
        updateMany: async () => { if (casFailure) return { count: 0 }; state.version++; return { count: 1 }; } },
      project: { findMany: async () => structuredClone(state.projects), update: async ({ where, data }: { where: { id: string }; data: Partial<ReturnType<typeof project>> }) => { Object.assign(state.projects.find((p) => p.id === where.id)!, data); } },
      projectToken: { updateMany: async ({ where, data }: { where: { projectId: string }; data: { revokedAt: Date } }) => { state.projectTokens.filter((t) => t.projectId === where.projectId && t.revokedAt === null).forEach((t) => { t.revokedAt = data.revokedAt; }); } },
      ownerToken: { updateMany: async ({ where, data }: { where: { projectId: string }; data: { revokedAt: Date } }) => { state.ownerTokens.filter((t) => t.projectId === where.projectId && t.revokedAt === null).forEach((t) => { t.revokedAt = data.revokedAt; }); } },
      projectAvailabilityEvent: { create: async ({ data }: { data: Prisma.ProjectAvailabilityEventCreateInput }) => { if (eventFailure) throw new Error("event storage failed"); state.events.push(data); } },
    };
    try { return await run(tx as unknown as Prisma.TransactionClient); } catch (error) { state = before; throw error; }
  } } as unknown as TransactionHost;
  return { client, state: () => state, order, failEvent: () => { eventFailure = true; }, failCas: () => { casFailure = true; } };
}
const input = { userId: "u", targetProjectId: "a", expectedVersion: 2 };

it("disconnects the last project atomically and revokes only its previously valid project credentials", async () => {
  const f = fixture(); const before = structuredClone(f.state());
  assert.deepEqual(await disconnectProject(f.client, input), { status: "success", changed: true, version: 3 });
  assert.deepEqual(f.order, ["owner-lock", "snapshot"]);
  assert.equal(f.state().projects[0].available, false); assert.ok(f.state().projects[0].disconnectedAt instanceof Date);
  assert.ok(f.state().projectTokens[0].revokedAt instanceof Date); assert.ok(f.state().ownerTokens[0].revokedAt instanceof Date);
  assert.deepEqual(f.state().projectTokens.slice(1), before.projectTokens.slice(1)); assert.deepEqual(f.state().userTokens, before.userTokens);
  assert.deepEqual(f.state().events.map((e) => [e.reason, e.targetProjectId, e.removedProjectIds, e.availableProjectIds]), [["disconnect-project", "a", ["a"], []]]);
});

it("records a not-selected disconnect without inventing an available-set removal or selecting another project", async () => {
  const f = fixture([project("a", false), project("b")]);
  await disconnectProject(f.client, input);
  assert.deepEqual(f.state().events[0].removedProjectIds, []); assert.deepEqual(f.state().events[0].availableProjectIds, ["b"]);
});

it("checks stale before no-op and leaves repeated current-version requests unchanged", async () => {
  const f = fixture(); await disconnectProject(f.client, input); const before = structuredClone(f.state());
  assert.deepEqual(await disconnectProject(f.client, input), { status: "stale", currentVersion: 3 });
  assert.deepEqual(await disconnectProject(f.client, { ...input, expectedVersion: 3 }), { status: "success", changed: false, version: 3 });
  assert.deepEqual(f.state(), before);
});

it("reconnects the same identity without resurrecting credentials and rejects a full or over-cap account", async () => {
  const f = fixture(); await disconnectProject(f.client, input); const before = structuredClone(f.state());
  assert.equal((await reconnectProject(f.client, { ...input, expectedVersion: 3 })).status, "success");
  assert.equal(f.state().projects[0].slug, "a"); assert.equal(f.state().projects[0].disconnectedAt, null);
  assert.deepEqual(f.state().projectTokens, before.projectTokens); assert.deepEqual(f.state().ownerTokens, before.ownerTokens);
  for (const count of [1, 2]) {
    const full = fixture([project("a", false, new Date()), ...Array.from({ length: count }, (_, i) => project(`b${i}`, i === 0))]);
    const snapshot = structuredClone(full.state()); const result = await reconnectProject(full.client, input);
    assert.equal(result.status === "error" && result.code, "capped"); assert.deepEqual(full.state(), snapshot);
  }
});

it("rejects foreign, invalid, and ambiguous repository requests, including current-version no-op", async () => {
  const f = fixture(); const before = structuredClone(f.state());
  for (const change of [{ targetProjectId: "foreign" }, { expectedVersion: -1 }, { expectedVersion: Number.MAX_SAFE_INTEGER + 1 }]) assert.equal((await disconnectProject(f.client, { ...input, ...change })).status, "error");
  assert.deepEqual(f.state(), before);
  const duplicate = project("b", false); duplicate.repo = "A";
  const ambiguous = fixture([project("a"), duplicate]);
  for (const action of [disconnectProject, reconnectProject]) assert.equal((await action(ambiguous.client, input)).status, "error");
  assert.equal(ambiguous.state().events.length, 0);
});

it("uses connected counts for Free/Pro/Max reconnect limits, independently of selected counts", async () => {
  for (const [plan, connected, allowed] of [["free", 0, true], ["free", 1, false], ["pro", 4, true], ["pro", 5, false], ["pro", 6, false], ["max", 20, true]] as const) {
    const f = fixture([project("a", false, new Date()), ...Array.from({ length: connected }, (_, i) => project(`b${i}`, i === 0))], plan);
    const result = await reconnectProject(f.client, input);
    assert.equal(result.status === "success", allowed, `${plan} with ${connected} connected`);
  }
});

it("rolls every write back on event storage failure and CAS retry exhaustion", async () => {
  for (const failure of ["event", "cas"]) {
    const f = fixture(); const before = structuredClone(f.state());
    if (failure === "event") { f.failEvent(); await assert.rejects(disconnectProject(f.client, input), /event storage failed/); }
    else { f.failCas(); const result = await disconnectProject(f.client, input); assert.equal(result.status === "error" && result.code, "conflict"); }
    assert.deepEqual(f.state(), before);
  }
});
