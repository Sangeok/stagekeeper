import assert from "node:assert/strict";
import { it } from "node:test";
import { defaultGraph } from "@harness/core/pipeline.mjs";
import { savePipelineDefinition } from "../../../src/server/pipeline/api";
import { ensureRun } from "../../../src/server/pipeline/run-service";
import { checkpoint, cleanup, connections, fixture } from "./support";

it("two real saves serialize on owner/project locks and the loser is stale at zero and persisted baselines, in both orders", async () => {
  const pool = connections();
  try {
    for (const winnerIndex of [0, 1]) {
      const winner = pool.all[winnerIndex], loser = pool.all[1 - winnerIndex];
      const f = await fixture(winner, { plan: "pro" });
      try {
        const graph = defaultGraph("pro"), pipelineId = `default_${f.projectId}`;
        for (const baseline of [0, 1]) {
          const held = checkpoint(), reached = checkpoint();
          const first = winner.$extends({ query: { pipelineDefinition: { async create({ args, query }) { await held.hook(); return query(args); } } } }) as unknown as typeof winner;
          const second = loser.$extends({ query: { project: { async findUnique({ args, query }) { const row = await query(args); await reached.hook(); return row; } } } }) as unknown as typeof loser;
          const input = { projectId: f.projectId, userId: f.userId, pipelineId, definition: { steps: graph.nodes, gates: graph.gates }, expectedVersion: baseline };
          const saving = savePipelineDefinition(first, input);
          let competing: ReturnType<typeof savePipelineDefinition> | undefined;
          try {
            await held.entered();
            competing = savePipelineDefinition(second, { ...input, definition: { ...input.definition, gates: [] } });
            await reached.entered(); reached.release(); held.release();
            assert.deepEqual(await saving, { status: "success", pipelineId, version: baseline + 1 });
            assert.deepEqual(await competing, { status: "stale" });
            assert.equal(await winner.pipelineDefinition.count({ where: { pipelineId } }), baseline + 1);
            assert.equal(await winner.pipelineVersion.count({ where: { projectId: f.projectId } }), 1, "unchanged executable graph is reused");
          } finally { reached.release(); held.release(); await Promise.allSettled([saving, competing]); }
        }
      } finally { await cleanup(winner, f.userId); }
    }
  } finally { await pool.disconnect(); }
});

it("baseline-zero save and materialization preserve whichever obtains the shared lock first", async () => {
  const pool = connections(); const [first, second] = pool.all;
  try {
    for (const saveFirst of [true, false]) {
      const f = await fixture(first, { plan: "pro" });
      const held = checkpoint(), reached = checkpoint();
      // The first project read precedes locks; park the loser there and let the winner commit.
      const waiting = second.$extends({ query: { project: { async findUnique({ args, query }) { const row = await query(args); await held.hook(); return row; } } } }) as unknown as typeof second;
      const graph = defaultGraph("pro"), pipelineId = `default_${f.projectId}`;
      const input = { projectId: f.projectId, userId: f.userId, pipelineId, definition: { steps: graph.nodes, gates: [] }, expectedVersion: 0 };
      const delayed = saveFirst ? ensureRun(waiting, f.projectId, f.boardItemId, "in_review", false) : savePipelineDefinition(waiting, input);
      try {
        await held.entered();
        if (saveFirst) assert.equal((await savePipelineDefinition(first, input)).status, "success");
        else await ensureRun(first, f.projectId, f.boardItemId, "in_review", false);
        held.release();
        const result = await delayed;
        if (!saveFirst) assert.deepEqual(result, { status: "stale" });
        const versions = await first.pipelineVersion.findMany({ where: { projectId: f.projectId } });
        assert.equal(versions.length, 1); assert.deepEqual(versions[0].gates, saveFirst ? [] : graph.gates);
        assert.equal(await first.pipelineDefinition.count({ where: { pipelineId } }), 1);
      } finally { held.release(); reached.release(); await Promise.allSettled([delayed]); await cleanup(first, f.userId); }
    }
  } finally { await pool.disconnect(); }
});
