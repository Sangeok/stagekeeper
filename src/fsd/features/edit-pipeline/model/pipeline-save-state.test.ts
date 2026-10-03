import assert from "node:assert/strict";
import { it } from "node:test";
import { copyLock } from "@/fsd/shared/lib/copy-lock";
import { isSavePipelineInput, PIPELINE_STALE, PIPELINE_UNKNOWN } from "./pipeline-save-state";

it("accepts only a string graph and a version whose next value fits Prisma Int", () => {
  const graph = { nodes: ["propose"], gates: [] };
  for (const expectedVersion of [0, 3, 2_147_483_646]) assert.ok(isSavePipelineInput({ graph, expectedVersion }));
  for (const expectedVersion of [undefined, null, "3", NaN, Infinity, -1, 0.5, 2_147_483_647]) assert.equal(isSavePipelineInput({ graph, expectedVersion }), false);
  for (const input of [null, undefined, {}, { graph }, { graph: null, expectedVersion: 0 }, { graph: { nodes: [{}], gates: [] }, expectedVersion: 0 }, { graph: { nodes: [], gates: [null] }, expectedVersion: 0 }]) assert.equal(isSavePipelineInput(input), false);
});

it("matches the canonical pipeline recovery copy without reusing board refresh messages", () => {
  assert.deepEqual(copyLock("pipeline-save-recovery"), [PIPELINE_STALE, PIPELINE_UNKNOWN, "Discard changes and reload"]);
});
