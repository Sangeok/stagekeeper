import assert from "node:assert/strict";
import { it } from "node:test";
import { loadModule } from "./fixtures/load-module";
import { assertActions } from "./fixtures/action-manifest";

it("change action rejects inaccessible projects and malformed payloads without service writes, then maps stale and trusts server identity", async () => {
  let denied: string | null = "This project is not selected.";
  let calls = 0, reason: string | null = "stale";
  const refreshed: unknown[][] = [];
  const action = loadModule<typeof import("../../src/fsd/features/change-item-pipeline/api/change-item-pipeline.server")>("src/fsd/features/change-item-pipeline/api/change-item-pipeline.server.ts", {
    "next/cache": { revalidatePath: (...args: unknown[]) => refreshed.push(args) },
    "@/server/auth/guard": { requireProjectWrite: async () => denied ? { ok: false, reason: denied } : { ok: true, projectId: "trusted", userId: "owner" } },
    "@/server/pipeline/api.server": { changePipeline: async (projectId: string, input: { userId: string; expectedUpdatedAt: Date }) => {
      calls++; assert.equal(projectId, "trusted"); assert.equal(input.userId, "owner"); assert.equal(input.expectedUpdatedAt.toISOString(), "2026-10-15T00:00:00.000Z");
      return reason ? { ok: false, reason } : { ok: true, item: null };
    } },
  });
  const valid = { key: "ITEM-01", pipelineId: "p", expectedUpdatedAt: "2026-10-15T00:00:00.000Z", userId: "forged", projectId: "forged" };
  for (const message of [denied, "This project is disconnected."]) {
    denied = message; assert.deepEqual(await action.changeItemPipeline("mine", valid), { success: false, error: message });
  }
  denied = null;
  for (const raw of [null, {}, { ...valid, key: "" }, { ...valid, pipelineId: 12 }, { ...valid, expectedUpdatedAt: "yesterday" }]) {
    assert.deepEqual(await action.changeItemPipeline("mine", raw as typeof valid), { success: false, error: "Invalid pipeline change request." });
  }
  assert.equal(calls, 0);
  assert.deepEqual(await action.changeItemPipeline("mine", valid), { success: false, error: "The board changed. Refresh and try again." });
  assert.equal(refreshed.length, 0); reason = null;
  assert.deepEqual(await action.changeItemPipeline("mine", valid), { success: true, data: null });
  assert.deepEqual(refreshed, [["/(app)/p/[slug]", "layout"]]);
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh build exposes only the change mutation", () => assertActions("src/fsd/features/change-item-pipeline/api/change-item-pipeline.server.ts", ["changeItemPipeline"]));
