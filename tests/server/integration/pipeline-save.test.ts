import assert from "node:assert/strict";
import { it } from "node:test";
import { defaultGraph } from "@harness/core/pipeline.mjs";
import { savePipelineVersion } from "../../../src/server/pipeline/version-save-query";
import { ensureCurrentVersion } from "../../../src/server/pipeline/run-query";
import { cleanup, connections, fixture, ordered } from "./support";

it("two real saves reading the same persisted/zero baseline append once under a read barrier", async () => {
  const pool = connections(); const [first, second] = pool.all;
  let userId: string | undefined;
  try {
    const f = await fixture(first, { plan: "pro" }); userId = f.userId;
    for (const baseline of [0, 1]) {
      const meet = ordered();
      // Prisma extensions preserve these delegates at runtime but carry different generic types.
      const hooked = (db: typeof first, hook: () => Promise<void>) => db.$extends({ query: { pipelineVersion: { async findFirst({ args, query }) { const row = await query(args); await hook(); return row; } } } }) as unknown as typeof db;
      const input = { projectId: f.projectId, userId: f.userId, graph: defaultGraph("pro"), expectedVersion: baseline };
      const winner = savePipelineVersion(hooked(first, meet.winner), input);
      const loser = savePipelineVersion(hooked(second, meet.loser), { ...input, graph: { ...input.graph, gates: [] } });
      try { assert.deepEqual(await winner, { status: "success", version: baseline + 1 }); } finally { meet.finish(); }
      assert.deepEqual(await loser, { status: "stale" });
      const rows = await first.pipelineVersion.findMany({ where: { projectId: f.projectId }, orderBy: { version: "asc" } });
      assert.equal(rows.length, baseline + 1); assert.deepEqual(rows.at(-1)?.gates, input.graph.gates);
      assert.deepEqual(await savePipelineVersion(first, input), { status: "stale" });
    }
  } finally { await cleanup(first, userId); await pool.disconnect(); }
});

it("baseline-zero save cannot overwrite a concurrently materialized default", async () => {
  const pool = connections(); const [first, second] = pool.all;
  let userId: string | undefined;
  try {
    const f = await fixture(first, { plan: "pro" }); userId = f.userId;
    let read!: () => void; let release!: () => void;
    const observed = new Promise<void>(resolve => { read = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    const hooked = first.$extends({ query: { pipelineVersion: { async findFirst({ args, query }) { const row = await query(args); read(); await gate; return row; } } } }) as unknown as typeof first;
    const save = savePipelineVersion(hooked, { projectId: f.projectId, userId: f.userId, graph: { ...defaultGraph("pro"), gates: [] }, expectedVersion: 0 });
    await observed;
    try { await ensureCurrentVersion(second, f.projectId); } finally { release(); }
    assert.deepEqual(await save, { status: "stale" });
    const rows = await first.pipelineVersion.findMany({ where: { projectId: f.projectId } });
    assert.equal(rows.length, 1); assert.equal(rows[0].createdBy, "pipeline"); assert.deepEqual(rows[0].gates, defaultGraph("pro").gates);
  } finally { await cleanup(first, userId); await pool.disconnect(); }
});

it("a default materializer cannot replace a baseline-zero save that commits first", async () => {
  const pool = connections(); const [first, second] = pool.all;
  let userId: string | undefined;
  let release!: () => void;
  try {
    const f = await fixture(first, { plan: "pro" }); userId = f.userId;
    let read!: () => void;
    const observed = new Promise<void>(resolve => { read = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    // Pause after the real SQL read; only ordering is simulated.
    const hooked = second.$extends({ query: { pipelineVersion: { async findFirst({ args, query }) { const row = await query(args); read(); await gate; return row; } } } }) as unknown as typeof second;
    const materialize = ensureCurrentVersion(hooked, f.projectId);
    await observed;
    const graph = { ...defaultGraph("pro"), gates: [] };
    try { assert.deepEqual(await savePipelineVersion(first, { projectId: f.projectId, userId: f.userId, graph, expectedVersion: 0 }), { status: "success", version: 1 }); } finally { release(); }
    const current = await materialize;
    assert.equal(current.createdBy, f.userId); assert.deepEqual(current.gates, []);
    assert.equal(await first.pipelineVersion.count({ where: { projectId: f.projectId } }), 1);
  } finally { release?.(); await cleanup(first, userId); await pool.disconnect(); }
});
