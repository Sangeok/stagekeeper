import assert from "node:assert/strict";
import { it } from "node:test";
import { Prisma } from "../../src/generated/prisma/client";
import { defaultGraph } from "@harness/core/pipeline.mjs";
import { savePipelineVersion } from "../../src/server/pipeline/version-save-query";
import * as state from "../../src/fsd/features/edit-pipeline/model/pipeline-save-state";
import { loadModule } from "./fixtures/load-module";
import { assertActions } from "./fixtures/action-manifest";

it("saves exactly expected+1 and rejects stale/invalid baselines without create", async () => {
  const writes: Prisma.PipelineVersionCreateArgs[] = [];
  let reads = 0; let latest = 3;
  const db = { pipelineVersion: {
    findFirst: async () => { reads++; return latest ? { version: latest } : null; },
    create: async (args: Prisma.PipelineVersionCreateArgs) => { writes.push(args); latest = Number(args.data.version); },
  } } as unknown as Pick<Prisma.TransactionClient, "pipelineVersion">;
  const input = { projectId: "p", userId: "u", graph: defaultGraph("pro"), expectedVersion: 3 };
  assert.deepEqual(await savePipelineVersion(db, input), { status: "success", version: 4 });
  assert.equal(writes[0].data.createdBy, "u"); assert.equal(writes[0].data.version, 4);
  assert.deepEqual(await savePipelineVersion(db, input), { status: "stale" }); assert.equal(writes.length, 1);
  for (const raw of [undefined, null, "3", -1, NaN, 0.5, 2_147_483_647]) {
    const before = reads;
    assert.equal((await savePipelineVersion(db, { ...input, expectedVersion: raw as number })).status, "error");
    assert.equal(reads, before);
  }
  latest = 0; assert.deepEqual(await savePipelineVersion(db, { ...input, expectedVersion: 0 }), { status: "success", version: 1 });
});

it("unique races return stale while other infrastructure errors propagate", async () => {
  for (const code of ["P2002", "P2010"]) {
    const error = new Prisma.PrismaClientKnownRequestError("race", { code, clientVersion: "7.10.0" });
    const db = { pipelineVersion: { findFirst: async () => null, create: async () => { throw error; } } } as unknown as Pick<Prisma.TransactionClient, "pipelineVersion">;
    const job = savePipelineVersion(db, { projectId: "p", userId: "u", graph: defaultGraph("pro"), expectedVersion: 0 });
    if (code === "P2002") assert.deepEqual(await job, { status: "stale" }); else await assert.rejects(job, value => value === error);
  }
});

it("actual action preserves authentication/plan gates and revalidates success alone", async () => {
  let writable = false; let plan = "free"; let saves = 0; let refreshes = 0;
  let response: state.SavePipelineResult = { status: "stale" };
  const action = loadModule<typeof import("../../src/fsd/features/edit-pipeline/api/edit-pipeline.server")>("src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts", {
    "next/cache": { revalidatePath: () => { refreshes++; } },
    "@/server/auth/guard": { requireProjectWrite: async () => writable ? { ok: true, projectId: "trusted", userId: "owner" } : { ok: false, reason: "Read only" } },
    "@/server/entitlement": { planForProject: async () => plan }, "@/server/db": { prisma: {} },
    "@/fsd/shared/routes/project": { projectPath: () => "/p/mine/pipeline" },
    "@/server/pipeline/version-save-query": { savePipelineVersion: async (_db: unknown, input: { projectId: string; userId: string }) => { assert.equal(input.projectId, "trusted"); assert.equal(input.userId, "owner"); saves++; return response; } },
    "../model/pipeline-save-state": state,
  });
  const valid = { graph: defaultGraph("pro"), expectedVersion: 0 };
  assert.equal((await action.savePipeline("mine", valid)).status, "error");
  writable = true; assert.equal((await action.savePipeline("mine", valid)).status, "error");
  plan = "pro";
  assert.equal((await action.savePipeline("mine", null as unknown as state.SavePipelineInput)).status, "error");
  assert.equal(saves, 0);
  assert.equal((await action.savePipeline("mine", valid)).status, "stale"); assert.equal(refreshes, 0);
  response = { status: "error", reason: "validation" }; await action.savePipeline("mine", valid); assert.equal(refreshes, 0);
  response = { status: "success", version: 1 }; await action.savePipeline("mine", valid); assert.equal(refreshes, 1);
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh build exposes savePipeline", () => assertActions("src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts", ["savePipeline"]));
