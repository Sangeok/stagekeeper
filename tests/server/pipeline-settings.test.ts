import assert from "node:assert/strict";
import { it } from "node:test";
import { PIPELINE_EDIT_PLAN_GATE } from "@harness/core/pipeline.mjs";
import { loadModule } from "./fixtures/load-module";
import { assertActions } from "./fixtures/action-manifest";

const names = ["archivePipelineAction", "renamePipelineAction", "setDefaultPipelineAction", "setPipelineRuleAction", "setAutomaticPickAction"];
it("all five settings actions enforce authority and plan before shape, use trusted identity, and refresh only success", async () => {
  let access = false, plan = "pro", calls = 0, succeeds = false;
  const refreshed: unknown[][] = [];
  const work = async (_db: unknown, input: { projectId: string; userId: string }) => {
    calls++; assert.equal(input.projectId, "trusted"); assert.equal(input.userId, "owner");
    return succeeds ? { ok: true, item: null } : { ok: false, reason: "rejected" };
  };
  const actions = loadModule<typeof import("../../src/fsd/features/edit-pipeline/api/pipeline-settings.server")>("src/fsd/features/edit-pipeline/api/pipeline-settings.server.ts", {
    "next/cache": { revalidatePath: (...args: unknown[]) => refreshed.push(args) },
    "@/server/auth/guard": { requireProjectWrite: async () => access ? { ok: true, projectId: "trusted", userId: "owner" } : { ok: false, reason: "Unavailable" } },
    "@/server/db": { prisma: {} }, "@/server/entitlement": { planForProject: async () => plan },
    "@/server/pipeline/pipeline-settings-query": { archivePipeline: work, renamePipeline: work, setDefaultPipeline: work, setPipelineRule: work, setAutomaticPick: work },
  });
  const invoke = [() => actions.archivePipelineAction("mine", "p"), () => actions.renamePipelineAction("mine", "p", "Name"),
    () => actions.setDefaultPipelineAction("mine", "p"), () => actions.setPipelineRuleAction("mine", "fix", "p"), () => actions.setAutomaticPickAction("mine", false)];
  for (const action of invoke) assert.deepEqual(await action(), { success: false, error: "Unavailable" });
  access = true; plan = "free";
  for (const action of invoke) assert.deepEqual(await action(), { success: false, error: PIPELINE_EDIT_PLAN_GATE });
  plan = "pro";
  const invalid = [() => actions.archivePipelineAction("mine", null as unknown as string), () => actions.renamePipelineAction("mine", "p", {} as string),
    () => actions.setDefaultPipelineAction("mine", undefined as unknown as string), () => actions.setPipelineRuleAction("mine", "invalid", "p"), () => actions.setAutomaticPickAction("mine", "false" as unknown as boolean)];
  for (const action of invalid) assert.deepEqual(await action(), { success: false, error: "Invalid pipeline settings request." });
  assert.equal(calls, 0);
  for (const action of invoke) assert.deepEqual(await action(), { success: false, error: "rejected" });
  assert.equal(refreshed.length, 0); succeeds = true;
  for (const action of invoke) assert.deepEqual(await action(), { success: true, data: null });
  assert.equal(calls, 10); assert.deepEqual(refreshed, Array.from({ length: 5 }, () => ["/(app)/p/[slug]", "layout"]));
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh build exposes exactly the five settings actions", () => assertActions("src/fsd/features/edit-pipeline/api/pipeline-settings.server.ts", names));
