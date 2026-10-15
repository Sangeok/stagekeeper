import assert from "node:assert/strict";
import { it } from "node:test";
import { savePipelineInputSchema } from "./save-pipeline-input";

const valid = (input: unknown) => savePipelineInputSchema.safeParse(input).success;

it("accepts only a string definition and a version whose next value fits Prisma Int", () => {
  const definition = { steps: ["qa"], gates: [] };
  for (const expectedVersion of [0, 3, 2_147_483_646]) assert.ok(valid({ pipelineId: null, definition, expectedVersion }));
  for (const expectedVersion of [undefined, null, "3", NaN, Infinity, -1, 0.5, 2_147_483_647]) assert.equal(valid({ pipelineId: null, definition, expectedVersion }), false);
  for (const input of [null, undefined, {}, { definition }, { pipelineId: null, definition: null, expectedVersion: 0 }, { pipelineId: null, definition: { steps: [{}], gates: [] }, expectedVersion: 0 }, { pipelineId: null, definition: { steps: [], gates: [null] }, expectedVersion: 0 }]) assert.equal(valid(input), false);
});

it("drops keys the save does not read", () => {
  const parsed = savePipelineInputSchema.parse({ pipelineId: null, definition: { steps: [], gates: [], extra: 1 }, expectedVersion: 0, projectId: "other" });
  assert.deepEqual(parsed, { pipelineId: null, definition: { steps: [], gates: [] }, expectedVersion: 0 });
});
