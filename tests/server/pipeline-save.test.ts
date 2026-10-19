import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { savePipelineDefinition } from "../../src/server/pipeline/api";
import * as state from "../../src/fsd/features/edit-pipeline/model/pipeline-save-state";
import { loadModule } from "./fixtures/load-module";
import { assertActions, manifestEntries } from "./fixtures/action-manifest";

it("rejects malformed definitions and baselines before a transaction", async () => {
  let transactions = 0;
  const db = { $transaction: async () => { transactions++; throw new Error("must not reach database"); } } as unknown as PrismaClient;
  const input = { projectId: "p", userId: "u", pipelineId: "default_p", definition: { steps: ["plan"], gates: [] }, expectedVersion: 3 };
  for (const raw of [undefined, null, "3", -1, NaN, 0.5, 2_147_483_647]) {
    assert.equal((await savePipelineDefinition(db, { ...input, expectedVersion: raw as number })).status, "error");
  }
  for (const definition of [null, {}, { steps: [null], gates: [] }, { steps: [], gates: [1] }]) {
    assert.equal((await savePipelineDefinition(db, { ...input, definition: definition as unknown as typeof input.definition })).status, "error");
  }
  assert.equal(transactions, 0);
});

it("infrastructure and ambiguous commit errors propagate without retries", async () => {
  const error = new Error("connection lost"); let transactions = 0;
  const db = { $transaction: async () => { transactions++; throw error; } } as unknown as PrismaClient;
  await assert.rejects(savePipelineDefinition(db, { projectId: "p", userId: "u", pipelineId: "default_p", definition: { steps: ["plan"], gates: [] }, expectedVersion: 0 }), value => value === error);
  assert.equal(transactions, 1);
});

it("actual action preserves authority, accepts fragments and revalidates success alone", async () => {
  let writable = false; let plan = "free"; let saves = 0;
  const refreshes: unknown[][] = [];
  let response: state.SavePipelineResult = { status: "stale" };
  const action = loadModule<typeof import("../../src/fsd/features/edit-pipeline/api/edit-pipeline.server")>("src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts", {
    "next/cache": { revalidatePath: (...args: unknown[]) => { refreshes.push(args); } },
    "@/server/auth/guard": { requireProjectWrite: async () => writable ? { ok: true, projectId: "trusted", userId: "owner" } : { ok: false, reason: "Read only" } },
    "@/server/projects/api.server": { planForProject: async () => plan }, "@/server/db": { prisma: {} },
    "@/server/pipeline/api": { savePipelineDefinition: async (_db: unknown, input: { projectId: string; userId: string; definition: unknown }) => {
      assert.equal(input.projectId, "trusted"); assert.equal(input.userId, "owner");
      assert.deepEqual(input.definition, { steps: ["qa"], gates: [] }); saves++; return response;
    } },
    "../model/pipeline-save-state": state,
  });
  const valid = { pipelineId: null, name: "Check", definition: { steps: ["qa"], gates: [] }, expectedVersion: 0, projectId: "forged", userId: "forged" };
  assert.equal((await action.savePipeline("mine", valid)).status, "error");
  writable = true; assert.equal((await action.savePipeline("mine", valid)).status, "error");
  plan = "pro";
  assert.equal((await action.savePipeline("mine", null as unknown as state.SavePipelineInput)).status, "error");
  assert.equal(saves, 0);
  assert.equal((await action.savePipeline("mine", valid)).status, "stale"); assert.equal(refreshes.length, 0);
  response = { status: "error", reason: "validation" }; await action.savePipeline("mine", valid); assert.equal(refreshes.length, 0);
  response = { status: "success", pipelineId: "new", version: 1 }; await action.savePipeline("mine", valid);
  assert.deepEqual(refreshes, [["/(app)/p/[slug]", "layout"]]);
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh build exposes pipeline Actions but not the private draft model", () => {
  assertActions("src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts", ["savePipeline"]);
  assertActions("src/fsd/features/edit-pipeline/api/automatic-scout.server.ts", ["saveAutomaticScout"]);
  assert.ok(!manifestEntries().some(entry => entry.filename?.replaceAll("\\", "/").endsWith("src/fsd/features/edit-pipeline/model/pipeline-draft-state.ts")));
});
